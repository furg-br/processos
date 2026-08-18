import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { downloadProcessBundle } from "./process-bundle-api.mjs";

const [processId, versionId, requestedOutput] = process.argv.slice(2);
if (!processId || !versionId) {
  throw new Error("Uso: node scripts/export-process-bundle.mjs <processId> <versionId> [arquivo.zip]");
}

const outputPath = resolve(requestedOutput ?? `processo-${processId}-versao-${versionId}.zip`);
const result = await downloadProcessBundle({ processId, versionId });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, result.content);
console.log(JSON.stringify({ processId, versionId, source: result.url, outputPath, bytes: result.content.byteLength }, null, 2));
