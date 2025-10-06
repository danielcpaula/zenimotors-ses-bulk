// src/validate-csv.ts
import { validateList } from "./validator.js";

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Uso: tsx src/validate-csv.ts data/arquivo.csv");
    process.exit(1);
  }
  const outValid = "reports/validos.csv";
  const outDiscard = "reports/descartados.csv";
  const stats = await validateList(input, outValid, outDiscard);
  console.log("✅ Validação concluída:");
  console.log(`- Total:        ${stats.total}`);
  console.log(`- Válidos:      ${stats.validos}  -> ${outValid}`);
  console.log(`- Descartados:  ${stats.descartados}  -> ${outDiscard}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});