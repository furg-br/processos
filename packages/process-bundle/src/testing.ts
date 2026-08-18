import JSZip from "jszip";
import { buildProcessBundleV2 } from "./build.js";

const now = "2026-01-01T12:00:00.000Z";
const processVersionId = "91000000-0000-4000-8000-000000000001";
const bindingSetVersionId = "92000000-0000-4000-8000-000000000001";
const releaseId = "93000000-0000-4000-8000-000000000001";

const metadata = (id: string, key: string, title: string, visibility: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED" = "INSTITUTIONAL") => ({
  id,
  key,
  version: "1",
  visibility,
  status: "DRAFT" as const,
  title,
  createdAt: now,
  updatedAt: now,
  labels: {},
});

export const syntheticBpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_Test" targetNamespace="https://processos.furg.br/testes">
  <bpmn:process id="Process_Test" isExecutable="false">
    <bpmn:startEvent id="Start_Test"><bpmn:outgoing>Flow_Start</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_Register" name="Registrar solicitação"><bpmn:incoming>Flow_Start</bpmn:incoming><bpmn:outgoing>Flow_Process</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="Task_Process" name="Processar solicitação"><bpmn:incoming>Flow_Process</bpmn:incoming><bpmn:outgoing>Flow_End</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="End_Test"><bpmn:incoming>Flow_End</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start_Test" targetRef="Task_Register" />
    <bpmn:sequenceFlow id="Flow_Process" sourceRef="Task_Register" targetRef="Task_Process" />
    <bpmn:sequenceFlow id="Flow_End" sourceRef="Task_Process" targetRef="End_Test" />
  </bpmn:process>
