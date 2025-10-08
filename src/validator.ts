// src/validator.ts
import fs from "fs";
import path from "path";
import dns from "dns";
import { parse } from "csv-parse";
import { config as dotenv } from "dotenv";
import * as punycode from "punycode";
dotenv();

type Row = { nome: string; email: string };

// =======================
// Configurações via .env
// =======================
const DNS_TIMEOUT_MS = parseInt(process.env.DNS_TIMEOUT_MS || "4000", 10);
const DNS_RETRIES    = parseInt(process.env.DNS_RETRIES || "2", 10);
const STRICT_MX      = String(process.env.STRICT_MX || "true").toLowerCase() === "true";
// Ex.: "8.8.8.8,1.1.1.1"
const DNS_RESOLVERS  = (process.env.DNS_RESOLVERS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (DNS_RESOLVERS.length > 0) {
  dns.setServers(DNS_RESOLVERS);
  console.log("🧭 Usando DNS resolvers:", DNS_RESOLVERS.join(", "));
}
console.log(`⚙️ STRICT_MX=${STRICT_MX} | TIMEOUT=${DNS_TIMEOUT_MS}ms | RETRIES=${DNS_RETRIES}`);

// =======================
// Utilitários
// =======================
function isValidEmailSyntax(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function toAsciiDomain(domain: string): string {
  try {
    return punycode.toASCII(domain.trim().toLowerCase());
  } catch {
    return domain.trim().toLowerCase();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("DNS_TIMEOUT")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
  });
}

async function resolveMx(domain: string) {
  return withTimeout(dns.promises.resolveMx(domain), DNS_TIMEOUT_MS);
}
async function resolveAnyA(domain: string) {
  try { return await withTimeout(dns.promises.resolve4(domain), DNS_TIMEOUT_MS); }
  catch { /* ignore */ }
  return withTimeout(dns.promises.resolve6(domain), DNS_TIMEOUT_MS);
}

// Cache por domínio (precisão + menos reconsultas)
type DomainResult = { ok: boolean; via: "MX" | "A/AAAA" | "NONE"; err?: string };
const domainCache = new Map<string, DomainResult>();

/**
 * Verifica se o domínio tem rota de e-mail:
 * - STRICT_MX = true  → exige MX
 * - STRICT_MX = false → aceita MX ou (fallback) A/AAAA
 * Com retries, timeout e logs detalhados.
 */
async function hasMailRoute(domainRaw: string): Promise<DomainResult> {
  const domain = toAsciiDomain(domainRaw);
  const cached = domainCache.get(domain);
  if (cached) {
    console.log(`🗂️  Cache DNS → ${domain}: ${cached.via}`);
    return cached;
  }

  let lastErr: any;
  console.log(`🔎 Verificando domínio: ${domain} (STRICT_MX=${STRICT_MX})`);

  for (let attempt = 1; attempt <= DNS_RETRIES + 1; attempt++) {
    console.log(`🧭 Tentativa ${attempt}/${DNS_RETRIES + 1} → MX ${domain}`);
    try {
      const mx = await resolveMx(domain);
      if (Array.isArray(mx) && mx.length > 0) {
        const res: DomainResult = { ok: true, via: "MX" };
        domainCache.set(domain, res);
        console.log(`✅ MX OK ${domain}: ${mx.map(m => m.exchange).join(", ")}`);
        return res;
      } else {
        console.log(`⚠️  Sem registros MX em ${domain} (tentativa ${attempt})`);
      }
    } catch (e) {
      lastErr = e;
      console.log(`❌ Erro MX ${domain}:`, e instanceof Error ? e.message : e);
    }

    if (!STRICT_MX) {
      console.log(`🧭 Tentativa ${attempt}/${DNS_RETRIES + 1} → A/AAAA ${domain}`);
      try {
        const a = await resolveAnyA(domain);
        if (Array.isArray(a) && a.length > 0) {
          const res: DomainResult = { ok: true, via: "A/AAAA" };
          domainCache.set(domain, res);
          console.log(`✅ Fallback A/AAAA OK ${domain}: ${a.join(", ")}`);
          return res;
        } else {
          console.log(`⚠️  Sem registros A/AAAA em ${domain} (tentativa ${attempt})`);
        }
      } catch (e) {
        lastErr = e;
        console.log(`❌ Erro A/AAAA ${domain}:`, e instanceof Error ? e.message : e);
      }
    }

    if (attempt <= DNS_RETRIES) console.log(`⏳ Retentando ${domain}...\n`);
  }

  const fail: DomainResult = { ok: false, via: "NONE", err: lastErr?.message || String(lastErr || "") };
  domainCache.set(domain, fail);
  console.log(`🚫 Falha final ${domain}: ${fail.err}`);
  return fail;
}

// =======================
// IO CSV
// =======================
async function readCsv(filePath: string): Promise<Row[]> {
  console.log(`📂 Lendo arquivo: ${filePath}`);
  return new Promise((resolve, reject) => {
    const out: Row[] = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
      .on("data", (r: any) => {
        const nome  = String(r.nome ?? r.Nome ?? r.name ?? "cliente").trim();
        const email = String(r.email ?? r.Email ?? r.E_MAIL_CASA ?? "").trim().toLowerCase();
        if (email) out.push({ nome, email });
      })
      .on("end", () => {
        console.log(`✅ Arquivo carregado (${out.length} registros).`);
        resolve(out);
      })
      .on("error", reject);
  });
}

async function writeCsv(filePath: string, header: string[], rows: (string | number | boolean)[][]) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const content = [header.join(","), ...rows.map(r => r.map(v => String(v ?? "")).join(","))].join("\n") + "\n";
  await fs.promises.writeFile(filePath, content, "utf8");
  console.log(`💾 Arquivo salvo: ${filePath} (${rows.length} registros)`);
}

