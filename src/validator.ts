// src/validator.ts
import dns from "node:dns/promises";
import fs from "fs";
import { parse } from "csv-parse";
import { format } from "@fast-csv/format";
import { SESv2Client, ListSuppressedDestinationsCommand } from "@aws-sdk/client-sesv2";
import { ENV } from "./env.js";
import type { Contact } from "./types.js";

const ses = new SESv2Client({ region: ENV.AWS_REGION });

function isValidSyntax(email = ""): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function hasMx(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

/** Carrega TODA a Account-level Suppression List da conta SES (BOUNCE/COMPLAINT) */
async function loadSuppressionSet(): Promise<Set<string>> {
  console.log("🔍 Consultando lista de supressão (account-level) do SES...");
  const suppressed = new Set<string>();
  let nextToken: string | undefined;
  let total = 0;

  do {
    const out = await ses.send(
      new ListSuppressedDestinationsCommand({ NextToken: nextToken, PageSize: 1000 })
    );
    for (const d of out.SuppressedDestinationSummaries || []) {
      if (d?.EmailAddress) suppressed.add(d.EmailAddress.toLowerCase());
    }
    total += out.SuppressedDestinationSummaries?.length || 0;
    nextToken = out.NextToken;
  } while (nextToken);

  console.log(`📉 ${total} e-mails na suppression list carregados.`);
  return suppressed;
}

export async function readCsv(path: string): Promise<Contact[]> {
  console.log(`📂 Lendo CSV: ${path}`);
  return new Promise((resolve, reject) => {
    const out: Contact[] = [];
    fs.createReadStream(path)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (row: any) => {
        const nome = String(row.nome ?? row.Nome ?? row.name ?? "cliente").trim();
        const email = String(row.email ?? row.Email ?? row.E_MAIL_CASA ?? "").trim().toLowerCase();
        if (email) out.push({ email, nome });
      })
      .on("end", () => {
        console.log(`✅ Arquivo lido. Total de registros: ${out.length}`);
        resolve(out);
      })
      .on("error", (err) => {
        console.error("❌ Erro ao ler CSV:", err);
        reject(err);
      });
  });
}

async function writeCsv(path: string, rows: any[], headers: string[]) {
  console.log(`💾 Gravando arquivo: ${path}`);
  await fs.promises.mkdir(require("path").dirname(path), { recursive: true });
  const stream = format({ headers });
  const chunks: Buffer[] = [];
  return new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    stream.on("data", (c) => chunks.push(Buffer.from(c)));
    stream.on("end", async () => {
      await fs.promises.writeFile(path, Buffer.concat(chunks), "utf8");
      console.log(`✅ Arquivo salvo: ${path}`);
      resolve();
    });
    for (const r of rows) stream.write(r);
    stream.end();
  });
}

export type Discarded = Contact & { motivo: string };

export async function validateList(
  inputPath: string,
  outValidPath = "filtered/validos.csv",
  outDiscardPath = "filtered/descartados.csv"
): Promise<{ total: number; validos: number; descartados: number }> {
  console.log("🚀 Iniciando processo de validação...");
  const list = await readCsv(inputPath);
  console.log(`📊 Total de contatos carregados: ${list.length}`);

  // 🔴 SUPPRESSION LIST: carregada antes da validação e usada para descartar e-mails bloqueados
  const suppression = await loadSuppressionSet();

  const mxCache = new Map<string, boolean>();
  const seen = new Set<string>();
  const valid: Contact[] = [];
  const discard: Discarded[] = [];

  console.log("🔎 Validando endereço a endereço (sintaxe → MX → suppression → duplicados)...");
  let checked = 0;

  for (const r of list) {
    checked++;
    if (checked % 1000 === 0 || checked === list.length) {
      console.log(`🧮 Processados ${checked}/${list.length} registros...`);
    }

    // 1) Sintaxe
    if (!isValidSyntax(r.email)) {
      discard.push({ ...r, motivo: "sintaxe_invalida" });
      continue;
    }

    // 2) MX do domínio
    const domain = r.email.split("@")[1];
    if (!domain) {
      discard.push({ ...r, motivo: "dominio_ausente" });
      continue;
    }
    let mx = mxCache.get(domain);
    if (mx === undefined) {
      mx = await hasMx(domain);
      mxCache.set(domain, mx);
      console.log(`🌐 Domínio ${domain}: MX ${mx ? "OK" : "NÃO ENCONTRADO"}`);
    }
    if (!mx) {
      discard.push({ ...r, motivo: "dominio_sem_mx" });
      continue;
    }

    // 3) 🔴 SUPPRESSION LIST (REMOVE DO ENVIO)
    if (suppression.has(r.email)) {
      discard.push({ ...r, motivo: "na_account_suppression_list" });
      continue;
    }

    // 4) Duplicados
    if (seen.has(r.email)) {
      discard.push({ ...r, motivo: "duplicado" });
      continue;
    }
    seen.add(r.email);

    // OK
    valid.push({ nome: r.nome, email: r.email });
  }

  console.log("📝 Salvando resultados em pasta 'filtered/'...");
  await writeCsv(outValidPath, valid, ["nome", "email"]);
  await writeCsv(outDiscardPath, discard, ["nome", "email", "motivo"]);

  console.log("✅ Validação concluída!");
  console.log(`✔️ Válidos: ${valid.length}`);
  console.log(`❌ Descartados: ${discard.length}`);
  console.log("📁 Arquivos gerados:");
  console.log(`   - ${outValidPath}`);
  console.log(`   - ${outDiscardPath}`);

  return { total: list.length, validos: valid.length, descartados: discard.length };
}