</bpmn:definitions>`;

export function syntheticProcessBundleV2Resources() {
  return [
    { apiVersion: "processos.furg.br/v2", kind: "ProcessDefinition", metadata: metadata("90000000-0000-4000-8000-000000000001", "processo.teste.integracao", "Processo sintético de integração"), spec: { definitionId: "94000000-0000-4000-8000-000000000001", processVersionId, bindingSetVersionId, releaseId, profile: "IMPLEMENTABLE", perspective: "AS_IS", ownerUnitRef: "unidade.teste", participantUnitRefs: ["unidade.apoio"], taxonomyRefs: ["dominio.teste"], audienceRefs: ["ator.solicitante"], bpmnPath: "process/process.bpmn", normativeBasisRefs: [] } },
    { apiVersion: "processos.furg.br/v2", kind: "ElementBindingCatalog", metadata: metadata("90000000-0000-4000-8000-000000000002", "processo.teste.elementos", "Elementos sintéticos"), spec: { elements: [
      { bpmnElementId: "Task_Register", semanticId: "atividade.teste.registrar", elementType: "userTask", label: "Registrar solicitação", phaseRef: "fase.teste.registro", visibility: "INSTITUTIONAL", publicLabel: "Registrar solicitação" },
      { bpmnElementId: "Task_Process", semanticId: "atividade.teste.processar", elementType: "serviceTask", label: "Processar solicitação", phaseRef: "fase.teste.processamento", visibility: "TECHNICAL", publicLabel: "Processar solicitação" },
    ] } },
    { apiVersion: "processos.furg.br/v2", kind: "OperationalTraceabilityCatalog", metadata: metadata("90000000-0000-4000-8000-000000000003", "processo.teste.rastreabilidade", "Rastreabilidade sintética"), spec: { activities: [
      { activityRef: "atividade.teste.registrar", executionMode: "HUMAN_UI", actorRefs: ["ator.solicitante"], organizationUnitRefs: ["unidade.teste"], interactionPointRefs: ["entrada.teste.registro"], completionActions: [{ key: "acao.teste.registrar", label: "Registrar", type: "COMPLETE", operationRefs: ["operacao.teste.registrar"], formRefs: ["formulario.teste.solicitacao"], policyRefs: ["politica.teste.acesso"], preconditions: [], effects: [{ type: "CREATE_DATA", dataRef: "dado.teste.solicitacao" }], evidenceRefs: ["evidencia.teste.implementacao"] }], inputRefs: [], outputRefs: ["dado.teste.solicitacao"], timingPolicyRefs: ["prazo.teste.atendimento"], evidenceRefs: ["evidencia.teste.implementacao"], mappingStatus: "COMPLETE" },
      { activityRef: "atividade.teste.processar", executionMode: "AUTOMATED", actorRefs: ["ator.sistema"], organizationUnitRefs: ["unidade.apoio"], interactionPointRefs: [], completionActions: [{ key: "acao.teste.processar", label: "Processar", type: "COMPLETE", operationRefs: ["operacao.teste.processar"], formRefs: [], policyRefs: [], preconditions: [], effects: [{ type: "UPDATE_DATA", dataRef: "dado.teste.solicitacao" }], evidenceRefs: ["evidencia.teste.implementacao"] }], inputRefs: ["dado.teste.solicitacao"], outputRefs: ["dado.teste.solicitacao"], timingPolicyRefs: [], evidenceRefs: ["evidencia.teste.implementacao"], mappingStatus: "COMPLETE" },
    ] } },
    { apiVersion: "processos.furg.br/v2", kind: "PhaseCatalog", metadata: metadata("90000000-0000-4000-8000-000000000004", "processo.teste.fases", "Fases sintéticas"), spec: { phases: [
      { key: "fase.teste.registro", label: "Registro", elementRefs: ["atividade.teste.registrar"], publicLabel: "Registro", expectedDuration: "P1D", order: 0 },
      { key: "fase.teste.processamento", label: "Processamento", elementRefs: ["atividade.teste.processar"], publicLabel: "Processamento", expectedDuration: "PT5M", order: 1 },
    ] } },
    { apiVersion: "processos.furg.br/v2", kind: "InstitutionalContextCatalog", metadata: metadata("90000000-0000-4000-8000-000000000005", "processo.teste.contexto", "Contexto sintético"), spec: { organizationUnits: [
      { key: "unidade.teste", acronym: "TESTE", label: "Unidade de Teste" },
      { key: "unidade.apoio", acronym: "APOIO", label: "Unidade de Apoio" },
    ], affiliations: [], positions: [], domains: [{ key: "dominio.teste", label: "Domínio de teste" }] } },
    { apiVersion: "processos.furg.br/v2", kind: "SoftwareCatalog", metadata: metadata("90000000-0000-4000-8000-000000000006", "processo.teste.software", "Software sintético", "TECHNICAL"), spec: { systems: [{ key: "sistema.teste", label: "Sistema de Teste", ownerUnitRef: "unidade.teste" }], modules: [{ key: "modulo.teste.solicitacoes", systemRef: "sistema.teste", label: "Solicitações" }], entryPoints: [{ key: "entrada.teste.registro", systemRef: "sistema.teste", moduleRef: "modulo.teste.solicitacoes", label: "Tela de registro", menuPath: ["Solicitações", "Registrar"], environmentUrls: {}, evidenceRefs: ["evidencia.teste.implementacao"] }], operations: [
      { key: "operacao.teste.registrar", systemRef: "sistema.teste", moduleRef: "modulo.teste.solicitacoes", label: "Registrar", kind: "HTTP", version: "1", method: "POST", path: "/solicitacoes", deprecated: false, evidenceRefs: ["evidencia.teste.implementacao"] },
      { key: "operacao.teste.processar", systemRef: "sistema.teste", moduleRef: "modulo.teste.solicitacoes", label: "Processar", kind: "CRON", version: "1", handler: "processarSolicitacoes", deprecated: false, evidenceRefs: ["evidencia.teste.implementacao"] },
    ] } },
    { apiVersion: "processos.furg.br/v2", kind: "DataAssetCatalog", metadata: metadata("90000000-0000-4000-8000-000000000007", "processo.teste.dados", "Dados sintéticos"), spec: { assets: [{ key: "dado.teste.solicitacao", label: "Solicitação sintética", kind: "INFORMATION_ASSET", ownerUnitRef: "unidade.teste", stewardRef: "ator.solicitante", classification: "INSTITUTIONAL", schemaPath: "data/schemas/solicitacao.schema.json", authoritativeSourceRef: "sistema.teste", evidenceRefs: ["evidencia.teste.implementacao"] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "FormCatalog", metadata: metadata("90000000-0000-4000-8000-000000000008", "processo.teste.formularios", "Formulários sintéticos"), spec: { forms: [{ key: "formulario.teste.solicitacao", label: "Solicitação", version: "1", dataSchemaRef: "dado.teste.solicitacao", uiSchemaDialect: "furg.forms/v1", activityRefs: ["atividade.teste.registrar"], actionRefs: ["acao.teste.registrar"], audienceRefs: ["ator.solicitante"], fields: [{ path: "titulo", label: "Título", component: "text-field", access: "EDITABLE", policyRefs: ["politica.teste.acesso"] }], actions: ["operacao.teste.registrar"] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "AccessCatalog", metadata: metadata("90000000-0000-4000-8000-000000000009", "processo.teste.acesso", "Acesso sintético"), spec: { actors: [{ key: "ator.solicitante", label: "Pessoa solicitante", kind: "PERSON" }, { key: "ator.sistema", label: "Sistema", kind: "SYSTEM_ACTOR" }], profiles: [{ key: "perfil.teste.operador", label: "Operador", groupRefs: ["grupo.teste.operadores"], sourceSystemRef: "sistema.teste" }], groups: [{ key: "grupo.teste.operadores", label: "Operadores", grantRefs: ["concessao.teste.registrar"], sourceSystemRef: "sistema.teste" }], grants: [{ key: "concessao.teste.registrar", subjectRefs: ["grupo.teste.operadores"], actionRefs: ["acao.teste.registrar"], resourceRefs: ["dado.teste.solicitacao"], policyRefs: ["politica.teste.acesso"] }], policies: [{ key: "politica.teste.acesso", label: "Acesso ao registro", layer: "CAPABILITY", effect: "ALLOW", expressionLanguage: "CEL", expression: "true", description: "Permite registrar a solicitação sintética.", evidenceRefs: ["evidencia.teste.implementacao"] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "AutomationCatalog", metadata: metadata("90000000-0000-4000-8000-000000000010", "processo.teste.automacao", "Automação sintética", "TECHNICAL"), spec: { timingPolicies: [{ key: "prazo.teste.atendimento", label: "Prazo de atendimento", kind: "EXPECTED_DURATION", duration: "P1D", timezone: "America/Sao_Paulo", trigger: "Registro da solicitação", pauseConditions: [], warnings: [], publicLabel: "Até um dia", normativeBasisRefs: [] }], jobs: [{ key: "job.teste.processamento", label: "Processar solicitações", schedule: "0 * * * *", timezone: "America/Sao_Paulo", operationRef: "operacao.teste.processar", executor: "worker-teste", ownerUnitRef: "unidade.apoio", idempotency: "Por identificador", concurrencyLock: "solicitacao:{id}", retryPolicy: "3 tentativas", monitoring: "Métrica de falhas", configurationRequirements: [], secretRefs: [] }], integrations: [] } },
    { apiVersion: "processos.furg.br/v2", kind: "DecisionCatalog", metadata: metadata("90000000-0000-4000-8000-000000000011", "processo.teste.decisoes", "Decisões sintéticas"), spec: { decisions: [{ key: "decisao.teste.valida", label: "Validar solicitação", notation: "DECLARATIVE", expressionLanguage: "CEL", expression: "solicitacao.titulo != ''", activityRefs: ["atividade.teste.processar"], inputRefs: ["dado.teste.solicitacao"], outputRefs: [], normativeBasisRefs: [], evidenceRefs: ["evidencia.teste.implementacao"] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "StateCatalog", metadata: metadata("90000000-0000-4000-8000-000000000012", "processo.teste.estados", "Estados sintéticos"), spec: { machines: [{ key: "estado.teste.solicitacao", label: "Estado da solicitação", subjectRef: "dado.teste.solicitacao", initialState: "RASCUNHO", terminalStates: ["PROCESSADA"], states: ["RASCUNHO", "PROCESSADA"], transitions: [{ key: "transicao.teste.processar", from: "RASCUNHO", to: "PROCESSADA", actionRef: "acao.teste.processar", operationRef: "operacao.teste.processar" }] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "CommunicationCatalog", metadata: metadata("90000000-0000-4000-8000-000000000013", "processo.teste.comunicacoes", "Comunicações sintéticas"), spec: { templates: [{ key: "modelo.teste.confirmacao", label: "Confirmação", channel: "EMAIL", classification: "INSTITUTIONAL" }], notifications: [{ key: "notificacao.teste.confirmacao", label: "Confirmar registro", trigger: "Solicitação registrada", recipientRefs: ["ator.solicitante"], templateRef: "modelo.teste.confirmacao", activityRefs: ["atividade.teste.registrar"], evidenceRefs: ["evidencia.teste.implementacao"] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "ProjectionCatalog", metadata: metadata("90000000-0000-4000-8000-000000000014", "processo.teste.projecoes", "Projeções sintéticas", "PUBLIC"), spec: { projections: [{ key: "projecao.teste.publica", audience: "PUBLIC", title: "Como funciona a solicitação", summary: "Visão pública sintética.", phases: [{ key: "publica.teste.registro", label: "Registro", description: "A pessoa registra a solicitação.", internalElementRefs: ["atividade.teste.registrar"], responsibleLabel: "Pessoa solicitante", expectedDurationLabel: "Até um dia", nextPhaseRefs: [] }], excludedResourceRefs: ["politica.teste.acesso", "job.teste.processamento"] }] } },
    { apiVersion: "processos.furg.br/v2", kind: "ProvenanceCatalog", metadata: metadata("90000000-0000-4000-8000-000000000015", "processo.teste.proveniencia", "Proveniência sintética", "TECHNICAL"), spec: { sourceArtifacts: [{ key: "fonte.teste.codigo", kind: "SOURCE_CODE", label: "Código sintético", location: { repository: "https://example.invalid/processo-teste.git", commit: "abcdef1", path: "src/processo.ts" }, capturedAt: now }], evidence: [{ key: "evidencia.teste.implementacao", label: "Implementação sintética", status: "IMPLEMENTED", confidence: 1, sourceArtifactRefs: ["fonte.teste.codigo"], validatesRefs: ["atividade.teste.registrar", "atividade.teste.processar"], validatedBy: "teste automatizado", validatedAt: now }] } },
  ];
}

export async function buildSyntheticProcessBundleV2(): Promise<Buffer> {
  const resources = syntheticProcessBundleV2Resources();
  return buildProcessBundleV2({
    profile: "IMPLEMENTABLE",
    processDefinitionKey: "processo.teste.integracao",
    processVersionId,
    bindingSetVersionId,
    releaseId,
    createdAt: now,
    createdBy: "fixture sintética",
    files: [
      { path: "process/process.bpmn", content: syntheticBpmnXml, mediaType: "application/xml", visibility: "INSTITUTIONAL" },
      { path: "data/schemas/solicitacao.schema.json", content: `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", required: ["titulo"], properties: { titulo: { type: "string" } } }, null, 2)}\n`, mediaType: "application/schema+json", visibility: "INSTITUTIONAL" },
      ...resources.map((resource) => ({ path: resource.kind === "ProcessDefinition" ? "process/process.json" : resource.kind === "ElementBindingCatalog" ? "bindings/elements.json" : resource.kind === "OperationalTraceabilityCatalog" ? "bindings/operational-traceability.json" : `catalogs/${resource.kind.replace(/Catalog$/, "").replaceAll(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}.json`, content: `${JSON.stringify(resource, null, 2)}\n`, mediaType: "application/json", visibility: resource.metadata.visibility })),
    ],
  });
}

