import {
  processBundleV2ManifestSchema,
  processBundleV2ResourceSchema,
  type AccessCatalogResource,
  type DataAssetCatalogResource,
  type ElementBindingCatalogResource,
  type FormCatalogResource,
  type OperationalTraceabilityResource,
  type ProcessBundleV2Resource,
  type ProjectionCatalogResource,
  type ProvenanceCatalogResource,
  type SoftwareCatalogResource,
} from "@furg/processos-contracts";
import { extractBpmnOutline, validateBpmnModel } from "@furg/processos-bpmn";
import JSZip from "jszip";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { sha256 } from "./build.js";
import { defaultBundleLimits, type BundleCoverage, type BundleLimits, type BundleValidationIssue, type BundleValidationReport } from "./types.js";

const emptyCoverage = (): BundleCoverage => ({
  bpmnActivities: 0,
  boundActivities: 0,
  tracedActivities: 0,
  completeMappings: 0,
  operations: 0,
  entryPoints: 0,
  forms: 0,
  dataAssets: 0,
  evidence: 0,
  publicPhases: 0,
  decisions: 0,
  stateMachines: 0,
  jobs: 0,
  notifications: 0,
  accessSubjects: 0,
});

const activityTypes = new Set(["task", "userTask", "serviceTask", "manualTask", "businessRuleTask", "sendTask", "receiveTask", "scriptTask", "callActivity", "subProcess"]);
const executableExtensions = /\.(?:c?js|mjs|jsx|ts|tsx|php|py|rb|sh|ps1|bat|cmd|com|exe|dll|so|dylib|jar|class|wasm)$/i;
const executableMediaTypes = new Set(["application/javascript", "text/javascript", "application/x-sh", "application/x-httpd-php", "application/wasm", "application/x-msdownload"]);
const schemaValidator = new Ajv2020({ allErrors: true, strict: false });
addFormats(schemaValidator);
const issueFromZod = (path: string, error: { issues: Array<{ path: Array<string | number>; message: string }> }): BundleValidationIssue[] => error.issues.map((item) => ({
  severity: "error",
  code: "SCHEMA_INVALID",
  path: [path, ...item.path].join("."),
  message: item.message,
}));

const resource = <T extends ProcessBundleV2Resource["kind"]>(resources: ProcessBundleV2Resource[], kind: T) => resources.find((item) => item.kind === kind) as Extract<ProcessBundleV2Resource, { kind: T }> | undefined;

