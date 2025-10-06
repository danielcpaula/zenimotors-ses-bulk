import fs from "fs";
import path from "path";
import { config as dotenv } from "dotenv";
dotenv(); // Carrega variáveis do .env

/**
 * Divide um CSV de contatos (nome,email) em múltiplos arquivos de tamanho configurável.
 * Variável de ambiente: MAX_PER_FILE (padrão = 5000)
 * Uso: tsx src/split-contacts.ts caminho/do/arquivo.csv
 */

const MAX_PER_FILE = parseInt(process.env.MAX_PER_FILE || "5000", 10);

async function splitCsv(inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    console.error("❌ Arquivo não encontrado:", inputPath);
    process.exit(1);
  }

  console.log(`📂 Lendo arquivo CSV: ${inputPath}`);
  const content = fs.readFileSync(inputPath, "utf8").split("\n").filter(Boolean);
  const header = content[0];
  const rows = content.slice(1);

  console.log(`✅ Total de registros lidos: ${rows.length}`);
  console.log(`🚀 Iniciando divisão em lotes de até ${MAX_PER_FILE} contatos...`);

  const outputDir = "filtered";
  await fs.promises.mkdir(outputDir, { recursive: true });

  let fileCount = 0;
  for (let i = 0; i < rows.length; i += MAX_PER_FILE) {
    fileCount++;
    const chunk = rows.slice(i, i + MAX_PER_FILE);
    const outFile = path.join(outputDir, `contato_${fileCount}.csv`);
    fs.writeFileSync(outFile, [header, ...chunk].join("\n"));
    console.log(`📄 Gerado: ${outFile} (${chunk.length} registros)`);
  }

  console.log(`✅ Divisão concluída: ${fileCount} arquivos criados em '${outputDir}/'`);
}

(async () => {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: tsx src/split-contacts.ts caminho/do/arquivo.csv");
    process.exit(1);
  }
  await splitCsv(input);
})();