export async function buildSyntheticProcessBundleV1(): Promise<Buffer> {
  const processId = "95000000-0000-4000-8000-000000000001";
  const versionId = "96000000-0000-4000-8000-000000000001";
  const operationId = "97000000-0000-4000-8000-000000000001";
  const metadataV1 = {
    schemaVersion: "furg.process/v1",
    process: { id: processId, slug: "processo-sintetico", title: "Processo sintético", description: "Processo criado exclusivamente para testes automatizados.", category: "Teste", audience: "Equipe de teste", visibility: "INTERNAL", ownerUnit: { acronym: "TESTE", name: "Unidade de Teste" }, participantUnits: [], updatedAt: now },
    version: { id: versionId, revision: 1, perspective: "AS_IS", status: "DRAFT", createdAt: now, contractVersion: "v1" },
    outline: [],
    elements: [
      { bpmnElementId: "Task_Register", role: "Solicitante", softwareBindings: [{ operationId, kind: "SUPPORTS" }], dataBindings: [] },
      { bpmnElementId: "Task_Process", role: "Sistema", softwareBindings: [], dataBindings: [] },
    ],
    relations: [],
    informationSchemas: [],
    provenance: { exportedBy: "teste automatizado", exportedAt: now, source: "fixture sintética em memória" },
  };
  const zip = new JSZip();
  zip.file("metadata.json", `${JSON.stringify(metadataV1, null, 2)}\n`);
  zip.file("process.bpmn", syntheticBpmnXml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