function validateReferences(resources: ProcessBundleV2Resource[], bpmnXml: string, profile: "DOCUMENTARY" | "ANALYZABLE" | "IMPLEMENTABLE" | "EXECUTABLE", issues: BundleValidationIssue[], bundlePaths: Set<string>) {
  const elements = resource(resources, "ElementBindingCatalog") as ElementBindingCatalogResource | undefined;
  const traces = resource(resources, "OperationalTraceabilityCatalog") as OperationalTraceabilityResource | undefined;
  const software = resource(resources, "SoftwareCatalog") as SoftwareCatalogResource | undefined;
  const data = resource(resources, "DataAssetCatalog") as DataAssetCatalogResource | undefined;
  const forms = resource(resources, "FormCatalog") as FormCatalogResource | undefined;
  const access = resource(resources, "AccessCatalog") as AccessCatalogResource | undefined;
  const provenance = resource(resources, "ProvenanceCatalog") as ProvenanceCatalogResource | undefined;
  const projections = resource(resources, "ProjectionCatalog") as ProjectionCatalogResource | undefined;
  const context = resource(resources, "InstitutionalContextCatalog");
  const automation = resource(resources, "AutomationCatalog");
  const decisions = resource(resources, "DecisionCatalog");
  const states = resource(resources, "StateCatalog");
  const communications = resource(resources, "CommunicationCatalog");
  const definition = resource(resources, "ProcessDefinition");
  const phases = resource(resources, "PhaseCatalog");
  const release = resource(resources, "ProcessRelease");
  const outline = extractBpmnOutline(bpmnXml);
  const bpmnIds = new Set(outline.map((item) => item.id));
  const bpmnXmlIds = new Set([...bpmnXml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!));
  const bpmnActivities = outline.filter((item) => activityTypes.has(item.type));
  const elementRefs = new Set(elements?.spec.elements.map((item) => item.semanticId) ?? []);
  const phaseRefs = new Set(phases?.spec.phases.map((item) => item.key) ?? []);
  const operationRefs = new Set(software?.spec.operations.map((item) => item.key) ?? []);
  const entryPointRefs = new Set(software?.spec.entryPoints.map((item) => item.key) ?? []);
  const systemRefs = new Set(software?.spec.systems.map((item) => item.key) ?? []);
  const moduleRefs = new Set(software?.spec.modules.map((item) => item.key) ?? []);
  const dataRefs = new Set(data?.spec.assets.map((item) => item.key) ?? []);
  const formRefs = new Set(forms?.spec.forms.map((item) => item.key) ?? []);
  const policyRefs = new Set(access?.spec.policies.map((item) => item.key) ?? []);
  const groupRefs = new Set(access?.spec.groups.map((item) => item.key) ?? []);
  const profileRefs = new Set(access?.spec.profiles.map((item) => item.key) ?? []);
  const grantRefs = new Set(access?.spec.grants.map((item) => item.key) ?? []);
  const evidenceRefs = new Set(provenance?.spec.evidence.map((item) => item.key) ?? []);
  const sourceArtifactRefs = new Set(provenance?.spec.sourceArtifacts.map((item) => item.key) ?? []);
  const actorRefs = new Set(access?.spec.actors.map((item) => item.key) ?? []);
  const actionRefs = new Set(traces?.spec.activities.flatMap((item) => item.completionActions.map((action) => action.key)) ?? []);
  const timingRefs = new Set(automation?.spec.timingPolicies.map((item) => item.key) ?? []);
  const organizationRefs = new Set(context?.spec.organizationUnits.map((item) => item.key) ?? []);
  const affiliationRefs = new Set(context?.spec.affiliations.map((item) => item.key) ?? []);
  const positionRefs = new Set(context?.spec.positions.map((item) => item.key) ?? []);
  const domainRefs = new Set(context?.spec.domains.map((item) => item.key) ?? []);
  const decisionRefs = new Set(decisions?.spec.decisions.map((item) => item.key) ?? []);
  const stateMachineRefs = new Set(states?.spec.machines.map((item) => item.key) ?? []);
  const templateRefs = new Set(communications?.spec.templates.map((item) => item.key) ?? []);
  const accessSubjectRefs = new Set([...actorRefs, ...groupRefs, ...profileRefs]);
  const audienceRefs = new Set([...accessSubjectRefs, ...affiliationRefs, ...positionRefs]);

  const declaredKeys = new Map<string, string>();
  const declare = (key: string, owner: string) => {
    const previous = declaredKeys.get(key);
    if (previous) issues.push({ severity: "error", code: "DUPLICATE_SEMANTIC_KEY", path: key, message: `A chave semântica está duplicada em ${previous} e ${owner}.` });
    else declaredKeys.set(key, owner);
  };
  for (const item of resources) declare(item.metadata.key, item.kind);
  for (const item of phases?.spec.phases ?? []) declare(item.key, "fase");
  for (const item of elements?.spec.elements ?? []) declare(item.semanticId, "elemento BPMN");
  for (const activity of traces?.spec.activities ?? []) for (const action of activity.completionActions) {
    declare(action.key, "ação de conclusão");
    for (const precondition of action.preconditions) declare(precondition.key, "pré-condição");
  }
  for (const item of data?.spec.assets ?? []) declare(item.key, "dado ou documento");
  for (const item of forms?.spec.forms ?? []) declare(item.key, "formulário");
  for (const item of software?.spec.systems ?? []) declare(item.key, "sistema");
  for (const item of software?.spec.modules ?? []) declare(item.key, "módulo");
  for (const item of software?.spec.entryPoints ?? []) declare(item.key, "ponto de entrada");
  for (const item of software?.spec.operations ?? []) declare(item.key, "operação");
  for (const item of access?.spec.actors ?? []) declare(item.key, "ator");
  for (const item of access?.spec.profiles ?? []) declare(item.key, "perfil");
  for (const item of access?.spec.groups ?? []) declare(item.key, "grupo");
  for (const item of access?.spec.grants ?? []) declare(item.key, "concessão");
  for (const item of access?.spec.policies ?? []) declare(item.key, "política");
  for (const item of automation?.spec.timingPolicies ?? []) declare(item.key, "política de prazo");
  for (const item of automation?.spec.jobs ?? []) declare(item.key, "rotina agendada");
  for (const item of automation?.spec.integrations ?? []) declare(item.key, "integração");
  for (const projection of projections?.spec.projections ?? []) {
    declare(projection.key, "projeção");
    for (const item of projection.phases) declare(item.key, "fase projetada");
  }
  for (const item of provenance?.spec.sourceArtifacts ?? []) declare(item.key, "fonte");
  for (const item of provenance?.spec.evidence ?? []) declare(item.key, "evidência");
  for (const item of context?.spec.organizationUnits ?? []) declare(item.key, "unidade");
  for (const item of context?.spec.affiliations ?? []) declare(item.key, "vínculo");
  for (const item of context?.spec.positions ?? []) declare(item.key, "cargo");
  for (const item of context?.spec.domains ?? []) declare(item.key, "domínio");
  for (const item of decisions?.spec.decisions ?? []) declare(item.key, "decisão");
  for (const machine of states?.spec.machines ?? []) {
    declare(machine.key, "máquina de estados");
    for (const transition of machine.transitions) declare(transition.key, "transição de estado");
  }
  for (const item of communications?.spec.templates ?? []) declare(item.key, "modelo de comunicação");
  for (const item of communications?.spec.notifications ?? []) declare(item.key, "notificação");

  const requireRef = (ref: string | undefined, candidates: Set<string>, code: string, message: string) => {
    if (ref && !candidates.has(ref)) issues.push({ severity: "error", code, path: ref, message });
  };
  const requireRefs = (refs: string[], candidates: Set<string>, code: string, message: string) => {
    for (const ref of refs) requireRef(ref, candidates, code, message);
  };

  if (context && definition) {
    for (const ref of [definition.spec.ownerUnitRef, ...definition.spec.participantUnitRefs]) if (!organizationRefs.has(ref)) issues.push({ severity: "error", code: "ORGANIZATION_REF_NOT_FOUND", path: ref, message: "Unidade institucional não encontrada no contexto do bundle." });
  }

  for (const binding of elements?.spec.elements ?? []) {
    if (!bpmnIds.has(binding.bpmnElementId)) issues.push({ severity: "error", code: "BPMN_ELEMENT_NOT_FOUND", elementId: binding.bpmnElementId, message: `O elemento ${binding.bpmnElementId} não existe no BPMN.` });
    requireRef(binding.phaseRef, phaseRefs, "PHASE_REF_NOT_FOUND", "Fase do elemento BPMN não encontrada.");
  }

  for (const phase of phases?.spec.phases ?? []) requireRefs(phase.elementRefs, elementRefs, "PHASE_ELEMENT_REF_NOT_FOUND", "A fase referencia um elemento inexistente.");

  const boundBpmnIds = new Set(elements?.spec.elements.map((item) => item.bpmnElementId) ?? []);
  for (const activity of bpmnActivities) {
    if (!boundBpmnIds.has(activity.id)) issues.push({ severity: profile === "DOCUMENTARY" ? "warning" : "error", code: "UNBOUND_BPMN_ACTIVITY", elementId: activity.id, message: `A atividade BPMN ${activity.name} não possui identidade semântica.` });
  }

  for (const trace of traces?.spec.activities ?? []) {
    if (!elementRefs.has(trace.activityRef)) issues.push({ severity: "error", code: "ACTIVITY_REF_NOT_FOUND", path: trace.activityRef, message: "A rastreabilidade referencia uma atividade inexistente." });
    for (const ref of trace.interactionPointRefs) if (!entryPointRefs.has(ref)) issues.push({ severity: "error", code: "ENTRY_POINT_REF_NOT_FOUND", path: ref, message: "Ponto de interação não encontrado." });
    for (const ref of [...trace.inputRefs, ...trace.outputRefs]) if (!dataRefs.has(ref)) issues.push({ severity: "error", code: "DATA_REF_NOT_FOUND", path: ref, message: "Ativo de informação não encontrado." });
    for (const ref of trace.evidenceRefs) if (!evidenceRefs.has(ref)) issues.push({ severity: "error", code: "EVIDENCE_REF_NOT_FOUND", path: ref, message: "Evidência não encontrada." });
    for (const ref of trace.actorRefs) if (access && !actorRefs.has(ref)) issues.push({ severity: "error", code: "ACTOR_REF_NOT_FOUND", path: ref, message: "Ator não encontrado no catálogo de acesso." });
    for (const ref of trace.organizationUnitRefs) if (context && !organizationRefs.has(ref)) issues.push({ severity: "error", code: "ORGANIZATION_REF_NOT_FOUND", path: ref, message: "Unidade da atividade não encontrada." });
    for (const ref of trace.timingPolicyRefs) if (!timingRefs.has(ref)) issues.push({ severity: "error", code: "TIMING_REF_NOT_FOUND", path: ref, message: "Política de prazo não encontrada." });
    for (const action of trace.completionActions) {
      if (action.targetFlowRef && !bpmnXmlIds.has(action.targetFlowRef)) issues.push({ severity: "error", code: "TARGET_FLOW_REF_NOT_FOUND", path: action.targetFlowRef, message: "O fluxo de destino da ação não existe no BPMN." });
      for (const ref of action.operationRefs) if (!operationRefs.has(ref)) issues.push({ severity: "error", code: "OPERATION_REF_NOT_FOUND", path: ref, message: "Operação não encontrada." });
      for (const ref of action.formRefs) if (!formRefs.has(ref)) issues.push({ severity: "error", code: "FORM_REF_NOT_FOUND", path: ref, message: "Formulário não encontrado." });
      for (const ref of action.policyRefs) if (!policyRefs.has(ref)) issues.push({ severity: "error", code: "POLICY_REF_NOT_FOUND", path: ref, message: "Política não encontrada." });
      for (const ref of action.evidenceRefs) if (!evidenceRefs.has(ref)) issues.push({ severity: "error", code: "EVIDENCE_REF_NOT_FOUND", path: ref, message: "Evidência não encontrada." });
      for (const effect of action.effects) {
        if (effect.type === "STATE_TRANSITION") requireRef(effect.stateMachineRef, stateMachineRefs, "EFFECT_STATE_MACHINE_REF_NOT_FOUND", "Máquina de estados da ação não encontrada.");
        if (effect.type === "START_ACTIVITY") requireRef(effect.activityRef, elementRefs, "EFFECT_ACTIVITY_REF_NOT_FOUND", "Atividade iniciada pela ação não encontrada.");
        if (effect.type === "CREATE_DATA" || effect.type === "UPDATE_DATA") requireRef(effect.dataRef, dataRefs, "EFFECT_DATA_REF_NOT_FOUND", "Dado alterado pela ação não encontrado.");
        if (effect.type === "GENERATE_DOCUMENT") requireRef(effect.documentRef, dataRefs, "EFFECT_DOCUMENT_REF_NOT_FOUND", "Documento gerado pela ação não encontrado.");
      }
    }

    if (["HUMAN_UI", "HYBRID"].includes(trace.executionMode) && trace.interactionPointRefs.length === 0) {
      issues.push({ severity: profile === "IMPLEMENTABLE" ? "error" : "warning", code: "INTERACTION_POINT_REQUIRED", path: trace.activityRef, message: "Atividade interativa sem aplicação ou ponto de entrada." });
    }
    if (trace.executionMode === "HUMAN_EXTERNAL" && !trace.externalProcedure) {
      issues.push({ severity: profile === "IMPLEMENTABLE" ? "error" : "warning", code: "EXTERNAL_PROCEDURE_REQUIRED", path: trace.activityRef, message: "Atividade externa sem local ou procedimento declarado." });
    }
    if (profile === "IMPLEMENTABLE" && trace.completionActions.length === 0) {
      issues.push({ severity: "error", code: "COMPLETION_ACTION_REQUIRED", path: trace.activityRef, message: "Atividade implementável sem ação ou resultado de conclusão." });
    }
    if (profile === "IMPLEMENTABLE" && trace.mappingStatus !== "COMPLETE") {
      issues.push({ severity: "error", code: "INCOMPLETE_OPERATIONAL_MAPPING", path: trace.activityRef, message: "Perfil IMPLEMENTABLE exige mapeamento operacional completo." });
    }
    if (trace.mappingStatus !== "COMPLETE" && !trace.gapReason) {
      issues.push({ severity: "error", code: "GAP_REASON_REQUIRED", path: trace.activityRef, message: "Mapeamento incompleto deve explicar a lacuna." });
    }
  }

  for (const form of forms?.spec.forms ?? []) {
    if (!dataRefs.has(form.dataSchemaRef)) issues.push({ severity: "error", code: "FORM_DATA_REF_NOT_FOUND", path: form.key, message: "O formulário referencia um contrato de dados inexistente." });
    requireRefs(form.activityRefs, elementRefs, "FORM_ACTIVITY_REF_NOT_FOUND", "Atividade do formulário não encontrada.");
    requireRefs(form.actionRefs, actionRefs, "FORM_ACTION_REF_NOT_FOUND", "Ação do formulário não encontrada na rastreabilidade.");
    requireRefs(form.actions, operationRefs, "FORM_OPERATION_REF_NOT_FOUND", "Operação executada pelo formulário não encontrada.");
    requireRefs(form.audienceRefs, audienceRefs, "FORM_AUDIENCE_REF_NOT_FOUND", "Público do formulário não encontrado no catálogo de acesso.");
    for (const field of form.fields) requireRefs(field.policyRefs, policyRefs, "FORM_FIELD_POLICY_REF_NOT_FOUND", "Política de campo do formulário não encontrada.");
  }
  for (const asset of data?.spec.assets ?? []) {
    if (asset.schemaPath && !bundlePaths.has(asset.schemaPath)) issues.push({ severity: "error", code: "DATA_SCHEMA_FILE_NOT_FOUND", path: asset.schemaPath, message: "Arquivo de schema declarado no inventário não existe no bundle." });
    requireRef(asset.ownerUnitRef, organizationRefs, "DATA_OWNER_UNIT_REF_NOT_FOUND", "Unidade responsável pelo dado não encontrada.");
    requireRef(asset.stewardRef, accessSubjectRefs, "DATA_STEWARD_REF_NOT_FOUND", "Responsável pela curadoria do dado não encontrado.");
    requireRef(asset.authoritativeSourceRef, systemRefs, "DATA_SOURCE_SYSTEM_REF_NOT_FOUND", "Sistema oficial do dado não encontrado.");
    requireRefs(asset.evidenceRefs, evidenceRefs, "DATA_EVIDENCE_REF_NOT_FOUND", "Evidência do dado não encontrada.");
  }
  for (const module of software?.spec.modules ?? []) requireRef(module.systemRef, systemRefs, "MODULE_SYSTEM_REF_NOT_FOUND", "Sistema do módulo não encontrado.");
  for (const system of software?.spec.systems ?? []) requireRef(system.ownerUnitRef, organizationRefs, "SYSTEM_OWNER_UNIT_REF_NOT_FOUND", "Unidade responsável pelo sistema não encontrada.");
  const moduleByKey = new Map(software?.spec.modules.map((item) => [item.key, item]) ?? []);
  for (const item of [...(software?.spec.entryPoints ?? []), ...(software?.spec.operations ?? [])]) {
    requireRef(item.systemRef, systemRefs, "SOFTWARE_SYSTEM_REF_NOT_FOUND", "Sistema da operação ou tela não encontrado.");
    requireRef(item.moduleRef, moduleRefs, "SOFTWARE_MODULE_REF_NOT_FOUND", "Módulo da operação ou tela não encontrado.");
    if (item.moduleRef && moduleByKey.get(item.moduleRef)?.systemRef !== item.systemRef) issues.push({ severity: "error", code: "SOFTWARE_MODULE_SYSTEM_MISMATCH", path: item.key, message: "O módulo selecionado pertence a outro sistema." });
    requireRefs(item.evidenceRefs, evidenceRefs, "SOFTWARE_EVIDENCE_REF_NOT_FOUND", "Evidência da operação ou tela não encontrada.");
  }
  for (const profile of access?.spec.profiles ?? []) {
    requireRefs(profile.groupRefs, groupRefs, "PROFILE_GROUP_REF_NOT_FOUND", "Grupo do perfil não encontrado.");
    requireRef(profile.sourceSystemRef, systemRefs, "PROFILE_SYSTEM_REF_NOT_FOUND", "Sistema de origem do perfil não encontrado.");
  }
  for (const group of access?.spec.groups ?? []) {
    requireRefs(group.grantRefs, grantRefs, "GROUP_GRANT_REF_NOT_FOUND", "Concessão do grupo não encontrada.");
    requireRef(group.sourceSystemRef, systemRefs, "GROUP_SYSTEM_REF_NOT_FOUND", "Sistema de origem do grupo não encontrado.");
  }
  for (const grant of access?.spec.grants ?? []) {
    requireRefs(grant.subjectRefs, accessSubjectRefs, "GRANT_SUBJECT_REF_NOT_FOUND", "Sujeito da concessão não encontrado.");
    requireRefs(grant.actionRefs, actionRefs, "GRANT_ACTION_REF_NOT_FOUND", "Concessão referencia ação inexistente.");
    requireRefs(grant.resourceRefs, new Set(declaredKeys.keys()), "GRANT_RESOURCE_REF_NOT_FOUND", "Recurso protegido pela concessão não encontrado.");
    requireRefs(grant.policyRefs, policyRefs, "GRANT_POLICY_REF_NOT_FOUND", "Política da concessão não encontrada.");
  }
  for (const policy of access?.spec.policies ?? []) requireRefs(policy.evidenceRefs, evidenceRefs, "POLICY_EVIDENCE_REF_NOT_FOUND", "Evidência da política não encontrada.");
  for (const job of automation?.spec.jobs ?? []) {
    requireRef(job.operationRef, operationRefs, "JOB_OPERATION_REF_NOT_FOUND", "Operação da rotina agendada não encontrada.");
    requireRef(job.ownerUnitRef, organizationRefs, "JOB_OWNER_UNIT_REF_NOT_FOUND", "Unidade responsável pela rotina não encontrada.");
  }
  for (const integration of automation?.spec.integrations ?? []) {
    requireRef(integration.sourceSystemRef, systemRefs, "INTEGRATION_SOURCE_SYSTEM_REF_NOT_FOUND", "Sistema de origem da integração não encontrado.");
    requireRef(integration.targetSystemRef, systemRefs, "INTEGRATION_TARGET_SYSTEM_REF_NOT_FOUND", "Sistema de destino da integração não encontrado.");
    requireRefs(integration.operationRefs, operationRefs, "INTEGRATION_OPERATION_REF_NOT_FOUND", "Operação da integração não encontrada.");
  }
  for (const decision of decisions?.spec.decisions ?? []) {
    for (const ref of decision.activityRefs) if (!elementRefs.has(ref)) issues.push({ severity: "error", code: "DECISION_ACTIVITY_REF_NOT_FOUND", path: ref, message: "Decisão referencia atividade inexistente." });
    for (const ref of [...decision.inputRefs, ...decision.outputRefs]) if (!dataRefs.has(ref)) issues.push({ severity: "error", code: "DECISION_DATA_REF_NOT_FOUND", path: ref, message: "Decisão referencia dado inexistente." });
    requireRefs(decision.evidenceRefs, evidenceRefs, "DECISION_EVIDENCE_REF_NOT_FOUND", "Evidência da decisão não encontrada.");
    if (decision.modelPath && !bundlePaths.has(decision.modelPath)) issues.push({ severity: "error", code: "DECISION_MODEL_FILE_NOT_FOUND", path: decision.modelPath, message: "Modelo declarado pela decisão não existe no pacote." });
  }
  for (const machine of states?.spec.machines ?? []) {
    requireRef(machine.subjectRef, dataRefs, "STATE_SUBJECT_REF_NOT_FOUND", "Dado acompanhado pela máquina de estados não encontrado.");
    const machineStates = new Set(machine.states);
    if (machineStates.size !== machine.states.length) issues.push({ severity: "error", code: "DUPLICATE_STATE", path: machine.key, message: "A máquina de estados contém estados duplicados." });
    if (!machineStates.has(machine.initialState)) issues.push({ severity: "error", code: "INITIAL_STATE_NOT_FOUND", path: machine.initialState, message: "O estado inicial não está declarado na máquina." });
    requireRefs(machine.terminalStates, machineStates, "TERMINAL_STATE_NOT_FOUND", "Estado final não declarado na máquina.");
    for (const transition of machine.transitions) {
      requireRef(transition.from, machineStates, "STATE_TRANSITION_FROM_NOT_FOUND", "Estado de origem da transição não encontrado.");
      requireRef(transition.to, machineStates, "STATE_TRANSITION_TO_NOT_FOUND", "Estado de destino da transição não encontrado.");
      requireRef(transition.actionRef, actionRefs, "STATE_ACTION_REF_NOT_FOUND", "Transição de estado referencia ação inexistente.");
      requireRef(transition.operationRef, operationRefs, "STATE_OPERATION_REF_NOT_FOUND", "Transição de estado referencia operação inexistente.");
      requireRef(transition.conditionRef, decisionRefs, "STATE_CONDITION_REF_NOT_FOUND", "Decisão usada como condição da transição não encontrada.");
    }
  }

  for (const projection of projections?.spec.projections ?? []) {
    const projectedPhaseRefs = new Set(projection.phases.map((item) => item.key));
    for (const phase of projection.phases) {
      for (const ref of phase.internalElementRefs) if (!elementRefs.has(ref)) issues.push({ severity: "error", code: "PROJECTION_ELEMENT_NOT_FOUND", path: ref, message: "A projeção referencia elemento interno inexistente." });
      requireRefs(phase.nextPhaseRefs, projectedPhaseRefs, "PROJECTION_NEXT_PHASE_REF_NOT_FOUND", "Próxima fase da projeção não encontrada.");
    }
    requireRefs(projection.excludedResourceRefs, new Set(declaredKeys.keys()), "PROJECTION_EXCLUDED_RESOURCE_REF_NOT_FOUND", "Recurso excluído da projeção não encontrado.");
  }

  for (const item of provenance?.spec.evidence ?? []) {
    requireRefs(item.sourceArtifactRefs, sourceArtifactRefs, "EVIDENCE_SOURCE_REF_NOT_FOUND", "Fonte da evidência não encontrada.");
    requireRefs(item.validatesRefs, new Set(declaredKeys.keys()), "EVIDENCE_TARGET_REF_NOT_FOUND", "Elemento validado pela evidência não encontrado.");
  }
  requireRefs(release?.spec.sourceArtifactRefs ?? [], sourceArtifactRefs, "RELEASE_SOURCE_REF_NOT_FOUND", "Fonte da publicação não encontrada.");
  for (const unit of context?.spec.organizationUnits ?? []) requireRef(unit.parentRef, organizationRefs, "ORGANIZATION_PARENT_REF_NOT_FOUND", "Unidade superior não encontrada.");
  for (const domain of context?.spec.domains ?? []) requireRef(domain.parentRef, domainRefs, "DOMAIN_PARENT_REF_NOT_FOUND", "Domínio superior não encontrado.");
  if (definition) {
    requireRefs(definition.spec.audienceRefs, audienceRefs, "PROCESS_AUDIENCE_REF_NOT_FOUND", "Público do processo não encontrado no contexto institucional ou no catálogo de acesso.");
    requireRefs(definition.spec.taxonomyRefs, new Set([...domainRefs, ...affiliationRefs, ...positionRefs]), "PROCESS_TAXONOMY_REF_NOT_FOUND", "Classificação institucional do processo não encontrada.");
  }
  for (const template of communications?.spec.templates ?? []) if (template.templatePath && !bundlePaths.has(template.templatePath)) issues.push({ severity: "error", code: "COMMUNICATION_TEMPLATE_FILE_NOT_FOUND", path: template.templatePath, message: "Arquivo do modelo de comunicação não existe no pacote." });
  for (const notification of communications?.spec.notifications ?? []) {
    requireRefs(notification.recipientRefs, accessSubjectRefs, "NOTIFICATION_RECIPIENT_REF_NOT_FOUND", "Destinatário da notificação não encontrado.");
    requireRef(notification.templateRef, templateRefs, "NOTIFICATION_TEMPLATE_REF_NOT_FOUND", "Modelo da notificação não encontrado.");
    requireRefs(notification.activityRefs, elementRefs, "NOTIFICATION_ACTIVITY_REF_NOT_FOUND", "Atividade da notificação não encontrada.");
    requireRefs(notification.evidenceRefs, evidenceRefs, "NOTIFICATION_EVIDENCE_REF_NOT_FOUND", "Evidência da notificação não encontrada.");
  }

  return {
    bpmnActivities: bpmnActivities.length,
    boundActivities: bpmnActivities.filter((item) => boundBpmnIds.has(item.id)).length,
    tracedActivities: traces?.spec.activities.length ?? 0,
    completeMappings: traces?.spec.activities.filter((item) => item.mappingStatus === "COMPLETE").length ?? 0,
    operations: software?.spec.operations.length ?? 0,
    entryPoints: software?.spec.entryPoints.length ?? 0,
    forms: forms?.spec.forms.length ?? 0,
    dataAssets: data?.spec.assets.length ?? 0,
    evidence: provenance?.spec.evidence.length ?? 0,
    publicPhases: projections?.spec.projections.filter((item) => item.audience === "PUBLIC").reduce((sum, item) => sum + item.phases.length, 0) ?? 0,
    decisions: decisions?.spec.decisions.length ?? 0,
    stateMachines: states?.spec.machines.length ?? 0,
    jobs: automation?.spec.jobs.length ?? 0,
    notifications: communications?.spec.notifications.length ?? 0,
    accessSubjects: (access?.spec.profiles.length ?? 0) + (access?.spec.groups.length ?? 0),
  } satisfies BundleCoverage;
}

