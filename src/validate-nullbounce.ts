// src/validate-nullbounce.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
// usando fetch nativo do Node 18+
import { config as dotenv } from "dotenv";
dotenv();

type Row = { nome: string; email: string };

const API_KEY = process.env.NULLBOUNCE_API_KEY || "";
const CONCURRENCY = parseInt(process.env.NB_CONCURRENCY || "5", 10);
const ACCEPT_RISKY = String(process.env.NB_ACCEPT_RISKY || "false").toLowerCase() === "true";

if (!API_KEY) {
  console.error("❌ Defina NULLBOUNCE_API_KEY no .env");
  process.exit(1);
}

const NB_VALIDATE_URL = "https://app.nullbounce.com/api/v1/validation_history/validate/";
const NB_BALANCE_URL  = "https://app.nullbounce.com/api/v1/balance_changes/current_balance/";

async function checkBalance(): Promise<number> {
  const r = await fetch(NB_BALANCE_URL, {
    method: "GET",
    headers: { Authorization: `Token ${API_KEY}` }
  });
  if (!r.ok) throw new Error(`NullBounce balance error: ${r.status} ${await r.text()}`);
  const txt = await r.text();
  const num = Number(txt.trim());
  if (Number.isNaN(num)) {
    console.warn("⚠️ Resposta de saldo inesperada:", txt);
    return 0;
  }
  return num;
}

async function validateEmail(email: string) {
  const r = await fetch(NB_VALIDATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });

  if (!r.ok) {
    const errTxt = await r.text();
    throw new Error(`NullBounce validate error ${r.status}: ${errTxt}`);
  }
  // Exemplo de payload retornado pela NullBounce
  return r.json() as Promise<{
    email: string;
    result: "Safe" | "Invalid" | "Risky" | "Unknown";
    status_text?: string;
    substatus_text?: string;
    is_disposable?: boolean;
    is_role?: boolean;
    is_free?: boolean;
  }>;
}

function readCsv(file: string): Promise<Row[]> {
  console.log(`📂 Lendo CSV: ${file}`);
  return new Promise((resolve, reject) => {
    const out: Row[] = [];
    fs.createReadStream(file)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (r: any) => {
        const nome = String(r.nome ?? r.Nome ?? r.name ?? "cliente").trim();
        const email = String(r.email ?? r.Email ?? r.E_MAIL_CASA ?? "").trim().toLowerCase();
        if (email) out.push({ nome, email });
      })
      .on("end", () => {
        console.log(`✅ CSV carregado. ${out.length} linhas.`);
        resolve(out);
      })
      .on("error", reject);
  });
}

async function writeCsv(pathOut: string, header: string[], rows: (string | number | boolean)[][]) {
  await fs.promises.mkdir(path.dirname(pathOut), { recursive: true });
  const content = [header.join(","), ...rows.map(r => r.map(v => String(v ?? "")).join(","))].join("\n") + "\n";
  await fs.promises.writeFile(pathOut, content, "utf8");
  console.log(`💾 Gravado: ${pathOut} (${rows.length} linhas)`);
}

// pool simples de concorrência
async function mapPool<T, R>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let i = 0;
  const runners: Promise<void>[] = [];
  async function run() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      try {
        ret[idx] = await worker(items[idx], idx);
        if (idx % 250 === 0) console.log(`🧮 Processados ${idx}/${items.length}`);
      } catch (e: any) {
        console.error(`❌ Erro ao validar índice ${idx}:`, e?.message || e);
        // marca a falha de requisição para tratamento posterior
        // @ts-ignore
        ret[idx] = { error: e?.message || "api_error" };
      }
    }
  }
  for (let k = 0; k < Math.max(1, limit); k++) runners.push(run());
  await Promise.all(runners);
  return ret;
}

