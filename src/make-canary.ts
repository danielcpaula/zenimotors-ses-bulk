// src/make-canary.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { config as dotenv } from "dotenv";
dotenv();

type Row = { nome: string; email: string };

const PER_DOMAIN = parseInt(process.env.CANARY_PER_DOMAIN || "50", 10);

async function readCsv(file: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const out: Row[] = [];
    fs.createReadStream(file)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (r: any) => {
        const nome = String(r.nome ?? r.Nome ?? r.name ?? "cliente").trim();
        const email = String(r.email ?? r.Email ?? r.E_MAIL_CASA ?? "").trim().toLowerCase();
        if (email) out.push({ nome, email });
      })
      .on("end", () => resolve(out))
      .on("error", reject);
  });
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function writeCsv(pathOut: string, rows: Row[], header = "nome,email\n") {
  await fs.promises.mkdir(path.dirname(pathOut), { recursive: true });
  const body = rows.map(r => `${r.nome.replace(/\n/g,' ')} , ${r.email}`).join("\n");
  await fs.promises.writeFile(pathOut, header + rows.map(r => `${r.nome},${r.email}`).join("\n") + "\n", "utf8");
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: tsx src/make-canary.ts filtered/validos.csv");
    process.exit(1);
  }

  console.log(`📂 Reading: ${input}`);
  const rows = await readCsv(input);

  // group by domain
  const byDomain = new Map<string, Row[]>();
  for (const r of rows) {
    const domain = (r.email.split("@")[1] || "").toLowerCase();
    if (!domain) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(r);
  }

  console.log(`🌐 Domains found: ${byDomain.size}`);
  const canary: Row[] = [];

  for (const [domain, list] of byDomain) {
    const sample = shuffle(list.slice()).slice(0, PER_DOMAIN);
    canary.push(...sample);
  }

  // normalize sets for filtering
  const canarySet = new Set(canary.map(c => c.email.toLowerCase()));

  // build remaining list = original minus canary (preserve order)
  const remaining = rows.filter(r => !canarySet.has(r.email.toLowerCase()));

  // write outputs
  const outDir = "filtered";
  await fs.promises.mkdir(outDir, { recursive: true });
  const canaryPath = path.join(outDir, "canary.csv");
  const remainingPath = path.join(outDir, "validos_minus_canary.csv");

  await writeCsv(canaryPath, canary);
  await writeCsv(remainingPath, remaining);

  console.log(`✅ Canary generated: ${canaryPath} (${canary.length} addresses)`);
  console.log(`✅ Remaining list: ${remainingPath} (${remaining.length} addresses)`);
  console.log("📌 Next steps:");
  console.log(` 1) Send canary: npm run dev:send-bulk ${canaryPath}`);
  console.log(` 2) Monitor bounce/complaint for the canary`);
  console.log(` 3) If ok, send the remaining list: npm run dev:send-bulk ${remainingPath}`);
}

main().catch(e => { console.error("Error:", e); process.exit(1); });