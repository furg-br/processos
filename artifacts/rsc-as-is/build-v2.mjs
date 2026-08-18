import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractBpmnOutline } from "../../packages/bpmn-extension/dist/index.js";
import { processBundleV2ResourceSchema } from "../../packages/contracts/dist/index.js";
import { buildProcessBundleV2, validateProcessBundleV2 } from "../../packages/process-bundle/dist/index.js";

const require = createRequire(new URL("../../packages/process-bundle/package.json", import.meta.url));
const JSZip = require("jszip");

const root = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(root, "v2");
const now = "2026-08-16T21:00:00.000Z";
const processKey = "processo.rsc.pcctae";
const processVersionId = "33000000-0000-4000-8000-000000000001";
const bindingSetVersionId = "34000000-0000-4000-8000-000000000001";
const releaseId = "35000000-0000-4000-8000-000000000001";
const uuid = (number) => `40000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const key = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
const meta = (number, resourceKey, title, visibility = "TECHNICAL") => ({
  id: uuid(number), key: resourceKey, version: "2.0.0", visibility, status: "DRAFT",
  title, createdAt: now, updatedAt: now, labels: { perspective: "AS_IS", origin: "reverse-engineering" },
});
const envelope = (kind, number, resourceKey, title, spec, visibility) => ({
  apiVersion: "processos.furg.br/v2", kind, metadata: meta(number, resourceKey, title, visibility), spec,
});

const bpmnXml = await readFile(resolve(root, "process.bpmn"), "utf8");
const applicationMap = await readJson("application-map.json");
const sourceSoftware = await readJson("software-catalog.json");
const activityTypes = new Set(["task", "userTask", "serviceTask", "manualTask", "businessRuleTask", "sendTask", "receiveTask", "scriptTask", "callActivity", "subProcess"]);
const outline = extractBpmnOutline(bpmnXml);
const activities = outline.filter((item) => activityTypes.has(item.type));

const semanticByBpmn = {
  Activity_Instruct: "rsc.pedido.instruir", Activity_Submit: "rsc.pedido.enviar.para.avaliacao",
  Activity_Protocol: "rsc.pedido.validar.protocolar.publicar", Activity_Assign: "rsc.comissao.atribuir.responsavel",
  Activity_Analyze: "rsc.comissao.analisar.itens", Activity_OpenDiligence: "rsc.comissao.abrir.diligencia",
  Activity_RecordDiligence: "rsc.sistema.registrar.diligencia", Activity_RespondDiligence: "rsc.servidor.responder.diligencia",
  Activity_ValidateResponse: "rsc.sistema.validar.resposta.diligencia", Activity_AutoDeny: "rsc.sistema.indeferir.diligencia.expirada",
  Activity_FinalOpinion: "rsc.comissao.registrar.parecer.final", Activity_Freeze: "rsc.sistema.gerar.dossie.final",
  Activity_Accompany: "rsc.comissao.acompanhar.envio.sei", Activity_SendSei: "rsc.sistema.enviar.dossie.sei",
  Activity_ReceiveSei: "rsc.sei.receber.dossie", Activity_ConfirmRetry: "rsc.comissao.confirmar.retentativa.sei",
  Activity_Retry: "rsc.sistema.retentar.envio.sei", Activity_RouteProgep: "rsc.progep.receber.processo.sei",
};
const phaseByBpmn = {
  Activity_Instruct: "fase.requerimento", Activity_Submit: "fase.requerimento", Activity_Protocol: "fase.protocolo",
  Activity_Assign: "fase.analise", Activity_Analyze: "fase.analise", Activity_OpenDiligence: "fase.diligencia",
  Activity_RecordDiligence: "fase.diligencia", Activity_RespondDiligence: "fase.diligencia", Activity_ValidateResponse: "fase.diligencia",
  Activity_AutoDeny: "fase.diligencia", Activity_FinalOpinion: "fase.parecer", Activity_Freeze: "fase.parecer",
  Activity_Accompany: "fase.envio.sei", Activity_SendSei: "fase.envio.sei", Activity_ReceiveSei: "fase.envio.sei",
  Activity_ConfirmRetry: "fase.envio.sei", Activity_Retry: "fase.envio.sei", Activity_RouteProgep: "fase.entrega.progep",
};
const bindingByBpmn = new Map(applicationMap.bpmnBindings.map((item) => [item.elementId, item]));
const fallbackBindings = {
  Activity_RecordDiligence: { actor: "sistema", operations: ["rsc.abrirDiligenciaSeletiva"], inputs: ["rsc-diligencia"], outputs: ["rsc-diligencia"] },
  Activity_ValidateResponse: { actor: "sistema", operations: ["rsc.responderDiligencia"], inputs: ["rsc-diligencia"], outputs: ["rsc-pedido"] },
  Activity_ReceiveSei: { actor: "sei_progep", operations: [], inputs: ["rsc-dossie-envio-sei"], outputs: [] },
  Activity_RouteProgep: { actor: "sei_progep", operations: [], inputs: ["rsc-dossie-envio-sei"], outputs: [] },
};
for (const [id, binding] of Object.entries(fallbackBindings)) if (!bindingByBpmn.has(id)) bindingByBpmn.set(id, binding);

const operationKey = (operationId) => `operacao.${key(operationId)}`;
const actionKey = (activityRef) => `acao.${activityRef}`;
const formKey = (formId) => `formulario.${key(formId)}`;
const dataAliases = {
  "rsc-pedido": "dado.rsc.pedido", "rsc-item-evidencia": "dado.rsc.item.evidencia", "rsc-diligencia": "dado.rsc.diligencia",
  "rsc-parecer": "documento.rsc.parecer", "rsc-parecer(provisório)": "documento.rsc.parecer",
  "rsc-dossie-envio-sei": "documento.rsc.dossie.sei", "confirmação de nova tentativa": "dado.rsc.confirmacao.retentativa",
};
const dataRef = (value) => dataAliases[value] ?? `dado.${key(value)}`;
const sourceRef = "fonte.codigo.rsc";
const evidenceRef = "evidencia.rsc.implementacao";
const formsByOperation = new Map();
for (const form of applicationMap.forms) {
  const items = formsByOperation.get(form.operation) ?? [];
  items.push(formKey(form.id));
  formsByOperation.set(form.operation, items);
}

const processDefinition = envelope("ProcessDefinition", 1, processKey, "Reconhecimento de Saberes e Competências - RSC-PCCTAE", {
  definitionId: "32000000-0000-4000-8000-000000000001", processVersionId, bindingSetVersionId, releaseId,
  profile: "IMPLEMENTABLE", perspective: "AS_IS", ownerUnitRef: "unidade.progep",
  participantUnitRefs: ["unidade.comissao.rsc", "unidade.progep"], taxonomyRefs: ["dominio.gestao.pessoas", "vinculo.servidor.ta"],
  audienceRefs: ["ator.servidor", "ator.comissao"], bpmnPath: "process/process.bpmn", normativeBasisRefs: ["norma.rsc.pcctae"],
}, "INSTITUTIONAL");

const phaseDefinitions = [
  ["fase.requerimento", "Preparação do requerimento", "Servidor requerente", "Tempo do interessado"],
  ["fase.protocolo", "Protocolo do pedido", "Sistema RSC", "Imediato após o envio"],
  ["fase.analise", "Análise da comissão", "Comissão RSC", "Conforme fila de análise"],
  ["fase.diligencia", "Diligência", "Servidor e Comissão RSC", "Até 60 dias para resposta"],
  ["fase.parecer", "Parecer final", "Comissão RSC", "Após conclusão da análise"],
  ["fase.envio.sei", "Envio ao SEI", "Comissão RSC e sistema", "Após o parecer"],
  ["fase.entrega.progep", "Entrega à PROGEP", "SEI / PROGEP", "Após confirmação do envio"],
];
const phases = envelope("PhaseCatalog", 2, `${processKey}.fases`, "Fases do RSC", { phases: phaseDefinitions.map(([phaseKey, label, responsibleLabel, expectedDuration], order) => ({
  key: phaseKey, label, publicLabel: label, description: `${label}. Responsável: ${responsibleLabel}.`, expectedDuration, order,
  elementRefs: activities.filter((activity) => phaseByBpmn[activity.id] === phaseKey).map((activity) => semanticByBpmn[activity.id]),
})) }, "INSTITUTIONAL");

const elements = envelope("ElementBindingCatalog", 3, `${processKey}.elementos`, "Identidades semânticas dos elementos BPMN", { elements: activities.map((activity) => ({
  bpmnElementId: activity.id, semanticId: semanticByBpmn[activity.id], elementType: activity.type, label: activity.name,
  phaseRef: phaseByBpmn[activity.id], visibility: activity.id === "Activity_AutoDeny" ? "TECHNICAL" : "INSTITUTIONAL", publicLabel: activity.name,
})) });

const entryPointFor = (binding) => binding?.actor === "servidor" ? "entrada.casca.srh.rsc.servidor" : binding?.actor === "comissao" ? "entrada.casca.srh.rsc.comissao" : undefined;
const traces = envelope("OperationalTraceabilityCatalog", 4, `${processKey}.rastreabilidade.operacional`, "Rastreabilidade operacional canônica do RSC", { activities: activities.map((activity) => {
  const binding = bindingByBpmn.get(activity.id) ?? { actor: "sistema", operations: [], inputs: [], outputs: [] };
  const external = ["Activity_ReceiveSei", "Activity_RouteProgep"].includes(activity.id);
  const interactive = activity.type === "userTask";
  const executionMode = external ? "HUMAN_EXTERNAL" : interactive ? "HUMAN_UI" : activity.id === "Activity_SendSei" ? "INTEGRATION" : "AUTOMATED";
  const operations = binding.operations ?? [];
  const forms = [...new Set(operations.flatMap((operation) => formsByOperation.get(operation) ?? []))];
  const activityRef = semanticByBpmn[activity.id];
  return {
    activityRef, executionMode, actorRefs: [`ator.${key(binding.actor)}`], organizationUnitRefs: external ? ["unidade.progep"] : [],
    interactionPointRefs: interactive ? [entryPointFor(binding) ?? "entrada.casca.srh.rsc.comissao"] : [],
    completionActions: [{ key: actionKey(activityRef), label: activity.name, type: activity.id === "Activity_Retry" ? "RETRY" : "COMPLETE",
      targetFlowRef: activity.outgoing?.[0], operationRefs: operations.map(operationKey), formRefs: forms,
      policyRefs: interactive ? [binding.actor === "servidor" ? "politica.rsc.escopo.servidor" : "politica.rsc.perfil.comissao"] : [],
      preconditions: operations.flatMap((id) => sourceSoftware.operations.find((operation) => operation.operationId === id)?.preconditions ?? []).map((description, index) => ({ key: `precondicao.${key(activityRef)}.${index + 1}`, expressionLanguage: "NARRATIVE", expression: "documented-condition", description })),
      effects: [...new Set((binding.outputs ?? []).map(dataRef))].map((ref) => ({ type: ref.startsWith("documento.") ? "GENERATE_DOCUMENT" : "UPDATE_DATA", [ref.startsWith("documento.") ? "documentRef" : "dataRef"]: ref })), evidenceRefs: [evidenceRef] }],
    inputRefs: [...new Set((binding.inputs ?? []).map(dataRef))], outputRefs: [...new Set((binding.outputs ?? []).map(dataRef))],
    timingPolicyRefs: ["Activity_OpenDiligence", "Activity_RecordDiligence", "Activity_RespondDiligence", "Activity_AutoDeny"].includes(activity.id) ? ["prazo.rsc.diligencia.60.dias"] : [],
    evidenceRefs: [evidenceRef], externalProcedure: external ? { location: activity.id === "Activity_ReceiveSei" ? "SEI" : "SEI / unidade PROGEP", procedureRef: "procedimento.sei.rsc" } : undefined,
    mappingStatus: "COMPLETE",
  };
}) });

const schemaDefinitions = [
  ["dado.rsc.pedido", "Pedido de RSC-PCCTAE", "INFORMATION_ASSET", "schemas/rsc-pedido.v1.schema.json"],
  ["dado.rsc.item.evidencia", "Item e comprovante do pedido", "INFORMATION_ASSET", "schemas/rsc-item-evidencia.v1.schema.json"],
  ["dado.rsc.diligencia", "Diligência seletiva", "INFORMATION_ASSET", "schemas/rsc-diligencia.v1.schema.json"],
  ["documento.rsc.parecer", "Parecer da Comissão RSC", "DOCUMENT", "schemas/rsc-parecer.v1.schema.json"],
  ["documento.rsc.dossie.sei", "Dossiê final para o SEI", "DOCUMENT", "schemas/rsc-dossie-envio-sei.v1.schema.json"],
  ["dado.rsc.confirmacao.retentativa", "Confirmação de nova tentativa", "BUSINESS_CONCEPT", undefined],
];
const dataAssets = envelope("DataAssetCatalog", 5, `${processKey}.dados`, "Inventário de dados e documentos do RSC", { assets: schemaDefinitions.map(([assetKey, label, kind, schemaPath]) => ({
  key: assetKey, label, kind, ownerUnitRef: "unidade.progep", classification: "RESTRICTED",
  schemaPath: schemaPath ? `data/${schemaPath}` : undefined, authoritativeSourceRef: "sistema.casca", evidenceRefs: [evidenceRef],
})) });

const schemaRefByUrl = (url = "") => url.includes("item-evidencia") ? "dado.rsc.item.evidencia" : url.includes("diligencia") ? "dado.rsc.diligencia" : url.includes("parecer") ? "documento.rsc.parecer" : url.includes("dossie") ? "documento.rsc.dossie.sei" : "dado.rsc.pedido";
const forms = envelope("FormCatalog", 6, `${processKey}.formularios`, "Contratos de formulário do RSC", { forms: applicationMap.forms.map((form) => {
  const related = activities.filter((activity) => (bindingByBpmn.get(activity.id)?.operations ?? []).includes(form.operation)).map((activity) => semanticByBpmn[activity.id]);
  const fields = (form.fields ?? []).map((field, index) => ({ path: `field${index + 1}`, label: field, component: field.toLowerCase().includes("pdf") ? "file-upload" : "text-field", access: field.includes("read-only") ? "READ_ONLY" : "EDITABLE", policyRefs: [], visibilityRule: form.fieldAccess, ruleLanguage: "NARRATIVE" }));
  return { key: formKey(form.id), label: form.id, version: "1", dataSchemaRef: schemaRefByUrl(form.dataSchema), uiSchemaDialect: "furg.forms/v1", activityRefs: related, actionRefs: related.map(actionKey), audienceRefs: [`ator.${key(form.actor)}`], fields, actions: [operationKey(form.operation)] };
}) });

const software = envelope("SoftwareCatalog", 7, `${processKey}.software`, "Sistemas, aplicações e operações vinculadas ao RSC", {
  systems: [{ key: "sistema.casca", label: "CASCA ERP", ownerUnitRef: "unidade.cgti" }, { key: "sistema.sei", label: "SEI", ownerUnitRef: "unidade.cgti" }],
  modules: [{ key: "modulo.casca.srh", systemRef: "sistema.casca", label: "SRH" }],
  entryPoints: [
    { key: "entrada.casca.srh.rsc.servidor", systemRef: "sistema.casca", moduleRef: "modulo.casca.srh", label: "RSC - área do servidor", screenRef: "tela.rsc.servidor", menuPath: ["SRH", "RSC"], environmentUrls: {}, evidenceRefs: [evidenceRef] },
    { key: "entrada.casca.srh.rsc.comissao", systemRef: "sistema.casca", moduleRef: "modulo.casca.srh", label: "RSC - área da comissão", screenRef: "tela.rsc.comissao", menuPath: ["SRH", "RSC", "Comissão"], environmentUrls: {}, evidenceRefs: [evidenceRef] },
  ],
  operations: sourceSoftware.operations.map((operation) => ({ key: operationKey(operation.operationId), systemRef: "sistema.casca", moduleRef: "modulo.casca.srh", label: operation.label,
    kind: operation.application === "rsc-job" ? "CRON" : "HTTP", version: "as-is", method: operation.method ?? undefined, path: operation.path ?? undefined,
    handler: operation.actionScript ?? operation.domainMethods?.join(", "), deprecated: false, evidenceRefs: [evidenceRef] })),
});

const actionRefsByActor = (actor) => activities.filter((activity) => bindingByBpmn.get(activity.id)?.actor === actor).map((activity) => actionKey(semanticByBpmn[activity.id]));
const access = envelope("AccessCatalog", 8, `${processKey}.acesso`, "Atores, perfis, grupos e políticas do RSC", {
  actors: [
    { key: "ator.servidor", label: "Servidor requerente", kind: "AFFILIATION" }, { key: "ator.comissao", label: "Comissão RSC", kind: "ORGANIZATIONAL_ROLE" },
    { key: "ator.sistema", label: "Aplicação RSC", kind: "SYSTEM_ACTOR" }, { key: "ator.processamento.automatico", label: "Processamento automático", kind: "SYSTEM_ACTOR" },
    { key: "ator.sei.progep", label: "SEI / PROGEP", kind: "SYSTEM_ACTOR" },
  ],
  profiles: [{ key: "perfil.comissao.rsc", label: "PERFIL_COMISSAO_RSC", groupRefs: ["grupo.rsc.comissao"], sourceSystemRef: "sistema.casca" }],
  groups: [
    { key: "grupo.rsc.servidor", label: "RSC - Servidor", grantRefs: ["concessao.rsc.servidor"], sourceSystemRef: "sistema.casca" },
    { key: "grupo.rsc.comissao", label: "RSC - Comissão", grantRefs: ["concessao.rsc.comissao"], sourceSystemRef: "sistema.casca" },
  ],
  grants: [
    { key: "concessao.rsc.servidor", subjectRefs: ["grupo.rsc.servidor"], actionRefs: actionRefsByActor("servidor"), resourceRefs: ["dado.rsc.pedido"], policyRefs: ["politica.rsc.escopo.servidor"] },
    { key: "concessao.rsc.comissao", subjectRefs: ["grupo.rsc.comissao", "perfil.comissao.rsc"], actionRefs: actionRefsByActor("comissao"), resourceRefs: ["dado.rsc.pedido"], policyRefs: ["politica.rsc.perfil.comissao"] },
  ],
  policies: [
    { key: "politica.rsc.escopo.servidor", label: "Escopo do servidor", layer: "RECORD_SCOPE", effect: "ALLOW", expressionLanguage: "CEL", expression: "pedido.id_funcionario == sessao.id_funcionario", description: "O servidor atua somente sobre o próprio pedido.", evidenceRefs: [evidenceRef] },
    { key: "politica.rsc.perfil.comissao", label: "Perfil Comissão RSC vigente", layer: "CAPABILITY", effect: "ALLOW", expressionLanguage: "CEL", expression: "perfil == PERFIL_COMISSAO_RSC && vigente", description: "Exige perfil institucional vigente e grupo de acesso da comissão.", evidenceRefs: [evidenceRef] },
  ],
});

const automation = envelope("AutomationCatalog", 9, `${processKey}.automacoes`, "Prazos, jobs e integrações do RSC", {
  timingPolicies: [{ key: "prazo.rsc.diligencia.60.dias", label: "Prazo de resposta à diligência", kind: "LEGAL_DEADLINE", duration: "P60D", timezone: "America/Sao_Paulo", trigger: "Diligência aberta e notificada", pauseConditions: [], warnings: ["Avisar antes do vencimento"], publicLabel: "Até 60 dias para resposta", normativeBasisRefs: ["norma.rsc.pcctae"] }],
  jobs: [{ key: "job.rsc.diligencias.expiradas", label: "Processar diligências expiradas", schedule: "0 2 * * *", timezone: "America/Sao_Paulo", operationRef: operationKey("rsc.indeferirDiligenciasExpiradas"), executor: "RhRscProcessamentoAutomatico", ownerUnitRef: "unidade.cgti", idempotency: "Ignora diligências já encerradas", concurrencyLock: "Execução única por competência", retryPolicy: "Reexecução no próximo ciclo com alerta operacional", monitoring: "Log estruturado, métrica de processados e alerta de falha", configurationRequirements: ["Cron on-premises", "Timezone America/Sao_Paulo", "Acesso ao banco do SRH"], secretRefs: [] }],
  integrations: [{ key: "integracao.rsc.sei", label: "Envio do dossiê RSC ao SEI", sourceSystemRef: "sistema.casca", targetSystemRef: "sistema.sei", operationRefs: [operationKey("rsc.enviarDossieSei")], protocol: "Integração institucional idempotente" }],
});

const projections = envelope("ProjectionCatalog", 10, `${processKey}.projecoes`, "Projeções por público do RSC", { projections: [
  { key: "projecao.rsc.publica", audience: "PUBLIC", title: "Como funciona o RSC-PCCTAE", summary: "Visão pública das fases, responsáveis e tempos esperados, sem rotas, perfis ou detalhes internos.", phases: phaseDefinitions.map(([phaseKey, label, responsibleLabel, expectedDuration], index) => ({ key: `publica.${phaseKey}`, label, description: `${label}.`, internalElementRefs: activities.filter((activity) => phaseByBpmn[activity.id] === phaseKey).map((activity) => semanticByBpmn[activity.id]), responsibleLabel, expectedDurationLabel: expectedDuration, nextPhaseRefs: phaseDefinitions[index + 1] ? [`publica.${phaseDefinitions[index + 1][0]}`] : [] })), excludedResourceRefs: ["politica.rsc.escopo.servidor", "politica.rsc.perfil.comissao", "job.rsc.diligencias.expiradas"] },
  { key: "projecao.rsc.tecnica", audience: "TECHNICAL", title: "RSC - implementação AS-IS", summary: "Visão completa para análise, auditoria e geração assistida de software.", phases: [], excludedResourceRefs: [] },
] }, "INSTITUTIONAL");

const provenance = envelope("ProvenanceCatalog", 11, `${processKey}.proveniencia`, "Evidências e divergências observadas no RSC", {
  sourceArtifacts: [{ key: sourceRef, kind: "SOURCE_CODE", label: "Código-fonte e testes da aplicação RSC", location: { repository: applicationMap.sourceSnapshot.repository, commit: applicationMap.sourceSnapshot.commit, path: "sistemas/srh/aplicacoes/rsc" }, capturedAt: now }],
  evidence: [{ key: evidenceRef, label: "Comportamento observado na implementação RSC", status: "IMPLEMENTED", confidence: 0.95, sourceArtifactRefs: [sourceRef], validatesRefs: activities.map((activity) => semanticByBpmn[activity.id]) },
    ...applicationMap.observedDivergences.map((item, index) => ({ key: `evidencia.divergencia.${key(item.id)}`, label: item.description, status: "CONTESTED", confidence: 0.9, sourceArtifactRefs: [sourceRef], validatesRefs: [], discrepancy: item.impact ?? item.authoritativeBehaviorForThisMap }))],
});

const release = envelope("ProcessRelease", 12, `${processKey}.release.as-is.1`, "Release AS-IS do RSC", { releaseId, processDefinitionRef: processKey, processVersionId, bindingSetVersionId, sourceArtifactRefs: [sourceRef] }, "INSTITUTIONAL");
const context = envelope("InstitutionalContextCatalog", 13, `${processKey}.contexto`, "Contexto institucional do RSC", {
  organizationUnits: [{ key: "unidade.cgti", acronym: "CGTI", label: "Centro de Gestão de Tecnologia da Informação" }, { key: "unidade.progep", acronym: "PROGEP", label: "Pró-Reitoria de Gestão e Desenvolvimento de Pessoas" }, { key: "unidade.comissao.rsc", acronym: "CRSC", label: "Comissão RSC-PCCTAE", parentRef: "unidade.progep" }],
  affiliations: [{ key: "vinculo.servidor.ta", label: "Servidor técnico-administrativo em educação" }], positions: [],
  domains: [{ key: "dominio.gestao.pessoas", label: "Gestão de pessoas" }],
}, "INSTITUTIONAL");
const decisions = envelope("DecisionCatalog", 14, `${processKey}.decisoes`, "Decisões e regras do RSC", { decisions: [
  { key: "decisao.rsc.elegibilidade", label: "Verificar elegibilidade para requerer RSC", notation: "DECLARATIVE", expressionLanguage: "CEL", expression: "servidor.elegivel && periodo.aberto", activityRefs: ["rsc.pedido.instruir"], inputRefs: ["dado.rsc.pedido"], outputRefs: [], normativeBasisRefs: ["norma.rsc.pcctae"], evidenceRefs: [evidenceRef] },
  { key: "decisao.rsc.necessidade.diligencia", label: "Determinar necessidade de diligência", notation: "NARRATIVE", activityRefs: ["rsc.comissao.analisar.itens"], inputRefs: ["dado.rsc.item.evidencia"], outputRefs: ["dado.rsc.diligencia"], normativeBasisRefs: ["norma.rsc.pcctae"], evidenceRefs: [evidenceRef] },
  { key: "decisao.rsc.resultado.final", label: "Determinar resultado final", notation: "DECLARATIVE", expressionLanguage: "NARRATIVE", expression: "pontuacao_e_regras_normativas_satisfeitas", activityRefs: ["rsc.comissao.registrar.parecer.final"], inputRefs: ["dado.rsc.pedido", "dado.rsc.item.evidencia"], outputRefs: ["documento.rsc.parecer"], normativeBasisRefs: ["norma.rsc.pcctae"], evidenceRefs: [evidenceRef] },
] });
const states = envelope("StateCatalog", 15, `${processKey}.estados`, "Máquinas de estado do RSC", { machines: [{
  key: "estado.rsc.pedido", label: "Estado principal do pedido", subjectRef: "dado.rsc.pedido", initialState: "RASCUNHO", terminalStates: ["DEFERIDO", "INDEFERIDO"], states: ["RASCUNHO", "EM_ANALISE", "EM_DILIGENCIA", "DEFERIDO", "INDEFERIDO"],
  transitions: [
    { key: "transicao.rsc.enviar.avaliacao", from: "RASCUNHO", to: "EM_ANALISE", actionRef: actionKey("rsc.pedido.enviar.para.avaliacao"), operationRef: operationKey("rsc.enviarParaAvaliacao") },
    { key: "transicao.rsc.abrir.diligencia", from: "EM_ANALISE", to: "EM_DILIGENCIA", actionRef: actionKey("rsc.comissao.abrir.diligencia"), operationRef: operationKey("rsc.abrirDiligenciaSeletiva") },
    { key: "transicao.rsc.responder.diligencia", from: "EM_DILIGENCIA", to: "EM_ANALISE", actionRef: actionKey("rsc.servidor.responder.diligencia"), operationRef: operationKey("rsc.responderDiligencia") },
    { key: "transicao.rsc.expirar.diligencia", from: "EM_DILIGENCIA", to: "INDEFERIDO", actionRef: actionKey("rsc.sistema.indeferir.diligencia.expirada"), operationRef: operationKey("rsc.indeferirDiligenciasExpiradas") },
    { key: "transicao.rsc.deferir", from: "EM_ANALISE", to: "DEFERIDO", actionRef: actionKey("rsc.comissao.registrar.parecer.final"), operationRef: operationKey("rsc.registrarParecerFinal"), conditionRef: "decisao.rsc.resultado.final" },
    { key: "transicao.rsc.indeferir", from: "EM_ANALISE", to: "INDEFERIDO", actionRef: actionKey("rsc.comissao.registrar.parecer.final"), operationRef: operationKey("rsc.registrarParecerFinal"), conditionRef: "decisao.rsc.resultado.final" },
  ],
}] });
const communications = envelope("CommunicationCatalog", 16, `${processKey}.comunicacoes`, "Notificações e templates do RSC", {
  templates: [{ key: "template.rsc.diligencia.aberta", label: "Aviso de diligência aberta", channel: "EMAIL", classification: "INSTITUTIONAL" }, { key: "template.rsc.memorial.publicado", label: "Memorial publicado", channel: "DOCUMENT", classification: "RESTRICTED" }],
  notifications: [{ key: "notificacao.rsc.diligencia.aberta", label: "Notificar servidor sobre diligência", trigger: "Diligência registrada", recipientRefs: ["ator.servidor"], templateRef: "template.rsc.diligencia.aberta", activityRefs: ["rsc.sistema.registrar.diligencia"], evidenceRefs: [evidenceRef] }],
});
const resources = [processDefinition, phases, elements, traces, dataAssets, forms, software, access, automation, projections, provenance, release, context, decisions, states, communications];
for (const resource of resources) processBundleV2ResourceSchema.parse(resource);

const resourceFiles = [
  ["process/process.json", processDefinition], ["process/phases.json", phases], ["bindings/elements.json", elements],
  ["bindings/operational-traceability.json", traces], ["catalogs/data-assets.json", dataAssets], ["catalogs/forms.json", forms],
  ["catalogs/software.json", software], ["catalogs/access.json", access], ["catalogs/automation.json", automation],
  ["projections/projections.json", projections], ["provenance/provenance.json", provenance], ["releases/release.json", release],
  ["catalogs/institutional-context.json", context], ["catalogs/decisions.json", decisions], ["catalogs/states.json", states], ["catalogs/communications.json", communications],
];
const files = [
  { path: "process/process.bpmn", mediaType: "application/xml", content: bpmnXml, visibility: "INSTITUTIONAL" },
  ...resourceFiles.map(([path, resource]) => ({ path, mediaType: "application/json", content: json(resource), visibility: resource.metadata.visibility })),
];
for (const [, , , schemaPath] of schemaDefinitions.filter((item) => item[3])) {
  files.push({ path: `data/${schemaPath}`, mediaType: "application/schema+json", content: await readFile(resolve(root, schemaPath), "utf8"), visibility: "RESTRICTED" });
}

const bundle = await buildProcessBundleV2({ profile: "IMPLEMENTABLE", processDefinitionKey: processKey, processVersionId, bindingSetVersionId, releaseId, createdAt: now, createdBy: "Mapeamento reverso assistido por IA", files });
const report = await validateProcessBundleV2(bundle);
if (!report.valid) throw new Error(`ProcessBundle v2 inválido:\n${JSON.stringify(report.issues, null, 2)}`);

await rm(outputRoot, { recursive: true, force: true });
for (const file of files) {
  const target = resolve(outputRoot, file.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, file.content);
}
await writeFile(resolve(outputRoot, "validation-report.json"), json(report));
await writeFile(resolve(root, "rsc-as-is.process-bundle-v2.zip"), bundle);
const invalidExamplesRoot = resolve(root, "../examples/invalid");
await mkdir(invalidExamplesRoot, { recursive: true });
const tamperedZip = await JSZip.loadAsync(bundle);
tamperedZip.file("process/process.bpmn", bpmnXml.replace("Criar e instruir pedido em rascunho", "Conteúdo adulterado sem atualização do manifesto"));
await writeFile(resolve(invalidExamplesRoot, "hash-adulterado.process-bundle-v2.zip"), await tamperedZip.generateAsync({ type: "nodebuffer" }));
await writeFile(resolve(invalidExamplesRoot, "README.md"), "# Exemplos inválidos\n\n`hash-adulterado.process-bundle-v2.zip` altera o BPMN sem atualizar tamanho e SHA-256. O validador deve emitir `SIZE_MISMATCH` e `HASH_MISMATCH`. O arquivo existe para testes negativos; não deve ser importado.\n", "utf8");
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const elementBySemantic = new Map(elements.spec.elements.map((item) => [item.semanticId, item]));
const phaseByKey = new Map(phases.spec.phases.map((item) => [item.key, item]));
const entryByKey = new Map(software.spec.entryPoints.map((item) => [item.key, item]));
const operationByKey = new Map(software.spec.operations.map((item) => [item.key, item]));
const previewRows = traces.spec.activities.map((trace) => {
  const element = elementBySemantic.get(trace.activityRef);
  const action = trace.completionActions[0];
  const entry = entryByKey.get(trace.interactionPointRefs[0]);
  const operations = action.operationRefs.map((ref) => operationByKey.get(ref)).filter(Boolean);
  return `<tr><td><small>${escapeHtml(phaseByKey.get(element.phaseRef)?.label)}</small><strong>${escapeHtml(element.label)}</strong><code>${escapeHtml(element.semanticId)}</code></td><td>${escapeHtml(trace.actorRefs.join(", "))}<small>${escapeHtml(trace.executionMode)}</small></td><td>${escapeHtml(entry?.label ?? trace.externalProcedure?.location ?? "Processamento interno")}</td><td><strong>${escapeHtml(action.label)}</strong>${operations.map((operation) => `<code>${escapeHtml(`${operation.method ?? operation.kind} ${operation.path ?? operation.handler ?? ""}`)}</code>`).join("")}</td><td>${escapeHtml(trace.timingPolicyRefs.map((ref) => automation.spec.timingPolicies.find((policy) => policy.key === ref)?.publicLabel ?? ref).join(", ") || "Sem prazo próprio")}</td><td>${escapeHtml(action.effects.map((effect) => effect.dataRef ?? effect.documentRef ?? effect.activityRef ?? effect.eventRef ?? effect.type).join(", ") || "Concluir etapa")}</td></tr>`;
}).join("");
const publicPhases = projections.spec.projections.find((item) => item.audience === "PUBLIC").phases.map((phase, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(phase.label)}</h3><p>${escapeHtml(phase.description)}</p><small>${escapeHtml(phase.responsibleLabel)} · ${escapeHtml(phase.expectedDurationLabel ?? "Prazo a consultar")}</small></div></li>`).join("");
const previewHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSC - rastreabilidade ProcessBundle v2</title><style>
:root{font-family:Arial,sans-serif;color:#152e2b;background:#f7faf9;line-height:1.45}*{box-sizing:border-box}body{margin:0}header.hero{background:#092f35;color:#fff;padding:3rem max(1.25rem,calc((100vw - 1500px)/2))}header.hero p{color:#b9d9d2;max-width:70ch}h1{font-size:clamp(2rem,5vw,4.6rem);letter-spacing:-.05em;line-height:1;margin:.4rem 0 1rem;max-width:18ch}.eyebrow{color:#5fc5b0;font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.metrics{display:flex;flex-wrap:wrap;gap:1px;margin-top:2rem}.metrics span{background:#ffffff12;padding:.7rem 1rem}.metrics strong{display:block;font-size:1.5rem}nav{background:#fff;border-bottom:1px solid #cbd8d5;display:flex;gap:1rem;padding:1rem max(1.25rem,calc((100vw - 1500px)/2));position:sticky;top:0}nav a{color:#12665d;font-weight:700}main{margin:auto;max-width:1500px;padding:2rem 1.25rem}section{scroll-margin-top:5rem;margin-bottom:4rem}h2{font-size:clamp(1.6rem,3vw,2.6rem);letter-spacing:-.04em}.scroll{overflow:auto}table{border-collapse:collapse;min-width:1200px;width:100%;font-size:.82rem}th{border-bottom:2px solid #12665d;text-align:left;text-transform:uppercase;font-size:.7rem}th,td{padding:.8rem;vertical-align:top}td{border-bottom:1px solid #d7e1df}td:first-child{min-width:250px}td strong,td small,td code{display:block}td small{color:#49716c}code{font-size:.7rem;color:#49635f;margin-top:.25rem}ol{list-style:none;margin:0;padding:0;border-top:2px solid #12665d}ol li{display:grid;grid-template-columns:3rem 1fr;border-bottom:1px solid #d7e1df;padding:1.2rem 0}ol li>span{color:#128273;font-weight:800}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}.card{background:#fff;border-left:4px solid #128273;padding:1rem}.card h3{margin:.5rem 0}.notice{background:#e0f2ed;border-left:4px solid #12665d;padding:1rem}@media(max-width:600px){header.hero{padding-block:2rem}nav{overflow:auto;white-space:nowrap}}
</style></head><body><header class="hero"><p class="eyebrow">Fixture canônico · ProcessBundle v2 · IMPLEMENTABLE</p><h1>RSC-PCCTAE: do processo à aplicação</h1><p>Prévia autocontida da engenharia reversa. A tabela mostra onde a pessoa atua, qual ação reconhece, que operação é executada, quais prazos se aplicam e o que muda depois.</p><div class="metrics"><span><strong>${report.coverage.bpmnActivities}</strong>atividades completas</span><span><strong>${report.coverage.operations}</strong>operações</span><span><strong>${report.coverage.forms}</strong>formulários</span><span><strong>${report.coverage.dataAssets}</strong>ativos de dados</span><span><strong>${report.coverage.decisions}</strong>decisões</span></div></header><nav><a href="#tabela">Tabela operacional</a><a href="#publico">Visão pública</a><a href="#dados">Dados e formulários</a><a href="#acesso">Perfis e grupos</a><a href="./preview.html">Abrir BPMN</a></nav><main>
<section id="tabela"><p class="eyebrow">Rastreabilidade operacional</p><h2>O que, quem, onde, como e o que acontece depois</h2><div class="scroll"><table><thead><tr><th>Fase e atividade</th><th>Quem</th><th>Onde</th><th>Ação e operação</th><th>Prazo</th><th>Resultado</th></tr></thead><tbody>${previewRows}</tbody></table></div></section>
<section id="publico"><p class="eyebrow">Projeção pública</p><h2>Como funciona o RSC-PCCTAE</h2><ol>${publicPhases}</ol><p class="notice">Esta projeção não inclui rotas, handlers, cron, políticas internas, evidências de código nem requisitos de infraestrutura.</p></section>
<section id="dados"><p class="eyebrow">Inventários</p><h2>Dados, documentos e formulários</h2><div class="cards">${dataAssets.spec.assets.map((asset) => `<article class="card"><small>${escapeHtml(asset.kind)} · ${escapeHtml(asset.classification)}</small><h3>${escapeHtml(asset.label)}</h3><code>${escapeHtml(asset.key)}</code><p>${escapeHtml(asset.schemaPath ?? "Conceito sem schema")}</p></article>`).join("")}${forms.spec.forms.map((form) => `<article class="card"><small>FORMULÁRIO · ${escapeHtml(form.fields.length)} campos</small><h3>${escapeHtml(form.label)}</h3><code>${escapeHtml(form.key)}</code><p>${escapeHtml(form.uiSchemaDialect)}</p></article>`).join("")}</div></section>
<section id="acesso"><p class="eyebrow">Autorização canônica</p><h2>Perfis e grupos até suas capacidades</h2><div class="cards">${[...access.spec.profiles, ...access.spec.groups].map((subject) => `<article class="card"><small>${subject.groupRefs ? "PERFIL" : "GRUPO"}</small><h3>${escapeHtml(subject.label)}</h3><code>${escapeHtml(subject.key)}</code><p>${escapeHtml((subject.groupRefs ?? subject.grantRefs ?? []).join(", "))}</p></article>`).join("")}</div></section>
</main></body></html>`;
await writeFile(resolve(root, "preview-v2.html"), previewHtml, "utf8");
console.log(JSON.stringify({ bundle: "rsc-as-is.process-bundle-v2.zip", valid: report.valid, coverage: report.coverage, resources: report.resources.length }, null, 2));