function decideValidity(entry: any): { ok: boolean; motivo: string } {
  const result = entry?.result as string;
  const status = (entry?.status_text as string) || "";
  const sub    = (entry?.substatus_text as string) || "";
  // Válido: “Safe” (ou “Risky” se permitido)
  const ok = result === "Safe" || (ACCEPT_RISKY && result === "Risky");
  const motivo = [result, status, sub].filter(Boolean).join("|");
  return { ok, motivo };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: tsx src/validate-nullbounce.ts caminho/do/arquivo.csv");
    process.exit(1);
  }

  // Prefixo para os arquivos de saída (usa o nome do arquivo de entrada)
  const base = path.basename(input, path.extname(input)); // ex: contatos_1
  const outDir = "filtered";
  const okPath    = path.join(outDir, `${base}_validos_nullbounce.csv`);
  const badPath   = path.join(outDir, `${base}_descartados_nullbounce.csv`);
  const failPath  = path.join(outDir, `${base}_falhas_nullbounce.csv`); // << NOVO
  const fullPath  = path.join(outDir, `${base}_nullbounce_full_report.csv`);

  // 1) saldo
  console.log("💳 Checando saldo de créditos na NullBounce...");
  const balance = await checkBalance();
  console.log(`💰 Créditos disponíveis: ${balance}`);

  // 2) lê CSV
  const rows = await readCsv(input);
  if (rows.length === 0) {
    console.log("⚠️ Nada para validar.");
    return;
  }

  // 3) valida em pool
  console.log(`🚀 Iniciando validação na NullBounce com CONCURRENCY = ${CONCURRENCY} ...`);
  const results = await mapPool(rows, CONCURRENCY, async (r) => {
    const resp = await validateEmail(r.email);
    return { row: r, resp };
  });

  // 4) separa VÁLIDOS / DESCARTADOS / FALHAS e gera relatório completo
  const valid: Row[] = [];
  const discard: (Row & { motivo: string })[] = [];
  const failures: (Row & { erro: string })[] = []; // << NOVO
  const full: (Row & {
    result?: string; status_text?: string; substatus_text?: string;
    is_disposable?: boolean; is_role?: boolean; is_free?: boolean;
  })[] = [];

  results.forEach((item: any, idx: number) => {
    const r = item?.row as Row | undefined;
    const resp = item?.resp as any;
    if (!r) return; // segurança

    // Falha de requisição/serviço → NÃO entra em válidos/descartados
    if (!resp || item?.error) {
      const erroMsg = item?.error || "api_error";
      failures.push({ ...r, erro: erroMsg });
      full.push({ ...r, result: "Error", status_text: "API Error", substatus_text: erroMsg });
      return;
    }

    const { ok, motivo } = decideValidity(resp);
    if (ok) valid.push(r);
    else discard.push({ ...r, motivo });

    full.push({
      ...r,
      result: resp.result,
      status_text: resp.status_text,
      substatus_text: resp.substatus_text,
      is_disposable: resp.is_disposable,
      is_role: resp.is_role,
      is_free: resp.is_free
    });
  });

  // 5) grava saídas (três arquivos principais + full report)
  await writeCsv(okPath,  ["nome", "email"], valid.map(v => [v.nome, v.email]));
  await writeCsv(badPath, ["nome", "email", "motivo"], discard.map(d => [d.nome, d.email, d.motivo]));
  await writeCsv(failPath, ["nome", "email", "erro"], failures.map(f => [f.nome, f.email, f.erro])); // << NOVO
  await writeCsv(
    fullPath,
    ["nome","email","result","status_text","substatus_text","is_disposable","is_role","is_free"],
    full.map(f => [f.nome, f.email, f.result || "", f.status_text || "", f.substatus_text || "", !!f.is_disposable, !!f.is_role, !!f.is_free])
  );

  console.log("✅ Validação concluída com NullBounce.");
  console.log(`✔️ Válidos: ${valid.length}`);
  console.log(`❌ Descartados: ${discard.length}`);
  console.log(`⛔ Falhas (API/rede): ${failures.length}`);
  console.log("📁 Arquivos gerados:");
  console.log(`   ${okPath}`);
  console.log(`   ${badPath}`);
  console.log(`   ${failPath}`);
  console.log(`   ${fullPath}`);
}

main().catch(e => { console.error("❌ Falha geral:", e); process.exit(1); });