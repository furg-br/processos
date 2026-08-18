import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildProcessBundleV2 } from "./build.js";
import { validateProcessBundleV2 } from "./validate.js";

const now = "2026-08-16T12:00:00.000Z";
const metadata = (key: string, title: string) => ({ id: randomUUID(), key, version: "1", visibility: "INSTITUTIONAL", status: "DRAFT", title, createdAt: now, updatedAt: now, labels: {} });
const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="https://processos.furg.br/test">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_1" name="Registrar solicitação"><bpmn:incoming>Flow_1</bpmn:incoming><bpmn:outgoing>Flow_2</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="End_1"><bpmn:incoming>Flow_2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

async function validBundle(mutate?: (resources: Array<[string, any]>) => void) {
  const processVersionId = randomUUID();
  const bindingSetVersionId = randomUUID();
  const releaseId = randomUUID();
  const resources = [
    ["process/process.json", { apiVersion: "processos.furg.br/v2", kind: "ProcessDefinition", metadata: metadata("processo.teste", "Processo de teste"), spec: { definitionId: randomUUID(), processVersionId, bindingSetVersionId, releaseId, profile: "IMPLEMENTABLE", perspective: "AS_IS", ownerUnitRef: "unidade.teste", participantUnitRefs: [], taxonomyRefs: [], audienceRefs: [], bpmnPath: "process/process.bpmn", normativeBasisRefs: [] } }],
    ["bindings/elements.json", { apiVersion: "processos.furg.br/v2", kind: "ElementBindingCatalog", metadata: metadata("processo.teste.elementos", "Elementos"), spec: { elements: [{ bpmnElementId: "Task_1", semanticId: "processo.teste.registrar", elementType: "userTask", label: "Registrar solicitação", visibility: "INSTITUTIONAL" }] } }],
    ["bindings/operational-traceability.json", { apiVersion: "processos.furg.br/v2", kind: "OperationalTraceabilityCatalog", metadata: metadata("processo.teste.rastreabilidade", "Rastreabilidade"), spec: { activities: [{ activityRef: "processo.teste.registrar", executionMode: "HUMAN_UI", actorRefs: [], organizationUnitRefs: [], interactionPointRefs: ["sistema.teste.tela.registro"], completionActions: [{ key: "processo.teste.acao.registrar", label: "Registrar", type: "COMPLETE", operationRefs: ["sistema.teste.registrar"], formRefs: [], policyRefs: [], preconditions: [], effects: [], evidenceRefs: [] }], inputRefs: [], outputRefs: [], timingPolicyRefs: [], evidenceRefs: [], mappingStatus: "COMPLETE" }] } }],
    ["software/systems.json", { apiVersion: "processos.furg.br/v2", kind: "SoftwareCatalog", metadata: metadata("processo.teste.software", "Software"), spec: { systems: [{ key: "sistema.teste", label: "Sistema Teste" }], modules: [], entryPoints: [{ key: "sistema.teste.tela.registro", systemRef: "sistema.teste", label: "Registro", menuPath: [], environmentUrls: {}, evidenceRefs: [] }], operations: [{ key: "sistema.teste.registrar", systemRef: "sistema.teste", label: "Registrar", kind: "UI_COMMAND", version: "1", deprecated: false, evidenceRefs: [] }] } }],
    ["process/phases.json", { apiVersion: "processos.furg.br/v2", kind: "PhaseCatalog", metadata: metadata("processo.teste.fases", "Fases"), spec: { phases: [] } }],
    ["catalogs/context.json", { apiVersion: "processos.furg.br/v2", kind: "InstitutionalContextCatalog", metadata: metadata("processo.teste.contexto", "Contexto"), spec: { organizationUnits: [{ key: "unidade.teste", acronym: "TESTE", label: "Unidade Teste" }], affiliations: [], positions: [], domains: [] } }],
    ["catalogs/data.json", { apiVersion: "processos.furg.br/v2", kind: "DataAssetCatalog", metadata: metadata("processo.teste.dados", "Dados"), spec: { assets: [] } }],
    ["catalogs/forms.json", { apiVersion: "processos.furg.br/v2", kind: "FormCatalog", metadata: metadata("processo.teste.formularios", "Formulários"), spec: { forms: [] } }],
    ["catalogs/access.json", { apiVersion: "processos.furg.br/v2", kind: "AccessCatalog", metadata: metadata("processo.teste.acesso", "Acesso"), spec: { actors: [], profiles: [], groups: [], grants: [], policies: [] } }],
    ["catalogs/automation.json", { apiVersion: "processos.furg.br/v2", kind: "AutomationCatalog", metadata: metadata("processo.teste.automacao", "Automação"), spec: { timingPolicies: [], jobs: [], integrations: [] } }],
    ["catalogs/decisions.json", { apiVersion: "processos.furg.br/v2", kind: "DecisionCatalog", metadata: metadata("processo.teste.decisoes", "Decisões"), spec: { decisions: [] } }],
    ["catalogs/states.json", { apiVersion: "processos.furg.br/v2", kind: "StateCatalog", metadata: metadata("processo.teste.estados", "Estados"), spec: { machines: [] } }],
    ["catalogs/communications.json", { apiVersion: "processos.furg.br/v2", kind: "CommunicationCatalog", metadata: metadata("processo.teste.comunicacoes", "Comunicações"), spec: { templates: [], notifications: [] } }],
    ["projections/projections.json", { apiVersion: "processos.furg.br/v2", kind: "ProjectionCatalog", metadata: metadata("processo.teste.projecoes", "Projeções"), spec: { projections: [] } }],
    ["provenance/provenance.json", { apiVersion: "processos.furg.br/v2", kind: "ProvenanceCatalog", metadata: metadata("processo.teste.proveniencia", "Proveniência"), spec: { sourceArtifacts: [], evidence: [] } }],
  ] as const;
  mutate?.(resources as unknown as Array<[string, any]>);
  return buildProcessBundleV2({
    profile: "IMPLEMENTABLE", processDefinitionKey: "processo.teste", processVersionId, bindingSetVersionId, releaseId, createdAt: now, createdBy: "test",
    files: [
      { path: "process/process.bpmn", content: bpmn, mediaType: "application/xml", visibility: "INSTITUTIONAL" },
      ...resources.map(([path, content]) => ({ path, content: `${JSON.stringify(content)}\n`, mediaType: "application/json", visibility: "INSTITUTIONAL" as const })),
    ],
  });
}

