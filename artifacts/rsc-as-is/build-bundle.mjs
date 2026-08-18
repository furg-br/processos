import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractBpmnOutline, validateBpmnXml } from "../../packages/bpmn-extension/dist/index.js";
import { processBundleManifestSchema, processBundleMetadataSchema } from "../../packages/contracts/dist/index.js";

const require = createRequire(import.meta.url);
const JSZip = require("../../apps/api/node_modules/jszip");
const root = dirname(fileURLToPath(import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const bpmnXml = await readFile(resolve(root, "process.bpmn"), "utf8");
const issues = validateBpmnXml(bpmnXml);
if (issues.some((issue) => issue.severity === "error")) {
  throw new Error(`BPMN inválido: ${JSON.stringify(issues)}`);
}

const schemaFiles = [
  { file: "schemas/rsc-pedido.v1.schema.json", id: "21000000-0000-4000-8000-000000000001", assetId: "20000000-0000-4000-8000-000000000001", name: "Pedido de RSC-PCCTAE" },
  { file: "schemas/rsc-item-evidencia.v1.schema.json", id: "21000000-0000-4000-8000-000000000002", assetId: "20000000-0000-4000-8000-000000000002", name: "Item e comprovante do pedido de RSC" },
  { file: "schemas/rsc-diligencia.v1.schema.json", id: "21000000-0000-4000-8000-000000000003", assetId: "20000000-0000-4000-8000-000000000003", name: "Diligência seletiva do RSC" },
  { file: "schemas/rsc-parecer.v1.schema.json", id: "21000000-0000-4000-8000-000000000004", assetId: "20000000-0000-4000-8000-000000000004", name: "Parecer da Comissão RSC" },
  { file: "schemas/rsc-dossie-envio-sei.v1.schema.json", id: "21000000-0000-4000-8000-000000000005", assetId: "20000000-0000-4000-8000-000000000005", name: "Dossiê final e envio do RSC ao SEI" }
];
const schemas = Object.fromEntries(await Promise.all(schemaFiles.map(async (item) => [item.file, await readJson(item.file)])));
const schemaIds = Object.fromEntries(schemaFiles.map((item) => [item.file, item.id]));
const softwareCatalog = await readJson("software-catalog.json");
const operationIds = Object.fromEntries(softwareCatalog.operations.map((operation) => [operation.operationId, operation.id]));

const elementMappings = {
  Activity_Instruct: {
    role: "Servidor requerente",
    operations: ["rsc.criarRascunho", "rsc.salvarRascunho", "rsc.incluirItem", "rsc.alterarItem", "rsc.excluirItem", "rsc.excluirComprovante"],
    data: [["schemas/rsc-pedido.v1.schema.json", "INPUT"], ["schemas/rsc-pedido.v1.schema.json", "OUTPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "INPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "OUTPUT"]]
  },
  Activity_Submit: {
    role: "Servidor requerente",
    operations: ["rsc.enviarParaAvaliacao"],
    data: [["schemas/rsc-pedido.v1.schema.json", "INPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "INPUT"], ["schemas/rsc-pedido.v1.schema.json", "OUTPUT"]]
  },
  Activity_Protocol: {
    role: "Sistema RSC",
    operations: ["rsc.enviarParaAvaliacao"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-pedido.v1.schema.json", "INPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "INPUT"], ["schemas/rsc-pedido.v1.schema.json", "OUTPUT"]]
  },
  Activity_Assign: {
    role: "Comissão RSC",
    operations: ["rsc.abrirPedidoComissao", "rsc.atribuirResponsavel"],
    data: [["schemas/rsc-pedido.v1.schema.json", "INPUT"], ["schemas/rsc-pedido.v1.schema.json", "OUTPUT"]]
  },
  Activity_Analyze: {
    role: "Comissão RSC - responsável atribuído",
    operations: ["rsc.analisarItem", "rsc.analisarItensSelecionados"],
    data: [["schemas/rsc-item-evidencia.v1.schema.json", "INPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "OUTPUT"], ["schemas/rsc-parecer.v1.schema.json", "OUTPUT"]]
  },
  Activity_OpenDiligence: {
    role: "Comissão RSC",
    operations: ["rsc.abrirDiligenciaSeletiva"],
    data: [["schemas/rsc-diligencia.v1.schema.json", "OUTPUT"]]
  },
  Activity_RecordDiligence: {
    role: "Sistema RSC",
    operations: ["rsc.abrirDiligenciaSeletiva"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-diligencia.v1.schema.json", "OUTPUT"]]
  },
  Activity_RespondDiligence: {
    role: "Servidor requerente",
    operations: ["rsc.responderDiligencia"],
    data: [["schemas/rsc-diligencia.v1.schema.json", "INPUT"], ["schemas/rsc-pedido.v1.schema.json", "OUTPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "OUTPUT"]]
  },
  Activity_ValidateResponse: {
    role: "Sistema RSC",
    operations: ["rsc.responderDiligencia"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-diligencia.v1.schema.json", "OUTPUT"], ["schemas/rsc-pedido.v1.schema.json", "OUTPUT"]]
  },
  Activity_AutoDeny: {
    role: "Processamento automático",
    operations: ["rsc.indeferirDiligenciasExpiradas"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-diligencia.v1.schema.json", "INPUT"], ["schemas/rsc-parecer.v1.schema.json", "OUTPUT"]]
  },
  Activity_FinalOpinion: {
    role: "Comissão RSC",
    operations: ["rsc.registrarParecerFinal"],
    data: [["schemas/rsc-pedido.v1.schema.json", "INPUT"], ["schemas/rsc-item-evidencia.v1.schema.json", "INPUT"], ["schemas/rsc-parecer.v1.schema.json", "OUTPUT"]]
  },
  Activity_Freeze: {
    role: "Sistema RSC",
    operations: ["rsc.gerarDossieFinal"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-parecer.v1.schema.json", "INPUT"], ["schemas/rsc-dossie-envio-sei.v1.schema.json", "OUTPUT"]]
  },
  Activity_Accompany: {
    role: "Comissão RSC",
    operations: ["rsc.enviarDossieSei"],
    data: [["schemas/rsc-dossie-envio-sei.v1.schema.json", "INPUT"]]
  },
  Activity_SendSei: {
    role: "Sistema RSC",
    operations: ["rsc.enviarDossieSei"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-dossie-envio-sei.v1.schema.json", "INPUT"], ["schemas/rsc-dossie-envio-sei.v1.schema.json", "OUTPUT"]]
  },
  Activity_ReceiveSei: {
    role: "SEI",
    operations: [],
    data: [["schemas/rsc-dossie-envio-sei.v1.schema.json", "INPUT"]]
  },
  Activity_ConfirmRetry: {
    role: "Comissão RSC",
    operations: ["rsc.enviarDossieSei"],
    data: [["schemas/rsc-dossie-envio-sei.v1.schema.json", "INPUT"]]
  },
  Activity_Retry: {
    role: "Sistema RSC",
    operations: ["rsc.enviarDossieSei"],
    kind: "AUTOMATES",
    data: [["schemas/rsc-dossie-envio-sei.v1.schema.json", "INPUT"], ["schemas/rsc-dossie-envio-sei.v1.schema.json", "OUTPUT"]]
  },
  Activity_RouteProgep: {
    role: "SEI / PROGEP",
    operations: [],
    data: [["schemas/rsc-dossie-envio-sei.v1.schema.json", "INPUT"]]
  }
};

const elements = Object.entries(elementMappings).map(([bpmnElementId, mapping]) => ({
  bpmnElementId,
  role: mapping.role,
  softwareBindings: mapping.operations.map((operation) => ({
    operationId: operationIds[operation],
    kind: mapping.kind ?? "SUPPORTS"
  })),
  dataBindings: mapping.data.map(([schema, direction]) => ({
    informationSchemaId: schemaIds[schema],
    direction
  }))
}));

const exportedAt = "2026-08-16T21:00:00.000Z";
const metadata = {
  schemaVersion: "furg.process/v1",
  process: {
    id: "30000000-0000-4000-8000-000000000001",
    slug: "reconhecimento-saberes-competencias-rsc-pcctae-as-is",
    title: "Reconhecimento de Saberes e Competências - RSC-PCCTAE",
    description: "Processo AS-IS extraído da aplicação RSC do SRH, do requerimento em rascunho à entrega do dossiê final à PROGEP pelo SEI.",
    category: "Gestão de pessoas",
    audience: "Servidores técnico-administrativos em educação, Comissão RSC e PROGEP",
    visibility: "INTERNAL",
    ownerUnit: { acronym: "PROGEP", name: "Pró-Reitoria de Gestão e Desenvolvimento de Pessoas" },
    participantUnits: [
      { acronym: "CRSC", name: "Comissão RSC-PCCTAE" },
      { acronym: "PROGEP", name: "Pró-Reitoria de Gestão e Desenvolvimento de Pessoas" }
    ],
    updatedAt: exportedAt
  },
  version: {
    id: "31000000-0000-4000-8000-000000000001",
    revision: 1,
    perspective: "AS_IS",
    status: "DRAFT",
    createdAt: exportedAt,
    publishedAt: null
  },
  outline: extractBpmnOutline(bpmnXml),
  elements,
  relations: [],
  informationSchemas: schemaFiles.map((item) => ({
    id: item.id,
    assetId: item.assetId,
    name: item.name,
    version: 1,
    visibility: "INTERNAL",
    jsonSchema: schemas[item.file],
    createdAt: exportedAt
  })),
  provenance: {
    exportedBy: "Mapeamento reverso assistido por IA",
    exportedAt,
    source: "CASCA ERP commit 9b7fdce193c2204b4b3ac2a7621bbf4d7e09a271"
  }
};
processBundleMetadataSchema.parse(metadata);

const metadataText = `${JSON.stringify(metadata, null, 2)}\n`;
await writeFile(resolve(root, "metadata.json"), metadataText, "utf8");
const extraFiles = ["application-map.json", "software-catalog.json"];
const files = ["process.bpmn", "metadata.json", ...schemaFiles.map((item) => item.file), ...extraFiles];
const manifest = {
  format: "furg.process-bundle",
  version: "1.0",
  processId: metadata.process.id,
  processVersionId: metadata.version.id,
  exportedAt,
  files,
  contentHash: sha256(bpmnXml + JSON.stringify(metadata))
};
processBundleManifestSchema.parse(manifest);
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(resolve(root, "manifest.json"), manifestText, "utf8");

const zip = new JSZip();
zip.file("process.bpmn", bpmnXml);
zip.file("metadata.json", metadataText);
zip.file("manifest.json", manifestText);
for (const file of [...schemaFiles.map((item) => item.file), ...extraFiles]) {
  zip.file(file, await readFile(resolve(root, file), "utf8"));
}
await writeFile(resolve(root, "rsc-as-is.process-bundle.zip"), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

const [diagramCss, bpmnFontCss, viewerSource] = await Promise.all([
  readFile(resolve(root, "../../apps/web/node_modules/bpmn-js/dist/assets/diagram-js.css"), "utf8"),
  readFile(resolve(root, "../../apps/web/node_modules/bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css"), "utf8"),
  readFile(resolve(root, "../../apps/web/node_modules/bpmn-js/dist/bpmn-navigated-viewer.production.min.js"), "utf8"),
]);
const encodedBpmn = Buffer.from(bpmnXml, "utf8").toString("base64");
const previewHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RSC-PCCTAE - processo AS-IS</title>
    <style>
${diagramCss}
${bpmnFontCss}
      html, body, #canvas { width: 100%; height: 100%; margin: 0; }
      body { background: #f7f8fa; font-family: Arial, sans-serif; }
      #canvas { background: #fff; }
      .djs-container .djs-label { font-family: Arial, sans-serif !important; }
      .error { padding: 2rem; color: #a40000; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div id="canvas" aria-label="Diagrama BPMN do processo RSC-PCCTAE"></div>
    <script>${viewerSource.replaceAll("</script", "<\\/script")}</script>
    <script>
      (async function () {
        try {
          const bytes = Uint8Array.from(atob('${encodedBpmn}'), (character) => character.charCodeAt(0));
          const xml = new TextDecoder().decode(bytes);
          const viewer = new BpmnJS({ container: '#canvas' });
          await viewer.importXML(xml);
          viewer.get('canvas').zoom('fit-viewport');
          window.rscViewerReady = true;
        } catch (error) {
          document.getElementById('canvas').innerHTML = '<div class="error">' + String(error) + '</div>';
          window.rscViewerError = String(error);
        }
      })();
    </script>
  </body>
</html>
`;
await writeFile(resolve(root, "preview.html"), previewHtml, "utf8");

console.log(JSON.stringify({
  processId: metadata.process.id,
  outlineElements: metadata.outline.length,
  mappedElements: metadata.elements.length,
  operations: softwareCatalog.operations.length,
  schemas: metadata.informationSchemas.length,
  warnings: issues.filter((issue) => issue.severity === "warning"),
  bundle: "rsc-as-is.process-bundle.zip",
  preview: "preview.html"
}, null, 2));