export async function validateProcessBundleV2(input: Buffer | Uint8Array, limits: Partial<BundleLimits> = {}): Promise<BundleValidationReport> {
  const appliedLimits = { ...defaultBundleLimits, ...limits };
  const issues: BundleValidationIssue[] = [];
  const resources: ProcessBundleV2Resource[] = [];
  if (input.byteLength > appliedLimits.maxCompressedBytes) return { valid: false, resources, issues: [{ severity: "error", code: "BUNDLE_TOO_LARGE", message: "Bundle compactado excede o limite permitido." }], coverage: emptyCoverage() };

  let zip: JSZip;
  try { zip = await JSZip.loadAsync(input); }
  catch { return { valid: false, resources, issues: [{ severity: "error", code: "INVALID_ZIP", message: "O arquivo não é um ZIP válido." }], coverage: emptyCoverage() }; }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > appliedLimits.maxEntries) issues.push({ severity: "error", code: "TOO_MANY_ENTRIES", message: "O bundle excede o número máximo de arquivos." });
  for (const entry of entries) {
    if (entry.name.startsWith("/") || entry.name.includes("..") || entry.name.includes("\\") || (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)) {
      issues.push({ severity: "error", code: "UNSAFE_PATH", path: entry.name, message: "O bundle contém caminho inseguro." });
    }
  }

  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) return { valid: false, resources, issues: [...issues, { severity: "error", code: "MANIFEST_REQUIRED", message: "manifest.json não encontrado." }], coverage: emptyCoverage() };
  let manifest;
  try {
    const parsed = JSON.parse(await manifestEntry.async("string"));
    const result = processBundleV2ManifestSchema.safeParse(parsed);
    if (!result.success) return { valid: false, resources, issues: [...issues, ...issueFromZod("manifest.json", result.error)], coverage: emptyCoverage() };
    manifest = result.data;
  } catch {
    return { valid: false, resources, issues: [...issues, { severity: "error", code: "MANIFEST_INVALID_JSON", message: "manifest.json não contém JSON válido." }], coverage: emptyCoverage() };
  }

  const manifestPaths = new Set(manifest.files.map((file) => file.path));
  const actualPaths = new Set(entries.map((entry) => entry.name).filter((path) => path !== "manifest.json"));
  for (const path of actualPaths) if (!manifestPaths.has(path)) issues.push({ severity: "error", code: "UNDECLARED_FILE", path, message: "Arquivo não declarado no manifesto." });
  for (const path of manifestPaths) if (!actualPaths.has(path)) issues.push({ severity: "error", code: "DECLARED_FILE_MISSING", path, message: "Arquivo declarado não encontrado." });

  let totalBytes = 0;
  const contents = new Map<string, Buffer>();
  for (const descriptor of manifest.files) {
    const entry = zip.file(descriptor.path);
    if (!entry) continue;
    const content = await entry.async("nodebuffer");
    contents.set(descriptor.path, content);
    totalBytes += content.byteLength;
    if (content.byteLength > appliedLimits.maxFileBytes) issues.push({ severity: "error", code: "FILE_TOO_LARGE", path: descriptor.path, message: "Arquivo excede o limite individual." });
    if (content.byteLength !== descriptor.size) issues.push({ severity: "error", code: "SIZE_MISMATCH", path: descriptor.path, message: "Tamanho diferente do manifesto." });
    if (sha256(content) !== descriptor.sha256) issues.push({ severity: "error", code: "HASH_MISMATCH", path: descriptor.path, message: "Hash diferente do manifesto." });
    if (executableExtensions.test(descriptor.path) || executableMediaTypes.has(descriptor.mediaType.toLowerCase())) {
      issues.push({ severity: "error", code: "EXECUTABLE_CONTENT_FORBIDDEN", path: descriptor.path, message: "Bundles não podem transportar código executável." });
    }
    if ((descriptor.mediaType.includes("xml") || /\.(?:bpmn|dmn|xml)$/i.test(descriptor.path)) && /<!DOCTYPE|<!ENTITY/i.test(content.toString("utf8"))) {
      issues.push({ severity: "error", code: "XML_EXTERNAL_ENTITY_FORBIDDEN", path: descriptor.path, message: "DOCTYPE e entidades externas não são aceitos em XML importado." });
    }
    if ((descriptor.mediaType === "text/markdown" || /\.md$/i.test(descriptor.path)) && /<script\b|\bon\w+\s*=|javascript\s*:/i.test(content.toString("utf8"))) {
      issues.push({ severity: "error", code: "UNSAFE_MARKDOWN", path: descriptor.path, message: "Markdown importado contém HTML ativo ou URL insegura." });
    }
  }
  if (totalBytes > appliedLimits.maxUncompressedBytes) issues.push({ severity: "error", code: "UNCOMPRESSED_BUNDLE_TOO_LARGE", message: "Conteúdo descompactado excede o limite permitido." });

  for (const descriptor of manifest.files.filter((file) => file.mediaType === "application/json" && file.path !== "manifest.json")) {
    const content = contents.get(descriptor.path);
    if (!content) continue;
    try {
      const parsed = JSON.parse(content.toString("utf8"));
      if (parsed?.apiVersion === "processos.furg.br/v2" && parsed?.kind) {
        const result = processBundleV2ResourceSchema.safeParse(parsed);
        if (!result.success) issues.push(...issueFromZod(descriptor.path, result.error));
        else resources.push(result.data);
      }
    } catch {
      issues.push({ severity: "error", code: "INVALID_JSON", path: descriptor.path, message: "Arquivo JSON inválido." });
    }
  }

  for (const descriptor of manifest.files.filter((file) => file.mediaType === "application/schema+json" || file.path.endsWith(".schema.json"))) {
    const content = contents.get(descriptor.path);
    if (!content) continue;
    try {
      const schema = JSON.parse(content.toString("utf8"));
      if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") issues.push({ severity: "error", code: "JSON_SCHEMA_DIALECT_REQUIRED", path: descriptor.path, message: "Schemas de dados devem declarar JSON Schema 2020-12." });
      if (!schemaValidator.validateSchema(schema)) issues.push({ severity: "error", code: "JSON_SCHEMA_INVALID", path: descriptor.path, message: schemaValidator.errorsText(schemaValidator.errors) });
    } catch {
      issues.push({ severity: "error", code: "JSON_SCHEMA_INVALID_JSON", path: descriptor.path, message: "Arquivo de JSON Schema inválido." });
    }
  }

  const requiredKinds = ["ProcessDefinition", "ElementBindingCatalog", "OperationalTraceabilityCatalog"];
  if (["ANALYZABLE", "IMPLEMENTABLE", "EXECUTABLE"].includes(manifest.profile)) requiredKinds.push("PhaseCatalog", "ProjectionCatalog", "ProvenanceCatalog", "InstitutionalContextCatalog");
  if (["IMPLEMENTABLE", "EXECUTABLE"].includes(manifest.profile)) requiredKinds.push("SoftwareCatalog", "DataAssetCatalog", "FormCatalog", "AccessCatalog", "AutomationCatalog", "DecisionCatalog", "StateCatalog", "CommunicationCatalog");
  for (const kind of requiredKinds) if (!resources.some((item) => item.kind === kind)) issues.push({ severity: "error", code: "RESOURCE_REQUIRED", path: kind, message: `Recurso obrigatório ausente: ${kind}.` });
  const resourceKeys = new Set<string>();
  const resourceKinds = new Set<string>();
  for (const item of resources) {
    if (resourceKeys.has(item.metadata.key)) issues.push({ severity: "error", code: "DUPLICATE_RESOURCE_KEY", path: item.metadata.key, message: "Chave de recurso duplicada no bundle." });
    if (resourceKinds.has(item.kind)) issues.push({ severity: "error", code: "DUPLICATE_RESOURCE_KIND", path: item.kind, message: "O bundle contém mais de um catálogo para o mesmo kind." });
    resourceKeys.add(item.metadata.key);
    resourceKinds.add(item.kind);
  }
  const definition = resource(resources, "ProcessDefinition");
  if (definition) {
    const identityChecks = [
      [definition.metadata.key, manifest.processDefinitionKey, "processDefinitionKey"],
      [definition.spec.processVersionId, manifest.processVersionId, "processVersionId"],
      [definition.spec.bindingSetVersionId, manifest.bindingSetVersionId, "bindingSetVersionId"],
      [definition.spec.releaseId, manifest.releaseId, "releaseId"],
      [definition.spec.profile, manifest.profile, "profile"],
    ] as const;
    for (const [actual, expected, field] of identityChecks) if (actual !== expected) issues.push({ severity: "error", code: "MANIFEST_IDENTITY_MISMATCH", path: field, message: `${field} diverge entre manifesto e ProcessDefinition.` });
    if (definition.spec.bpmnPath !== "process/process.bpmn") issues.push({ severity: "error", code: "BPMN_PATH_MISMATCH", path: definition.spec.bpmnPath, message: "ProcessDefinition deve apontar para process/process.bpmn." });
  }
  const release = resource(resources, "ProcessRelease");
  if (release && (release.spec.releaseId !== manifest.releaseId || release.spec.processVersionId !== manifest.processVersionId || release.spec.bindingSetVersionId !== manifest.bindingSetVersionId || release.spec.processDefinitionRef !== manifest.processDefinitionKey)) {
    issues.push({ severity: "error", code: "RELEASE_IDENTITY_MISMATCH", path: "ProcessRelease", message: "ProcessRelease diverge da composição declarada no manifesto." });
  }
  const bpmnXml = contents.get("process/process.bpmn")?.toString("utf8");
  let coverage = emptyCoverage();
  if (!bpmnXml) issues.push({ severity: "error", code: "BPMN_REQUIRED", message: "BPMN não encontrado." });
  else {
    issues.push(...(await validateBpmnModel(bpmnXml)).map((item) => ({ ...item, code: `BPMN_${item.code.toUpperCase().replaceAll("-", "_")}` })));
    if (!issues.some((item) => item.severity === "error" && item.code.startsWith("BPMN_"))) {
      try { coverage = validateReferences(resources, bpmnXml, manifest.profile, issues, manifestPaths); }
      catch (error) { issues.push({ severity: "error", code: "BPMN_SEMANTIC_READ_FAILED", message: error instanceof Error ? error.message : "Não foi possível interpretar o BPMN." }); }
    }
  }

  return { valid: !issues.some((item) => item.severity === "error"), manifest, resources, issues, coverage };
}
