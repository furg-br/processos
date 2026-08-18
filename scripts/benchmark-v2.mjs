import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateProcessBundleV2 } from "../packages/process-bundle/dist/index.js";

const requestedInput = process.argv[2] ?? process.env.PROCESS_BUNDLE_INPUT;
if (!requestedInput) throw new Error("Informe o caminho ou a URL de exportação da API em PROCESS_BUNDLE_INPUT.");
const inputSource = /^https?:\/\//i.test(requestedInput) ? requestedInput : resolve(requestedInput);
const outputPath = resolve(process.argv[3] ?? "artifacts/v2-validation-benchmark.json");
const iterations = Number.parseInt(process.argv[4] ?? "25", 10);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 500) {
  throw new Error("Informe entre 1 e 500 iterações.");
}

const response = /^https?:\/\//i.test(inputSource) ? await fetch(inputSource, { headers: process.env.PROCESSOS_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.PROCESSOS_ACCESS_TOKEN}` } : undefined }) : undefined;
if (response && !response.ok) throw new Error(`A API recusou a exportação usada no benchmark (${response.status}).`);
const input = response ? Buffer.from(await response.arrayBuffer()) : await readFile(inputSource);
const samplesMs = [];
let lastReport;
for (let index = 0; index < iterations; index += 1) {
  const startedAt = performance.now();
  lastReport = await validateProcessBundleV2(input);
  samplesMs.push(performance.now() - startedAt);
  if (!lastReport.valid) throw new Error(`O fixture falhou na iteração ${index + 1}.`);
}

const ordered = [...samplesMs].sort((left, right) => left - right);
const percentile = (value) => ordered[Math.min(ordered.length - 1, Math.ceil(value * ordered.length) - 1)];
const report = {
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  input: { source: inputSource, bytes: input.byteLength, profile: lastReport?.manifest?.profile },
  iterations,
  milliseconds: {
    min: Number(ordered[0].toFixed(2)),
    median: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    max: Number(ordered.at(-1).toFixed(2)),
    average: Number((samplesMs.reduce((sum, sample) => sum + sample, 0) / iterations).toFixed(2)),
  },
  valid: lastReport?.valid === true,
  issueCount: lastReport?.issues.length ?? 0,
  note: "Medição local de referência; não é um SLA e deve ser repetida no hardware de produção.",
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
