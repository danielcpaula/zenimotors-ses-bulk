import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { config as dotenv } from "dotenv";
dotenv();

type Row = { nome: string; email: string };

// Tamanho do lote (padrão 5000). Pode sobrescrever via 2º argumento CLI ou .env MAX_PER_FILE
const ARG_MAX = parseInt(process.argv[3] || "", 10);
const MAX_PER_FILE = Number.isFinite(ARG_MAX)
  ? ARG_MAX
  : parseInt(process.env.MAX_PER_FILE || "5000", 10);

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: tsx src/split-contacts.ts caminho/do/arquivo.csv [max_por_arquivo]");
    console.error("Ex.:  tsx src/split-contacts.ts validated/contatos_validos.csv 5000");
    process.exit(1);
  }

  const outDir = "splits";
  await fs.promises.mkdir(outDir, { recursive: true });

  // Definição do prefixo: se terminar com _validos, removemos para nomes mais limpos
  const baseName = path.basename(input, path.extname(input)); // ex: contatos_validos
  const prefix = baseName.endsWith("_validos")
    ? baseName.slice(0, -"_validos".length)
    : baseName; // ex: contatos

  console.log(`📂 Lendo: ${input}`);
  console.log(`✂️  Dividindo em blocos de até ${MAX_PER_FILE} registros por arquivo...`);

  let fileIndex = 0;
  let rowIndexInCurrent = 0;
  let total = 0;
  let writer: fs.WriteStream | null = null;

  const openNewFile = () => {
    if (writer) writer.end();
    fileIndex += 1;
    rowIndexInCurrent = 0;
    const outPath = path.join(outDir, `${prefix}_${fileIndex}.csv`);
    writer = fs.createWriteStream(outPath, { encoding: "utf8" });
    writer.write("nome,email\n"); // cabeçalho fixo
    console.log(`💾 Criado: ${outPath}`);
  };

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(input)
      .pipe(parse({
        columns: true,          // espera cabeçalho
        trim: true,
        skip_empty_lines: true,
      }))
      .on("data", (r: any) => {
        const nome = String(r.nome ?? r.Nome ?? r.name ?? "cliente").trim();
        const email = String(r.email ?? r.Email ?? r.E_MAIL_CASA ?? "").trim();

        if (!writer || rowIndexInCurrent >= MAX_PER_FILE) {
          openNewFile();
        }

        // grava linha
        writer!.write(`${nome},${email}\n`);
        rowIndexInCurrent++;
        total++;

        if (total % 5000 === 0) {
          console.log(`🧮 Progresso: ${total} linhas processadas...`);
        }
      })
      .on("end", () => {
        if (writer) writer.end();
        console.log(`\n✅ Concluído! Total: ${total} registros`);
        console.log(`📁 Saída: ${outDir}/${prefix}_1.csv ... ${outDir}/${prefix}_${fileIndex}.csv`);
        resolve();
      })
      .on("error", reject);
  });
}

main().catch((e) => {
  console.error("❌ Erro no split:", e);
  process.exit(1);
});