describe("validateProcessBundleV2", () => {
  it("valida um bundle implementável autocontido", async () => {
    const report = await validateProcessBundleV2(await validBundle());
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.coverage).toMatchObject({ bpmnActivities: 1, boundActivities: 1, tracedActivities: 1, completeMappings: 1, operations: 1, entryPoints: 1 });
  });

  it("rejeita alteração que quebra uma referência entre catálogos", async () => {
    const bundle = await validBundle((resources) => {
      const software = resources.find(([path]) => path === "software/systems.json")![1];
      software.spec.operations[0].systemRef = "sistema.inexistente";
    });

    const report = await validateProcessBundleV2(bundle);

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "SOFTWARE_SYSTEM_REF_NOT_FOUND",
      path: "sistema.inexistente",
    }));
  });

  it("detecta adulteração por hash", async () => {
    const bundle = await validBundle();
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bundle);
    zip.file("process/process.bpmn", bpmn.replace("Registrar solicitação", "Conteúdo adulterado"));
    const tampered = await zip.generateAsync({ type: "nodebuffer" });
    const report = await validateProcessBundleV2(tampered);
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "HASH_MISMATCH")).toBe(true);
  });

  it("faz round-trip sem perder arquivos nem hashes declarados", async () => {
    const original = await validBundle();
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(original);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    const files = await Promise.all(manifest.files.map(async (file: any) => ({ ...file, content: await zip.file(file.path)!.async("nodebuffer") })));
    const rebuilt = await buildProcessBundleV2({
      profile: manifest.profile, processDefinitionKey: manifest.processDefinitionKey, processVersionId: manifest.processVersionId,
      bindingSetVersionId: manifest.bindingSetVersionId, releaseId: manifest.releaseId, createdAt: manifest.createdAt, createdBy: manifest.createdBy,
      files: files.map((file) => ({ path: file.path, content: file.content, mediaType: file.mediaType, visibility: file.visibility, required: file.required })),
    });
    const rebuiltReport = await validateProcessBundleV2(rebuilt);
    const rebuiltManifest = JSON.parse(await (await JSZip.loadAsync(rebuilt)).file("manifest.json")!.async("string"));
    expect(rebuiltReport.valid).toBe(true);
    expect(rebuiltManifest.files).toEqual(manifest.files);
  });

  it("rejeita código executável mesmo quando declarado no manifesto", async () => {
    const original = await validBundle();
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(original);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    const payload = Buffer.from("console.log('não executar');", "utf8");
    const { createHash } = await import("node:crypto");
    manifest.files.push({ path: "scripts/payload.js", mediaType: "application/javascript", sha256: createHash("sha256").update(payload).digest("hex"), size: payload.length, visibility: "TECHNICAL", required: false });
    zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    zip.file("scripts/payload.js", payload);
    const report = await validateProcessBundleV2(await zip.generateAsync({ type: "nodebuffer" }));
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "EXECUTABLE_CONTENT_FORBIDDEN")).toBe(true);
  });

  it("rejeita identidade de release divergente mesmo com hashes recalculados", async () => {
    const original = await validBundle();
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(original);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    const definition = JSON.parse(await zip.file("process/process.json")!.async("string"));
    definition.spec.bindingSetVersionId = randomUUID();
    const content = Buffer.from(`${JSON.stringify(definition)}\n`, "utf8");
    const descriptor = manifest.files.find((file: any) => file.path === "process/process.json");
    descriptor.size = content.length;
    descriptor.sha256 = (await import("node:crypto")).createHash("sha256").update(content).digest("hex");
    zip.file("process/process.json", content);
    zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    const report = await validateProcessBundleV2(await zip.generateAsync({ type: "nodebuffer" }));
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "MANIFEST_IDENTITY_MISMATCH")).toBe(true);
  });
});