// =======================
// Validação principal
// =======================
export async function validateList(rows: Row[]) {
  const valid: Row[] = [];
  const invalid: (Row & { motivo: string })[] = [];

  const total = rows.length;
  let checked = 0;

  for (const r of rows) {
    checked++;
    const email = r.email;

    // Progresso simples: a cada 100 linhas ou na última
    if (checked % 100 === 0 || checked === total) {
      const pct = ((checked / total) * 100).toFixed(1);
      console.log(`🧮 Progresso: ${checked}/${total} (${pct}%)`);
    }

    // 1) Sintaxe
    if (!isValidEmailSyntax(email)) {
      invalid.push({ ...r, motivo: "Sintaxe inválida" });
      continue;
    }

    // 2) Domínio
    const rawDomain = (email.split("@")[1] || "")
      .replace(/[>\s,;]+$/g, "")   // remove pontuação solta ao final
      .replace(/^\s*[<]+/g, "");   // remove < iniciais, se houver
    const domain = toAsciiDomain(rawDomain);

    const res = await hasMailRoute(domain);
    if (res.ok) {
      valid.push(r); // pronto para NullBounce (nome,email)
    } else {
      invalid.push({ ...r, motivo: STRICT_MX ? "Sem MX" : `Sem MX/A: ${res.err || "not_resolvable"}` });
    }
  }

  return { valid, invalid };
}

// =======================
// CLI
// =======================
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: tsx src/validator.ts caminho/do/arquivo.csv");
    process.exit(1);
  }

  console.log("🚀 Iniciando validação local (precisa e com logs)...");
  const rows = await readCsv(input);

  // Dedup por e-mail (mantém a última ocorrência)
  const map = new Map<string, Row>();
  for (const r of rows) map.set(r.email, r);
  const unique = Array.from(map.values());
  console.log(`🧹 Duplicados removidos: ${rows.length - unique.length}`);

  const { valid, invalid } = await validateList(unique);

  const outDir = "validated";
  const base = path.basename(input, path.extname(input));
  const validosPath = path.join(outDir, `${base}_validos.csv`);
  const descartadosPath = path.join(outDir, `${base}_descartados.csv`);

  await writeCsv(
    validosPath,
    ["nome", "email"],
    valid.map(v => [v.nome, v.email])
  );
  await writeCsv(
    descartadosPath,
    ["nome", "email", "motivo"],
    invalid.map(d => [d.nome, d.email, d.motivo])
  );

  console.log("\n✅ Validação concluída!");
  console.log(`✔️ Válidos (para NullBounce): ${valid.length}`);
  console.log(`❌ Descartados: ${invalid.length}`);
  console.log("📁 Arquivos:");
  console.log(`   ${validosPath}`);
  console.log(`   ${descartadosPath}\n`);
}

main().catch(e => {
  console.error("❌ Erro geral:", e);
  process.exit(1);
});