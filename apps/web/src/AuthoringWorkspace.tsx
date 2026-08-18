import { useEffect, useMemo, useState, type FormEvent } from "react";
import Form from "@rjsf/core";
import { getTemplate, getUiOptions, type ArrayFieldItemTemplateProps, type ArrayFieldTemplateProps, type RJSFSchema, type UiSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { FurgButton, FurgChip, FurgMessage, FurgProgressIndicator } from "@furg/design-system/react";
import type { ProcessBundleV2Resource, ProcessDetail, ProcessRelation, ProcessSummary } from "@furg/processos-contracts";
import { relationLabels } from "@furg/processos-contracts";
import accessSchema from "../../../packages/contracts/schemas/v2/access.schema.json";
import automationSchema from "../../../packages/contracts/schemas/v2/automation.schema.json";
import communicationsSchema from "../../../packages/contracts/schemas/v2/communications.schema.json";
import dataAssetsSchema from "../../../packages/contracts/schemas/v2/data-assets.schema.json";
import decisionsSchema from "../../../packages/contracts/schemas/v2/decisions.schema.json";
import elementBindingsSchema from "../../../packages/contracts/schemas/v2/element-bindings.schema.json";
import formsSchema from "../../../packages/contracts/schemas/v2/forms.schema.json";
import institutionalContextSchema from "../../../packages/contracts/schemas/v2/institutional-context.schema.json";
import operationalTraceabilitySchema from "../../../packages/contracts/schemas/v2/operational-traceability.schema.json";
import phaseCatalogSchema from "../../../packages/contracts/schemas/v2/phase-catalog.schema.json";
import processDefinitionSchema from "../../../packages/contracts/schemas/v2/process-definition.schema.json";
import projectionsSchema from "../../../packages/contracts/schemas/v2/projections.schema.json";
import provenanceSchema from "../../../packages/contracts/schemas/v2/provenance.schema.json";
import releaseSchema from "../../../packages/contracts/schemas/v2/release.schema.json";
import softwareSchema from "../../../packages/contracts/schemas/v2/software.schema.json";
import statesSchema from "../../../packages/contracts/schemas/v2/states.schema.json";
import {
  createProcessRelation, deleteProcessRelation, forkProcessVersion, getAuthoringState, listOrganizations,
  listProcesses, updateContractResource, updateProcessRelation, updateResponsibilities,
  type AuthoringState, type RelationInput,
} from "./api";
import { technicalLabel } from "./v2Labels";

const schemas: Record<string, RJSFSchema> = {
  AccessCatalog: accessSchema as RJSFSchema,
  AutomationCatalog: automationSchema as RJSFSchema,
  CommunicationCatalog: communicationsSchema as RJSFSchema,
  DataAssetCatalog: dataAssetsSchema as RJSFSchema,
  DecisionCatalog: decisionsSchema as RJSFSchema,
  ElementBindingCatalog: elementBindingsSchema as RJSFSchema,
  FormCatalog: formsSchema as RJSFSchema,
  InstitutionalContextCatalog: institutionalContextSchema as RJSFSchema,
  OperationalTraceabilityCatalog: operationalTraceabilitySchema as unknown as RJSFSchema,
  PhaseCatalog: phaseCatalogSchema as RJSFSchema,
  ProcessDefinition: processDefinitionSchema as RJSFSchema,
  ProjectionCatalog: projectionsSchema as RJSFSchema,
  ProvenanceCatalog: provenanceSchema as unknown as RJSFSchema,
  ProcessRelease: releaseSchema as RJSFSchema,
  SoftwareCatalog: softwareSchema as RJSFSchema,
  StateCatalog: statesSchema as RJSFSchema,
};

const resourceLabels: Record<string, { label: string; group: string; description: string }> = {
  ProcessDefinition: { label: "Definição do processo", group: "Identidade", description: "Identidade, vigência, perspectiva e referências institucionais." },
  PhaseCatalog: { label: "Fases e prazos esperados", group: "Processo", description: "Agrupamento público e institucional das atividades." },
  ElementBindingCatalog: { label: "Elementos do BPMN", group: "Processo", description: "De-para entre os elementos visuais e seus identificadores semânticos." },
  OperationalTraceabilityCatalog: { label: "Atividades e ações", group: "Processo", description: "Quem faz, onde faz, ações disponíveis, efeitos e regras." },
  ProjectionCatalog: { label: "Visões por público", group: "Processo", description: "Conteúdo publicado para cada nível de visibilidade." },
  DataAssetCatalog: { label: "Dados e documentos", group: "Informação", description: "Inventário, classificação, origem e retenção." },
  FormCatalog: { label: "Formulários e campos", group: "Informação", description: "Campos, componentes, acesso e regras condicionais." },
  AccessCatalog: { label: "Perfis, grupos e permissões", group: "Acesso", description: "Atores, concessões e políticas de autorização." },
  SoftwareCatalog: { label: "Sistemas, telas e operações", group: "Implementação", description: "Aplicações, módulos, caminhos de tela e operações técnicas." },
  AutomationCatalog: { label: "Prazos, rotinas e integrações", group: "Implementação", description: "Prazos, agendamentos, infraestrutura e integrações." },
  DecisionCatalog: { label: "Decisões e regras", group: "Implementação", description: "Decisões narrativas, declarativas ou modeladas." },
  StateCatalog: { label: "Estados e transições", group: "Implementação", description: "Ciclo de vida dos registros acompanhados pelo processo." },
  CommunicationCatalog: { label: "Comunicações", group: "Implementação", description: "Notificações, destinatários e modelos de mensagem." },
  InstitutionalContextCatalog: { label: "Contexto institucional", group: "Governança", description: "Unidades, vínculos, cargos e domínios referenciados." },
  ProvenanceCatalog: { label: "Fontes e evidências", group: "Governança", description: "Origem, confiança, validação e divergências do mapeamento." },
  ProcessRelease: { label: "Composição da publicação", group: "Governança", description: "Identidades técnicas e período de vigência da publicação." },
};

const propertyLabels: Record<string, string> = {
  access: "Acesso", acronym: "Sigla", actionRef: "Referência da ação", actionRefs: "Referências de ações", actions: "Ações", activities: "Atividades", activityRef: "Referência da atividade", activityRefs: "Referências de atividades", actorRefs: "Referências de atores", actors: "Atores", affiliations: "Vínculos institucionais", apiVersion: "Versão da API", assets: "Dados e documentos", audience: "Público", audienceRefs: "Referências de públicos", authoritativeSource: "Fonte oficial", authoritativeSourceRef: "Referência da fonte oficial", bindingSetVersionId: "Identificador da versão dos vínculos", bpmnElementId: "Identificador do elemento BPMN", bpmnPath: "Caminho do arquivo BPMN", calendarRef: "Referência do calendário", capturedAt: "Data da coleta", channel: "Canal", classification: "Classificação", commit: "Commit", completionActions: "Ações de conclusão", component: "Componente", concurrencyLock: "Controle de concorrência", conditionRef: "Referência da condição", confidence: "Confiança", configurationRequirements: "Requisitos de configuração", createdAt: "Criado em", dataRef: "Referência do dado", dataSchemaRef: "Referência do esquema de dados", decisions: "Decisões", definitionId: "Identificador da definição", deprecated: "Descontinuada", description: "Descrição", discrepancy: "Divergência", documentRef: "Referência do documento", domains: "Domínios", duration: "Duração", effect: "Efeito", effectiveFrom: "Vigente a partir de", effectiveUntil: "Vigente até", effects: "Efeitos", elementRefs: "Referências de elementos", elementType: "Tipo de elemento", elements: "Elementos", endLine: "Linha final", entryPoints: "Pontos de entrada", environmentUrls: "Endereços por ambiente", eventRef: "Referência do evento", evidence: "Evidências", evidenceRefs: "Referências de evidências", excludedResourceRefs: "Recursos excluídos", executionMode: "Modo de execução", executor: "Executor", expectedDuration: "Duração esperada", expectedDurationLabel: "Prazo apresentado ao público", expression: "Expressão", expressionLanguage: "Linguagem da expressão", externalProcedure: "Procedimento externo", fields: "Campos", formRefs: "Referências de formulários", forms: "Formulários", from: "Origem", gapReason: "Motivo da lacuna", grantRefs: "Referências de concessões", grants: "Concessões", groupRefs: "Referências de grupos", groups: "Grupos", handler: "Manipulador técnico", id: "Identificador", idempotency: "Idempotência", initialState: "Estado inicial", inputRefs: "Entradas", integrations: "Integrações", interactionPointRefs: "Pontos de interação", internalElementRefs: "Elementos internos", jobs: "Rotinas agendadas", key: "Chave semântica", kind: "Tipo", label: "Nome", labels: "Categorias", layer: "Camada", location: "Localização", machines: "Máquinas de estados", mappingStatus: "Situação do mapeamento", menuPath: "Caminho no menu", metadata: "Identificação do recurso", method: "Método", modelPath: "Caminho do modelo", moduleRef: "Referência do módulo", modules: "Módulos", monitoring: "Monitoramento", nextPhaseRefs: "Próximas fases", normativeBasisRefs: "Fundamentos normativos", notation: "Notação", notifications: "Notificações", operationRef: "Referência da operação", operationRefs: "Referências de operações", operations: "Operações", order: "Ordem", organizationUnitRefs: "Unidades participantes", organizationUnits: "Unidades organizacionais", outputRefs: "Saídas", ownerUnitRef: "Unidade responsável", parentRef: "Referência superior", participantUnitRefs: "Unidades participantes", path: "Caminho", pauseConditions: "Condições de suspensão", perspective: "Perspectiva", phaseRef: "Referência da fase", phases: "Fases", policies: "Políticas", policyRefs: "Referências de políticas", positions: "Cargos", preconditions: "Pré-condições", procedureRef: "Referência do procedimento", processDefinitionRef: "Referência da definição", processVersionId: "Identificador da versão do processo", profile: "Perfil de conformidade", profiles: "Perfis", projections: "Projeções", protocol: "Protocolo", publicLabel: "Nome público", publishedAt: "Publicado em", pullRequest: "Solicitação de mudança", recipientRefs: "Destinatários", releaseId: "Identificador da publicação", repository: "Repositório", requiredRule: "Regra de obrigatoriedade", resourceRefs: "Referências de recursos", responsibleLabel: "Responsável apresentado", retentionPolicy: "Política de retenção", retryPolicy: "Política de novas tentativas", ruleLanguage: "Linguagem da regra", schedule: "Agendamento", schemaPath: "Caminho do esquema", screenRef: "Referência da tela", secretRefs: "Referências de segredos", semanticId: "Identificador semântico", sourceArtifactRefs: "Referências das fontes", sourceArtifacts: "Fontes", sourceSystemRef: "Sistema de origem", spec: "Conteúdo", startLine: "Linha inicial", stateMachineRef: "Referência da máquina de estados", states: "Estados", status: "Situação", stewardRef: "Responsável pela curadoria do dado", subjectRef: "Referência do objeto", subjectRefs: "Referências dos sujeitos", summary: "Resumo", systemRef: "Referência do sistema", systems: "Sistemas", tag: "Etiqueta", targetFlowRef: "Fluxo de destino", targetSystemRef: "Sistema de destino", taxonomyRefs: "Classificações", templatePath: "Caminho do modelo", templateRef: "Referência do modelo", templates: "Modelos", terminalStates: "Estados finais", timezone: "Fuso horário", timingPolicies: "Políticas de prazo", timingPolicyRefs: "Referências de prazos", title: "Título", to: "Destino", transitions: "Transições", trigger: "Disparo", type: "Tipo", uiSchemaDialect: "Padrão da interface", updatedAt: "Atualizado em", url: "Endereço", validFrom: "Válido a partir de", validUntil: "Válido até", validatedAt: "Validado em", validatedBy: "Validado por", validatesRefs: "Itens validados", version: "Versão", visibility: "Visibilidade", visibilityRule: "Regra de visibilidade", warnings: "Avisos",
};

const enumLabels: Record<string, string> = {
  ALLOW: "Permitir", ARCHIVED: "Arquivado", CANCEL: "Cancelar", CAPABILITY: "Capacidade", CEL: "CEL", COMPLETE: "Concluir", CREATE_DATA: "Criar dado", DENY: "Negar", DERIVED: "Calculado", DMN: "DMN", EMAIL: "E-mail", EMIT_EVENT: "Emitir evento", EXPECTED_DURATION: "Duração esperada", FIELD_DOCUMENT: "Campo ou documento", FEEL: "FEEL", GENERATE_DOCUMENT: "Gerar documento", HTTP: "HTTP", IN_APP: "Na aplicação", INTERNAL: "Interna", INTERNAL_SLA: "Acordo interno de prazo", IN_REVIEW: "Em revisão", JSON_LOGIC: "Lógica JSON", MESSAGE: "Mensagem", NOT_APPLICABLE: "Não aplicável", OTHER: "Outro", OUTCOME: "Resultado", PARTIAL: "Parcial", PERSON: "Pessoa", POSITION: "Cargo", PUBLISHED: "Publicado", RECORD_SCOPE: "Abrangência do registro", RETRY: "Tentar novamente", SMS: "SMS", START_ACTIVITY: "Iniciar atividade", STATE: "Estado", STATE_TRANSITION: "Alterar estado", SUPERSEDED: "Substituído", UNKNOWN: "Desconhecido", UPDATE_DATA: "Atualizar dado",
};

const rjsfTranslations: Record<string, string> = {
  "Item": "Item", "Missing items definition": "Definição dos itens ausente", "No items yet. Use the button below to add some.": "Nenhum item cadastrado. Use o botão abaixo para adicionar.",
  "Yes": "Sim", "No": "Não", "Close": "Fechar", "Errors": "Erros", "New Value": "Novo valor", "Add": "Adicionar", "Add Item": "Adicionar item", "Copy": "Copiar", "Expand Cycle": "Expandir ciclo", "Move down": "Mover para baixo", "Move up": "Mover para cima", "Remove": "Remover", "Now": "Agora", "Clear": "Limpar", "Select a date": "Selecionar uma data", "Preview": "Pré-visualização", "Decrease value by 1": "Diminuir o valor em 1", "Increase value by 1": "Aumentar o valor em 1", "Add data for optional field": "Adicionar dados ao campo opcional", "Remove data for optional field": "Remover dados do campo opcional", "No data for optional field": "Campo opcional sem dados", "Type": "Tipo", "Value": "Valor", "clear input": "limpar campo", "%1 Key": "Chave técnica de %1", "%1 (deprecated)": "%1 (descontinuado)",
};

function translateRjsf(value: string, params?: string[]) {
  let translated = rjsfTranslations[value] ?? value;
  params?.forEach((parameter, index) => { translated = translated.replaceAll(`%${index + 1}`, parameter); });
  return translated;
}

function AccordionArrayTemplate(props: ArrayFieldTemplateProps) {
  const { canAdd, disabled, fieldPathId, items, onAddClick, optionalDataControl, readonly, registry, required, schema, title, uiSchema } = props;
  const [openIndex, setOpenIndex] = useState(items.length ? 0 : -1);
  const uiOptions = getUiOptions(uiSchema);
  const Title = getTemplate("ArrayFieldTitleTemplate", registry, uiOptions);
  const Description = getTemplate("ArrayFieldDescriptionTemplate", registry, uiOptions);
  const displayTitle = String(uiOptions.title || title);
  return <fieldset className="contract-array" id={fieldPathId.$id}><Title fieldPathId={fieldPathId} optionalDataControl={!readonly && !disabled ? optionalDataControl : undefined} registry={registry} required={required} schema={schema} title={displayTitle} uiSchema={uiSchema} /><Description description={uiOptions.description || schema.description} fieldPathId={fieldPathId} registry={registry} schema={schema} uiSchema={uiSchema} />{readonly || disabled ? optionalDataControl : null}<div className="contract-array__items">{items.map((item, index) => <section className="contract-array__item" key={item.key ?? index}><button aria-expanded={openIndex === index} className="contract-array__trigger" onClick={() => setOpenIndex((current) => current === index ? -1 : index)} type="button"><span>{displayTitle} {String(index + 1).padStart(2, "0")}</span><small>{openIndex === index ? "Recolher" : "Abrir"}</small></button>{openIndex === index ? <div className="contract-array__content">{item}</div> : null}</section>)}</div>{canAdd ? <button className="contract-array__add" disabled={disabled || readonly} onClick={onAddClick} type="button">Adicionar item</button> : null}</fieldset>;
}

function ContractArrayItemTemplate({ buttonsProps, children, disabled, hasToolbar, readonly }: ArrayFieldItemTemplateProps) {
  const locked = disabled || readonly;
  return <div className="contract-array-item"><div className="contract-array-item__content">{children}</div>{hasToolbar && !locked ? <div className="contract-array-item__actions">
    {(buttonsProps.hasMoveUp || buttonsProps.hasMoveDown) ? <button disabled={!buttonsProps.hasMoveUp} onClick={buttonsProps.onMoveUpItem} type="button">Mover para cima</button> : null}
    {(buttonsProps.hasMoveUp || buttonsProps.hasMoveDown) ? <button disabled={!buttonsProps.hasMoveDown} onClick={buttonsProps.onMoveDownItem} type="button">Mover para baixo</button> : null}
    {buttonsProps.hasCopy ? <button onClick={buttonsProps.onCopyItem} type="button">Duplicar</button> : null}
    {buttonsProps.hasRemove ? <button className="is-remove" onClick={buttonsProps.onRemoveItem} type="button">Remover</button> : null}
  </div> : null}</div>;
}

function localizeSchema(source: RJSFSchema): RJSFSchema {
  const copy = structuredClone(source) as Record<string, any>;
  function visit(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.properties) for (const [key, property] of Object.entries<any>(node.properties)) {
      property.title = propertyLabels[key] ?? key;
      visit(property);
    }
    if (Array.isArray(node.enum)) {
      node.oneOf = node.enum.map((value: string) => ({ const: value, title: enumLabels[value] ?? technicalLabel(value) }));
      delete node.enum;
    }
    if (node.items) visit(node.items);
    if (node.definitions) Object.values(node.definitions).forEach(visit);
    if (node.anyOf) node.anyOf.forEach(visit);
    if (node.oneOf && !node.oneOf.every((item: any) => Object.hasOwn(item, "const"))) node.oneOf.forEach(visit);
  }
  visit(copy);
  return copy as RJSFSchema;
}

