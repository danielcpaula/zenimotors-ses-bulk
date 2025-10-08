// src/clean-contacts.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { config as dotenv } from "dotenv";
dotenv();

type Row = { nome: string; email: string };

// ===== Opção: remover hífen do e-mail (NÃO recomendado; hífen é válido) =====
const REMOVE_HYPHEN_IN_EMAIL =
  String(process.env.CLEAN_EMAIL_REMOVE_HYPHEN || "false").toLowerCase() === "true";

// Limpa nome: remove acentos, caracteres especiais indesejados, normaliza espaços, tira tabs/espacos das pontas
function cleanName(name: string): string {
  return String(name || "")
    .replace(/^\s+/, "")               // remove espaços/tabs no começo da célula
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s.-]/g, "")         // só letras/números/espaço/ponto/hífen
    .replace(/_/g, "")                 // tira underscore do nome
    .replace(/\s+/g, " ")              // compacta espaços
    .replace(/-{2,}/g, "-")            // compacta múltiplos hífens
    .trim();
}

// Limpa e-mail: trim/lowercase; NÃO remove hífen/underscore (válidos)
// Remove apenas espaços e caracteres inválidos evidentes
function cleanEmail(email: string): string {
  let e = String(email || "")
    .trim()
    .toLowerCase()
    .replace(/^"+|"+$/g, "") // tira aspas nas pontas
    .replace(/\s+/g, "");    // remove espaços internos

  if (REMOVE_HYPHEN_IN_EMAIL) e = e.replace(/-+/g, "");

  // mantém @ . + - _ e alfanuméricos; remove o resto
  e = e.replace(/[^\w@.+\-]/g, "");
  return e;
}

async function readCsv(filePath: string): Promise<Row[]> {
  // remove BOM se existir
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  // sobrescreve sem BOM (em memória)
  fs.writeFileSync(filePath, raw, "utf8");

  return new Promise((resolve, reject) => {
    const out: Row[] = [];
    let headers: string[] | null = null;

    fs.createReadStream(filePath)
      .pipe(
        parse({
          delimiter: ",",          // seu arquivo usa vírgula
          columns: false,          // vamos mapear manualmente (para lidar com cabeçalho variado)
          relax_quotes: true,
          relax_column_count: true,
          trim: false,             // não trime aqui; fazemos nós mesmos
          skip_empty_lines: true,
        })
      )
      .on("data", (row: string[]) => {
        if (!headers) {
          // primeira linha é o cabeçalho; tira aspas e espaços extras
          headers = row.map(h => String(h || "").replace(/^"+|"+$/g, "").trim());
          return;
        }

        // mapeia índices de email/nome a partir do header real ("nome","E_MAIL_CASA")
        const lowered = headers.map(h => h.toLowerCase());
        let emailIdx = lowered.findIndex(h => h.includes("mail")); // "E_MAIL_CASA" cai aqui
        if (emailIdx === -1) emailIdx = 1; // fallback: segunda coluna
        let nameIdx = lowered.findIndex(h => h === "nome" || h === "name");
        if (nameIdx === -1) nameIdx = emailIdx > 0 ? emailIdx - 1 : 0;

        const nomeRaw = row[nameIdx] ?? "cliente";
        let emailRaw = row[emailIdx] ?? "";

        // fallback: se a célula de e-mail não tem "@", tenta localizar na própria linha
        if (!String(emailRaw).includes("@")) {
          const guess = row.find(c => String(c).includes("@"));
          if (guess) emailRaw = String(guess);
        }

        const nome = cleanName(String(nomeRaw));
        const email = cleanEmail(String(emailRaw));

        // DESCARTA: nome vazio OU começando com ".", "-" ou dígito
        if (!nome || /^[.\-\d]/.test(nome)) return;
        if (!email || !email.includes("@")) return;

        out.push({ nome, email });
      })
      .on("end", () => resolve(out))
      .on("error", reject);
  });
}

async function writeCsv(filePath: string, rows: Row[]) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const header = "nome,email\n";
  const body = rows.map(r => `${r.nome},${r.email}`).join("\n");
  await fs.promises.writeFile(filePath, header + body + "\n", "utf8");
  console.log(`💾 Gerado: ${filePath} (${rows.length} registros)`);
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: tsx src/clean-contacts.ts caminho/do/arquivo.csv");
    process.exit(1);
  }

  console.log(`📂 Limpando: ${input}`);
  const rows = await readCsv(input);

  // Remove duplicados por e-mail (preservando a primeira ocorrência)
  const seen = new Set<string>();
  const dedup: Row[] = [];
  for (const r of rows) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    dedup.push(r);
  }

  const baseName = path.basename(input, path.extname(input)); // ex.: contatos
  const outputDir = "cleaned";
  const outputPath = path.join(outputDir, `${baseName}_clean.csv`);
  await writeCsv(outputPath, dedup);

  console.log("\n✅ Limpeza concluída!");
  console.log(`📊 Total lido: ${rows.length}`);
  console.log(`🧹 Duplicados removidos: ${rows.length - dedup.length}`);
  console.log(`📁 Arquivo final: ${outputPath}\n`);
}

main().catch(e => {
  console.error("❌ Erro na limpeza:", e);
  process.exit(1);
});