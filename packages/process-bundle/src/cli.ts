#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { migrateProcessBundleV1ToV2 } from "./migrate.js";
import { validateProcessBundleV2 } from "./validate.js";

const [, , command, inputPath, outputPath] = process.argv;

async function main() {
  if (!command || !inputPath || !["validate", "migrate-v1"].includes(command)) {
    console.error("Uso: process-bundle validate <bundle.zip> | process-bundle migrate-v1 <bundle-v1.zip> <bundle-v2.zip>");
    process.exitCode = 2;
    return;
  }
  const input = await readFile(inputPath);
  if (command === "validate") {
    const report = await validateProcessBundleV2(input);
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (!outputPath) throw new Error("Informe o caminho de saída do bundle v2.");
  const result = await migrateProcessBundleV1ToV2(input, `CLI migration from ${basename(inputPath)}`);
  await writeFile(outputPath, result.bundle);
  console.log(JSON.stringify({ outputPath, warnings: result.warnings }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