const localizedSchemas = Object.fromEntries(Object.entries(schemas).map(([kind, schema]) => [kind, localizeSchema(schema)]));
const readonlyUi: UiSchema = {
  apiVersion: { "ui:readonly": true }, kind: { "ui:readonly": true },
  metadata: { id: { "ui:readonly": true }, createdAt: { "ui:readonly": true }, updatedAt: { "ui:readonly": true } },
  spec: {
    definitionId: { "ui:readonly": true }, processVersionId: { "ui:readonly": true }, bindingSetVersionId: { "ui:readonly": true }, releaseId: { "ui:readonly": true }, processDefinitionRef: { "ui:readonly": true }, bpmnPath: { "ui:readonly": true }, ownerUnitRef: { "ui:readonly": true }, participantUnitRefs: { "ui:readonly": true },
  },
};

const relationTypes = Object.entries(relationLabels) as Array<[RelationInput["type"], string]>;

export function AuthoringWorkspace({ process, onChanged, onValidationChange }: { process: ProcessDetail; onChanged: () => Promise<void> | void; onValidationChange?: (validation?: AuthoringState["validation"]) => void }) {
  const version = process.currentVersion;
  const [state, setState] = useState<AuthoringState>();
  const [selected, setSelected] = useState("responsibilities");
  const [draft, setDraft] = useState<ProcessBundleV2Resource>();
  const [reason, setReason] = useState("");
  const [organizations, setOrganizations] = useState<Awaited<ReturnType<typeof listOrganizations>>>([]);
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function load() {
    if (!version) return;
    setLoading(true);
    setError(undefined);
    try {
      const [authoring, units, catalog] = await Promise.all([getAuthoringState(process.id, version.id), listOrganizations(), listProcesses()]);
      setState(authoring); setOrganizations(units); setProcesses(catalog); onValidationChange?.(authoring.validation);
    } catch (cause) { onValidationChange?.(undefined); setError(cause instanceof Error ? cause.message : "Não foi possível abrir a autoria do contrato."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [process.id, version?.id]);
  useEffect(() => {
    const resource = state?.resources.find((item) => item.semanticKey === selected);
    setDraft(resource ? structuredClone(resource.content) : undefined);
    setReason(""); setNotice(undefined);
  }, [selected, state]);

  const grouped = useMemo(() => {
    const groups = new Map<string, AuthoringState["resources"]>();
    for (const resource of state?.resources ?? []) {
      const group = resourceLabels[resource.kind]?.group ?? "Outros";
      groups.set(group, [...(groups.get(group) ?? []), resource]);
    }
    return groups;
  }, [state]);

  const selectedResource = state?.resources.find((item) => item.semanticKey === selected);
  const selectedResourceIssues = selectedResource
    ? state?.validation.issues.filter((issue) => issue.path?.startsWith(selectedResource.path)) ?? []
    : [];

  if (!version || version.contractVersion !== "v2") return <FurgMessage title="Autoria estruturada indisponível" message="Esta versão usa o contrato anterior. Importe ou migre o processo para o contrato v2 antes de editar os inventários estruturados." tone="warning" />;
  if (loading) return <FurgProgressIndicator label="Abrindo a mesa de autoria" />;
  if (error && !state) return <FurgMessage title="Mesa de autoria indisponível" message={error} tone="danger" />;
  if (!state) return null;

  async function fork() {
    if (!version) return;
    setSaving(true); setError(undefined);
    try {
      const created = await forkProcessVersion(process.id, version.id);
      setNotice(`A revisão ${created.revision} foi criada como rascunho editável.`);
      await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a nova versão."); }
    finally { setSaving(false); }
  }

  async function saveResource() {
    if (!draft || !version || !reason.trim()) return;
    setSaving(true); setError(undefined);
    try {
      await updateContractResource(process.id, version.id, selected, draft, reason);
      setNotice("Alteração salva no contrato e no pacote desta versão.");
      await load(); await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o recurso."); }
    finally { setSaving(false); }
  }

  return <section className="authoring-workspace" aria-label="Mesa de autoria do processo">
    <header className="authoring-workspace__header"><div><p className="eyebrow">Contrato v2 · revisão {state.version.revision}</p><h2>Mesa de autoria</h2><p>Edite o conteúdo que alimenta o BPMN vinculado, as tabelas, inventários, perfis e projeções. Cada salvamento contratual recompõe e valida o pacote canônico.</p></div><FurgChip label={state.editable ? "Rascunho editável" : "Versão imutável"} tone={state.editable ? "warning" : "success"} /></header>
    {error ? <FurgMessage title="Alteração não concluída" message={error} tone="danger" /> : null}
    {notice ? <FurgMessage title="Autoria atualizada" message={notice} tone="success" /> : null}
    {!state.editable ? <div className="authoring-fork"><div><h3>Preservar a publicação atual</h3><p>Versões publicadas não são alteradas. Crie uma nova revisão em rascunho com todo o conteúdo e os vínculos já copiados.</p></div><FurgButton icon="arrow-forward" loading={saving} onClick={() => void fork()}>Criar nova versão</FurgButton></div> : null}
    <div className="authoring-layout">
      <nav className="authoring-index" aria-label="Áreas editáveis">
        <section><h3>Cadastro</h3><button aria-current={selected === "responsibilities" ? "page" : undefined} onClick={() => setSelected("responsibilities")}><strong>Responsabilidade e unidades</strong><small>Responsável e participantes oficiais</small></button><button aria-current={selected === "relations" ? "page" : undefined} onClick={() => setSelected("relations")}><strong>Relações entre processos</strong><small>Encadeamento e processo relacionado</small></button></section>
        {[...grouped.entries()].map(([group, resources]) => <section key={group}><h3>{group}</h3>{resources.map((resource) => <button aria-current={selected === resource.semanticKey ? "page" : undefined} key={resource.semanticKey} onClick={() => setSelected(resource.semanticKey)}><strong>{resourceLabels[resource.kind]?.label ?? resource.kind}</strong><small>{resourceLabels[resource.kind]?.description}</small></button>)}</section>)}
      </nav>
      <main className="authoring-editor">
        {selected === "responsibilities" ? <ResponsibilitiesEditor disabled={!state.capabilities.canEdit} organizations={organizations} process={process} state={state} onSaved={async () => { await load(); await onChanged(); }} /> : null}
        {selected === "relations" ? <RelationsEditor disabled={!state.capabilities.canEdit} process={process} processes={processes} onSaved={onChanged} /> : null}
        {draft && selected !== "responsibilities" && selected !== "relations" ? <>
          <header><p className="eyebrow">{resourceLabels[draft.kind]?.group}</p><h2>{resourceLabels[draft.kind]?.label}</h2><p>{resourceLabels[draft.kind]?.description}</p></header>
          {selectedResourceIssues.length ? <FurgMessage title={`${selectedResourceIssues.length} ${selectedResourceIssues.length === 1 ? "apontamento neste conteúdo" : "apontamentos neste conteúdo"}`} message="Consulte a integridade do pacote para ver os detalhes antes de encaminhar a versão para revisão." tone={selectedResourceIssues.some((issue) => issue.severity === "error") ? "danger" : "warning"} /> : null}
          {!state.capabilities.canEditTechnical && ["SoftwareCatalog", "AutomationCatalog"].includes(draft.kind) ? <FurgMessage title="Administração técnica protegida" message="Sistemas, operações, rotinas e integrações podem ser consultados aqui, mas somente administradores do CGTI podem oficializar alterações." tone="info" /> : null}
          <Form className="contract-form" disabled={!state.capabilities.canEdit || (["SoftwareCatalog", "AutomationCatalog"].includes(draft.kind) && !state.capabilities.canEditTechnical)} formData={draft} onChange={(event) => setDraft(event.formData as ProcessBundleV2Resource)} onSubmit={() => void saveResource()} schema={(localizedSchemas[draft.kind] ?? schemas[draft.kind])!} showErrorList="top" templates={{ ArrayFieldItemTemplate: ContractArrayItemTemplate, ArrayFieldTemplate: AccordionArrayTemplate }} translateString={translateRjsf} uiSchema={readonlyUi} validator={validator}>
            <label className="authoring-reason"><span>Motivo da alteração</span><textarea disabled={!state.capabilities.canEdit} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Explique o ajuste para o histórico de auditoria." required rows={3} value={reason} /></label>
            <div className="authoring-actions"><FurgButton disabled={!reason.trim() || !state.capabilities.canEdit || (["SoftwareCatalog", "AutomationCatalog"].includes(draft.kind) && !state.capabilities.canEditTechnical)} icon="check" loading={saving} type="submit">Salvar no contrato</FurgButton></div>
          </Form>
        </> : null}
      </main>
    </div>
  </section>;
}

function ResponsibilitiesEditor({ disabled, organizations, process, state, onSaved }: { disabled: boolean; organizations: Awaited<ReturnType<typeof listOrganizations>>; process: ProcessDetail; state: AuthoringState; onSaved: () => Promise<void> | void }) {
  const [ownerUnitId, setOwnerUnitId] = useState(state.responsibilities.ownerUnit.id);
  const [participants, setParticipants] = useState(() => new Set(state.responsibilities.participantUnits.map((unit) => unit.id).filter((id) => id !== state.responsibilities.ownerUnit.id)));
  const [reason, setReason] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  async function submit(event: FormEvent) { event.preventDefault(); if (!process.currentVersion) return; setSaving(true); setError(undefined); try { await updateResponsibilities(process.id, process.currentVersion.id, { ownerUnitId, participantUnitIds: [...participants], reason }); await onSaved(); setReason(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar as unidades."); } finally { setSaving(false); } }
  return <form className="responsibilities-editor" onSubmit={submit}><header><p className="eyebrow">Responsabilidade institucional</p><h2>Unidades oficiais do processo</h2><p>O responsável responde pelo processo. Participantes colaboram em etapas específicas. As opções vêm do cadastro institucional reconciliado.</p></header>{error ? <FurgMessage title="Unidades não atualizadas" message={error} tone="danger" /> : null}<label><span>Unidade responsável</span><select disabled={disabled} onChange={(event) => setOwnerUnitId(event.target.value)} value={ownerUnitId}>{organizations.map((unit) => <option key={unit.id} value={unit.id}>{unit.acronym} - {unit.name}</option>)}</select></label><fieldset disabled={disabled}><legend>Unidades participantes</legend><div className="participant-options">{organizations.filter((unit) => unit.id !== ownerUnitId).map((unit) => <label key={unit.id}><input checked={participants.has(unit.id)} onChange={(event) => setParticipants((current) => { const next = new Set(current); if (event.target.checked) next.add(unit.id); else next.delete(unit.id); return next; })} type="checkbox" /><span><strong>{unit.acronym}</strong>{unit.name}</span></label>)}</div></fieldset><label className="authoring-reason"><span>Motivo da alteração</span><textarea disabled={disabled} maxLength={1000} onChange={(event) => setReason(event.target.value)} required rows={3} value={reason} /></label><div className="authoring-actions"><FurgButton disabled={disabled || !reason.trim()} loading={saving} type="submit">Salvar responsabilidades</FurgButton></div></form>;
}

function RelationsEditor({ disabled, process, processes, onSaved }: { disabled: boolean; process: ProcessDetail; processes: ProcessSummary[]; onSaved: () => Promise<void> | void }) {
  const empty: RelationInput = { targetProcessId: "", type: "RELATED_TO", label: "", sourceElementId: "" };
  const [form, setForm] = useState<RelationInput>(empty); const [saving, setSaving] = useState(false); const [error, setError] = useState<string>();
  const names = new Map(processes.map((item) => [item.id, item.title]));
  async function create(event: FormEvent) { event.preventDefault(); if (!process.currentVersion) return; setSaving(true); setError(undefined); try { await createProcessRelation(process.id, process.currentVersion.id, form); setForm(empty); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a relação."); } finally { setSaving(false); } }
  async function save(relation: ProcessRelation, input: Omit<RelationInput, "targetProcessId">) { if (!process.currentVersion) return; setSaving(true); setError(undefined); try { await updateProcessRelation(process.id, process.currentVersion.id, relation.id, input); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar a relação."); } finally { setSaving(false); } }
  async function remove(relation: ProcessRelation) { if (!process.currentVersion || !window.confirm("Remover esta relação entre processos?")) return; setSaving(true); setError(undefined); try { await deleteProcessRelation(process.id, process.currentVersion.id, relation.id); await onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível remover a relação."); } finally { setSaving(false); } }
  return <section className="relations-editor"><header><p className="eyebrow">Encadeamento institucional</p><h2>Relações entre processos</h2><p>Cadastre a relação a partir do processo de origem. O processo de destino a exibirá automaticamente como uma relação recebida.</p></header>{error ? <FurgMessage title="Relação não atualizada" message={error} tone="danger" /> : null}<div className="relation-editor-list">{process.relations.map((relation) => <RelationRow disabled={disabled || relation.sourceProcessId !== process.id} key={relation.id} name={names.get(relation.sourceProcessId === process.id ? relation.targetProcessId : relation.sourceProcessId) ?? "Processo não disponível"} onRemove={() => void remove(relation)} onSave={(input) => void save(relation, input)} relation={relation} saving={saving} />)}</div><form className="relation-create" onSubmit={create}><h3>Adicionar relação de saída</h3><label><span>Processo relacionado</span><select disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, targetProcessId: event.target.value }))} required value={form.targetProcessId}><option value="">Selecione um processo</option>{processes.filter((item) => item.id !== process.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span>Tipo de relação</span><select disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as RelationInput["type"] }))} value={form.type}>{relationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Descrição para as pessoas</span><input disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} value={form.label} /></label><label><span>Elemento BPMN de origem (opcional)</span><input disabled={disabled} onChange={(event) => setForm((current) => ({ ...current, sourceElementId: event.target.value }))} placeholder="Ex.: Activity_Enviar" value={form.sourceElementId} /></label><FurgButton disabled={disabled || !form.targetProcessId} loading={saving} type="submit">Adicionar relação</FurgButton></form></section>;
}

function RelationRow({ disabled, name, onRemove, onSave, relation, saving }: { disabled: boolean; name: string; onRemove: () => void; onSave: (input: Omit<RelationInput, "targetProcessId">) => void; relation: ProcessRelation; saving: boolean }) {
  const [type, setType] = useState<RelationInput["type"]>(relation.type); const [label, setLabel] = useState(relation.label ?? ""); const [sourceElementId, setSourceElementId] = useState(relation.sourceElementId ?? "");
  return <article className="relation-editor-row"><div><FurgChip label={disabled ? "Relação recebida" : "Relação de saída"} tone={disabled ? "neutral" : "info"} /><h3>{name}</h3></div><label><span>Tipo</span><select disabled={disabled} onChange={(event) => setType(event.target.value as RelationInput["type"])} value={type}>{relationTypes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label><span>Descrição</span><input disabled={disabled} onChange={(event) => setLabel(event.target.value)} value={label} /></label><label><span>Elemento BPMN</span><input disabled={disabled} onChange={(event) => setSourceElementId(event.target.value)} value={sourceElementId} /></label>{disabled ? <small>Edite esta relação no processo de origem.</small> : <div><FurgButton disabled={saving} onClick={() => onSave({ type, label, sourceElementId })} size="small">Salvar</FurgButton><FurgButton disabled={saving} onClick={onRemove} size="small" variant="text">Remover</FurgButton></div>}</article>;
}
