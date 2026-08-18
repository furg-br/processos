import { access, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length < 4 || process.argv.length > 5) { console.error("Uso: node evaluate.mjs resposta-a.json resposta-b.json [relatorio.json]"); process.exit(2); }
const root = dirname(fileURLToPath(import.meta.url));
const packageCandidates = [
  new URL("../../packages/process-bundle/package.json", import.meta.url),
  new URL("../../../packages/process-bundle/package.json", import.meta.url),
];
let packageUrl;
for (const candidate of packageCandidates) {
  try { await access(fileURLToPath(candidate)); packageUrl = candidate; break; } catch { /* tenta o layout do kit */ }
}
if (!packageUrl) throw new Error("Não foi possível localizar as dependências do avaliador no workspace.");
const require = createRequire(packageUrl);
const Ajv2020 = require("ajv/dist/2020").default;
const schema = JSON.parse(await readFile(resolve(root, "result.schema.json"), "utf8"));
const truth = JSON.parse(await readFile(resolve(root, "ground-truth.json"), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const responsePaths = process.argv.slice(2, 4);
const outputPath = process.argv[4] ? resolve(process.argv[4]) : undefined;
const results = await Promise.all(responsePaths.map(async (path) => JSON.parse(await readFile(resolve(path), "utf8"))));
const reports = results.map((result) => {
  const valid = validate(result);
  const serialized = JSON.stringify(result.answers ?? []);
  const found = truth.requiredRefs.filter((ref) => serialized.includes(ref));
  return { agent: result.agent?.id, structurallyValid: valid, schemaErrors: valid ? [] : validate.errors, requiredRefsFound: found.length, requiredRefsTotal: truth.requiredRefs.length, coverage: found.length / truth.requiredRefs.length };
});
const distinctAgents = new Set(results.map((result) => result.agent?.id)).size === 2;
const passed = distinctAgents && reports.every((report) => report.structurallyValid && report.coverage === 1);
const evaluation = { evaluatedAt: new Date().toISOString(), passed, distinctAgents, reports };
if (outputPath) await writeFile(outputPath, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evaluation, null, 2));
process.exitCode = passed ? 0 : 1;
