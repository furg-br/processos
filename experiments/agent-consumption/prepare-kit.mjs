import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const experimentRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(experimentRoot, "../..");
const outputRoot = resolve(process.argv[2] ?? resolve(workspaceRoot, "artifacts/agent-pilot-kit"));
const bundlePath = resolve(workspaceRoot, "artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip");
const sharedFiles = [
  [resolve(experimentRoot, "task.json"), "task.json"],
  [resolve(experimentRoot, "result.schema.json"), "result.schema.json"],
  [bundlePath, "rsc-as-is.process-bundle-v2.zip"],
];

const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
for (const agent of ["agent-a", "agent-b"]) {
  const target = resolve(outputRoot, agent);
  await mkdir(target, { recursive: true });
  for (const [source, name] of sharedFiles) await cp(source, resolve(target, name));
  await writeFile(resolve(target, "INSTRUCOES.txt"), [
    "Entregue esta pasta a um único agente sem fornecer contexto adicional ou o diretório reviewer-only.",
    "A resposta deve ser somente um JSON válido conforme result.schema.json.",
    `Use um agent.id estável e distinto do agente recebido na outra pasta (${agent}).`,
    "Não corrija a resposta manualmente.",
    "",
  ].join("\n"), "utf8");
}

const reviewer = resolve(outputRoot, "reviewer-only");
await mkdir(reviewer, { recursive: true });
await cp(resolve(experimentRoot, "evaluate.mjs"), resolve(reviewer, "evaluate.mjs"));
await cp(resolve(experimentRoot, "ground-truth.json"), resolve(reviewer, "ground-truth.json"));
await cp(resolve(experimentRoot, "result.schema.json"), resolve(reviewer, "result.schema.json"));
const manifest = {
  generatedAt: new Date().toISOString(),
  contractVersion: "processos.furg.br/v2",
  bundleSha256: await sha256(bundlePath),
  agentPackages: ["agent-a", "agent-b"],
  reviewerOnly: "reviewer-only",
  warning: "Nunca entregue reviewer-only aos agentes participantes.",
};
await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputRoot, ...manifest }, null, 2));
