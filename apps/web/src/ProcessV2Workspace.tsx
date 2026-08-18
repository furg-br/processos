import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FurgAccordion, FurgButton, FurgChip, FurgIcon, FurgMessage, FurgProgressIndicator, FurgSurface } from "@furg/design-system/react";
import type { ProcessBundleV2Resource } from "@furg/processos-contracts";
import { getProcessAccessMatrix, getProcessV2Activity, getProcessV2Projection, reviewTechnicalBindings, type ProcessV2Projection } from "./api";
import { fieldLabel, formLabel, technicalLabel } from "./v2Labels";

const BpmnCanvas = lazy(() => import("./BpmnCanvas").then((module) => ({ default: module.BpmnCanvas })));

type View = "table" | "diagram" | "public" | "inventory" | "access" | "engineering" | "governance";
const viewLinks: ReadonlyArray<{ hash: string; id: View; label: string }> = [
  { hash: "tabela-operacional", id: "table", label: "Tabela operacional" },
  { hash: "bpmn-vinculado", id: "diagram", label: "BPMN vinculado" },
  { hash: "previa-publica", id: "public", label: "Prévia pública" },
  { hash: "dados-e-formularios", id: "inventory", label: "Dados e formulários" },
  { hash: "perfis-e-grupos", id: "access", label: "Perfis e grupos" },
  { hash: "implementacao", id: "engineering", label: "Implementação" },
  { hash: "evidencias-e-publicacoes", id: "governance", label: "Evidências e publicações" },
];
const viewFromHash = (hash: string) => viewLinks.find((item) => `#${item.hash}` === hash)?.id;
const hashFromView = (view: View) => viewLinks.find((item) => item.id === view)?.hash ?? "tabela-operacional";
type AnyResource = ProcessBundleV2Resource & { spec: any };
const resource = (resources: ProcessBundleV2Resource[], kind: string) => resources.find((item) => item.kind === kind) as AnyResource | undefined;
const shortKey = (value?: string) => value?.split(".").slice(-3).join(" · ") ?? "Não informado";
const modeLabel: Record<string, string> = { HUMAN_UI: "Pessoa na aplicação", HUMAN_EXTERNAL: "Pessoa fora da plataforma", AUTOMATED: "Automática", HYBRID: "Híbrida", INTEGRATION: "Integração" };

export function ProcessV2Workspace({ locator }: { locator: string }) {
  const [projection, setProjection] = useState<ProcessV2Projection>();
  const [accessMatrix, setAccessMatrix] = useState<Array<{ subjectRef: string; actionRef: string; activityRefs: string[]; policyRefs: string[]; resourceRefs: string[] }>>([]);
  const [view, setView] = useState<View>(() => viewFromHash(globalThis.location?.hash ?? "") ?? "table");
  const [selectedId, setSelectedId] = useState<string>();
  const [activityDetail, setActivityDetail] = useState<any>();
  const [error, setError] = useState<string>();
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    let active = true;
    setError(undefined);
    Promise.all([getProcessV2Projection(locator, "TECHNICAL"), getProcessAccessMatrix(locator)])
      .then(([nextProjection, matrix]) => { if (active) { setProjection(nextProjection); setAccessMatrix(matrix); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o contrato v2."); });
    return () => { active = false; };
  }, [locator]);

  useEffect(() => {
    function synchronizeView() {
      const requestedView = viewFromHash(globalThis.location.hash);
      if (requestedView) setView(requestedView);
    }
    if (!viewFromHash(globalThis.location.hash)) {
      globalThis.history.replaceState(null, "", `${globalThis.location.pathname}${globalThis.location.search}#${hashFromView("table")}`);
    }
    globalThis.addEventListener("hashchange", synchronizeView);
    return () => globalThis.removeEventListener("hashchange", synchronizeView);
  }, []);

  const resources = projection?.resources ?? [];
  const elements = resource(resources, "ElementBindingCatalog")?.spec.elements ?? [];
  const traces = resource(resources, "OperationalTraceabilityCatalog")?.spec.activities ?? [];
  const phases = resource(resources, "PhaseCatalog")?.spec.phases ?? [];
  const software = resource(resources, "SoftwareCatalog")?.spec;
  const forms = resource(resources, "FormCatalog")?.spec.forms ?? [];
  const assets = resource(resources, "DataAssetCatalog")?.spec.assets ?? [];
  const access = resource(resources, "AccessCatalog")?.spec;
  const automation = resource(resources, "AutomationCatalog")?.spec;
  const decisions = resource(resources, "DecisionCatalog")?.spec.decisions ?? [];
  const states = resource(resources, "StateCatalog")?.spec.machines ?? [];
  const communications = resource(resources, "CommunicationCatalog")?.spec;
  const provenance = resource(resources, "ProvenanceCatalog")?.spec;
  const projections = resource(resources, "ProjectionCatalog")?.spec.projections ?? [];
  const publicProjection = projections.find((item: any) => item.audience === "PUBLIC");
  const elementByRef = useMemo(() => new Map(elements.map((item: any) => [item.semanticId, item])), [elements]);
  const traceByRef = useMemo(() => new Map(traces.map((item: any) => [item.activityRef, item])), [traces]);
  const phaseByRef = useMemo(() => new Map(phases.map((item: any) => [item.key, item])), [phases]);
  const entryByRef = useMemo(() => new Map((software?.entryPoints ?? []).map((item: any) => [item.key, item])), [software]);

  const rows = useMemo(() => elements.filter((item: any) => traceByRef.has(item.semanticId)).map((item: any) => {
    const trace: any = traceByRef.get(item.semanticId);
    const actions = trace.completionActions ?? [];
    const entries = trace.interactionPointRefs.map((ref: string) => (entryByRef.get(ref) as any)?.label ?? ref);
    const timing = trace.timingPolicyRefs.map((ref: string) => automation?.timingPolicies.find((policy: any) => policy.key === ref)?.publicLabel ?? ref);
    return { element: item, trace, phase: phaseByRef.get(item.phaseRef), actions, entries, timing };
  }), [automation, elementByRef, elements, entryByRef, phaseByRef, traceByRef]);

  const badges = useMemo(() => rows.map((row: any) => ({
    elementId: row.element.bpmnElementId,
    label: row.entries[0] ? "Aplicação" : row.trace.executionMode === "AUTOMATED" ? "Automação" : "Procedimento",
    tone: row.trace.executionMode === "AUTOMATED" || row.trace.executionMode === "INTEGRATION" ? "automatic" as const : row.trace.executionMode === "HUMAN_EXTERNAL" ? "external" as const : "human" as const,
  })), [rows]);

  const selectActivity = useCallback((semanticId: string) => {
    setSelectedId(semanticId);
    setActivityDetail(undefined);
    void getProcessV2Activity(locator, semanticId).then(setActivityDetail).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível abrir a atividade."));
  }, [locator]);
  const selectBpmnElement = useCallback((bpmnId: string) => {
    const match = elements.find((item: any) => item.bpmnElementId === bpmnId);
    if (match) selectActivity(match.semanticId);
  }, [elements, selectActivity]);

  const reviewBindingSet = useCallback(async (bindingSetVersionId: string, semanticKeys: string[], decision: "APPROVED" | "REJECTED") => {
    if (!projection) return;
    setReviewing(true);
    setError(undefined);
    try {
      await reviewTechnicalBindings(projection.process.id, projection.version.id, { bindingSetVersionId, semanticKeys, decision });
      setProjection(await getProcessV2Projection(locator, "TECHNICAL"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar a revisão técnica.");
    } finally { setReviewing(false); }
  }, [locator, projection]);

  if (error && !projection) return <FurgMessage title="Contrato v2 indisponível" message={`${error} Importe um ProcessBundle v2 para habilitar esta visão.`} tone="warning" />;
  if (!projection) return <FurgProgressIndicator label="Montando a rastreabilidade operacional" />;

  return <section aria-label="Rastreabilidade operacional do processo" className="v2-workspace">
    <header className="v2-workspace__thesis">
      <div><p className="eyebrow">Contrato operacional · {technicalLabel(projection.version.profile)}</p><h2>Do fazer institucional à operação do sistema</h2><p>Cada linha preserva o vínculo entre fase, responsável, lugar de execução, ação disponível, regras e efeito observado.</p></div>
      <dl><div><dt>Atividades</dt><dd>{rows.length}</dd></div><div><dt>Operações</dt><dd>{software?.operations.length ?? 0}</dd></div><div><dt>Formulários</dt><dd>{forms.length}</dd></div><div><dt>Dados</dt><dd>{assets.length}</dd></div></dl>
    </header>
    {error ? <FurgMessage title="A operação não foi concluída" message={error} tone="warning" /> : null}
    <nav className="v2-view-switcher" aria-label="Visões do contrato v2">
      {viewLinks.map((item) => <a aria-current={view === item.id ? "page" : undefined} className={`v2-view-link ${view === item.id ? "is-active" : ""}`} href={`#${item.hash}`} key={item.id} onClick={() => setView(item.id)}>{item.label}</a>)}
    </nav>

    <div className="v2-view-panel" id={hashFromView(view)}>

    {view === "table" ? <div className="operational-layout">
      <div className="table-scroll operational-table"><table><caption>Visão simplificada derivada do contrato, sem cadastro paralelo</caption><thead><tr><th>Fase e atividade</th><th>Quem</th><th>Onde</th><th>Ação disponível</th><th>Tempo</th><th>Resultado</th></tr></thead><tbody>{rows.map((row: any) => <tr className={selectedId === row.element.semanticId ? "is-selected" : ""} key={row.element.semanticId}>
        <td><button className="activity-link" onClick={() => selectActivity(row.element.semanticId)}><small>{row.phase?.label ?? "Sem fase"}</small><strong>{row.element.label}</strong><code>{row.element.semanticId}</code></button></td>
        <td>{row.trace.actorRefs.map(shortKey).join(", ") || "Sistema"}<small>{modeLabel[row.trace.executionMode]}</small></td>
        <td>{row.entries.join(", ") || row.trace.externalProcedure?.location || "Processamento interno"}</td>
        <td>{row.actions.map((action: any) => action.label).join(", ")}</td><td>{row.timing.join(", ") || "Sem prazo próprio"}</td>
        <td>{row.actions.flatMap((action: any) => action.effects).map((effect: any) => shortKey(effect.dataRef ?? effect.documentRef ?? effect.activityRef ?? effect.eventRef)).join(", ") || "Concluir etapa"}</td>
      </tr>)}</tbody></table></div>
      {selectedId ? <ActivityPanel detail={activityDetail} onClose={() => { setSelectedId(undefined); setActivityDetail(undefined); }} /> : null}
    </div> : null}

    {view === "diagram" && projection.bpmnXml ? <div className="v2-diagram"><FurgMessage title="Marcadores operacionais" message="Os marcadores sobre as atividades indicam onde há aplicação, automação ou procedimento externo. Ative um marcador para abrir o vínculo completo." tone="info" /><Suspense fallback={<FurgProgressIndicator label="Preparando o BPMN vinculado" />}><BpmnCanvas editable={false} onElementSelect={selectBpmnElement} operationalBadges={badges} xml={projection.bpmnXml} /></Suspense>{selectedId ? <ActivityPanel detail={activityDetail} onClose={() => { setSelectedId(undefined); setActivityDetail(undefined); }} /> : null}</div> : null}

    {view === "public" ? <PublicProjection projection={publicProjection} /> : null}
    {view === "inventory" ? <Inventory assets={assets} forms={forms} /> : null}
    {view === "access" ? <AccessView access={access} matrix={accessMatrix} /> : null}
    {view === "engineering" ? <EngineeringView automation={automation} communications={communications} decisions={decisions} software={software} states={states} /> : null}
    {view === "governance" ? <GovernanceView bindingSets={projection.bindingSets ?? []} canReview={projection.capabilities?.canReviewTechnicalBindings ?? false} onReview={reviewBindingSet} provenance={provenance} reviewing={reviewing} version={projection.version} /> : null}
    </div>
  </section>;
}

function ActivityPanel({ detail, onClose }: { detail: any; onClose: () => void }) {
  if (!detail) return <aside className="activity-panel"><FurgProgressIndicator label="Abrindo vínculo da atividade" /></aside>;
  return <aside className="activity-panel" aria-label="Detalhes operacionais da atividade">
    <header><div><p className="eyebrow">{modeLabel[detail.trace.executionMode]}</p><h3>{detail.element.label}</h3><code>{detail.element.semanticId}</code></div><FurgButton aria-label="Fechar detalhes" icon="close" onClick={onClose} size="small" variant="text">Fechar</FurgButton></header>
    <section><h4><FurgIcon name="external" size={18} />Onde o usuário vai</h4>{detail.entryPoints.length ? detail.entryPoints.map((entry: any) => <article key={entry.key}><strong>{entry.label}</strong><span>{entry.menuPath.join(" › ") || "Entrada direta"}</span></article>) : <p>{detail.trace.externalProcedure?.location ?? "A atividade é executada automaticamente."}</p>}</section>
    <section><h4><FurgIcon name="arrow-forward" size={18} />Ações e operações</h4>{detail.trace.completionActions.map((action: any) => <article key={action.key}><strong>{action.label}</strong><code>{action.key}</code>{detail.operations.filter((operation: any) => action.operationRefs.includes(operation.key)).map((operation: any) => <div className="operation-contract" key={operation.key}><span>{operation.label}</span><code>{operation.method} {operation.path}</code><FurgChip label={operation.approval === "APPROVED" ? "Vínculo aprovado" : operation.approval === "PENDING" ? "Aguardando CGTI" : technicalLabel(operation.approval)} tone={operation.approval === "APPROVED" ? "success" : "warning"} /></div>)}</article>)}</section>
    <section><h4><FurgIcon name="document" size={18} />Formulários e informação</h4><p>{detail.forms.map((form: any) => formLabel(form.label)).join(", ") || "Sem formulário"}</p><ul>{detail.dataAssets.map((asset: any) => <li key={asset.key}>{asset.label}<small>{technicalLabel(asset.classification)}</small></li>)}</ul></section>
    <section><h4><FurgIcon name="badge" size={18} />Regras e prazo</h4><ul>{detail.policies.map((policy: any) => <li key={policy.key}><strong>{policy.label}</strong><small>{policy.description}</small></li>)}{detail.timingPolicies.map((policy: any) => <li key={policy.key}><strong>{policy.publicLabel ?? policy.label}</strong><small>{policy.duration} · {policy.timezone}</small></li>)}</ul></section>
    <section><h4><FurgIcon name="document" size={18} />Evidências e divergências</h4><ul>{detail.evidence?.map((item: any) => <li key={item.key}><strong>{item.label}</strong><small>{technicalLabel(item.status)} · confiança {Math.round(item.confidence * 100)}%</small>{item.discrepancy ? <span>{item.discrepancy}</span> : null}</li>)}</ul>{detail.evidence?.length ? null : <p>Nenhuma evidência ligada diretamente.</p>}</section>
  </aside>;
}

function PublicProjection({ projection }: { projection: any }) {
  if (!projection) return <FurgMessage title="Projeção pública ausente" message="Defina uma projeção curada antes de publicar o processo." tone="warning" />;
  return <section className="public-projection"><header><p className="eyebrow">O que qualquer pessoa pode consultar</p><h2>{projection.title}</h2><p>{projection.summary}</p></header><FurgAccordion ariaLabel="Fases da visão pública" items={projection.phases.map((phase: any, index: number) => ({ content: <div className="public-phase-detail"><p>{phase.description}</p><dl><div><dt>Responsável</dt><dd>{phase.responsibleLabel}</dd></div><div><dt>Tempo esperado</dt><dd>{phase.expectedDurationLabel ?? "Consulte a unidade"}</dd></div></dl></div>, id: phase.key, open: index === 0, title: `${String(index + 1).padStart(2, "0")} · ${phase.label}` }))} selectionMode="single" /><FurgMessage title="Separação física de visibilidade" message="Rotas internas, manipuladores técnicos, políticas de acesso, agendamentos e requisitos de infraestrutura não fazem parte desta projeção." tone="info" /></section>;
}

function Inventory({ assets, forms }: { assets: any[]; forms: any[] }) {
  return <div className="inventory-grid"><section><p className="eyebrow">Inventário de informação</p><h2>Dados e documentos</h2><FurgAccordion ariaLabel="Dados e documentos catalogados" items={assets.map((asset, index) => ({ content: <div className="inventory-detail"><FurgChip label={technicalLabel(asset.kind)} /><code>{asset.key}</code><dl><div><dt>Classificação</dt><dd>{technicalLabel(asset.classification)}</dd></div><div><dt>Esquema</dt><dd>{asset.schemaPath ?? "Conceito sem esquema"}</dd></div></dl></div>, id: asset.key, open: index === 0, title: asset.label }))} selectionMode="single" /></section><section><p className="eyebrow">Contratos de interação</p><h2>Formulários</h2><FurgAccordion ariaLabel="Formulários catalogados" items={forms.map((form, index) => ({ content: <div className="inventory-detail"><code>{form.key}</code><p>{form.fields.length} campos · dialeto {form.uiSchemaDialect}</p><ul>{form.fields.map((field: any) => <li key={field.path}><span>{fieldLabel(field.label)}</span><small>{technicalLabel(field.component)} · {technicalLabel(field.access)}</small></li>)}</ul></div>, id: form.key, open: index === 0, title: formLabel(form.label) }))} selectionMode="single" /></section></div>;
}

function AccessView({ access, matrix }: { access: any; matrix: any[] }) {
  if (!access) return <FurgMessage title="Catálogo de acesso ausente" message="Mapeie atores, perfis, grupos, concessões e políticas." tone="warning" />;
  return <section className="access-view"><header><p className="eyebrow">Do vínculo institucional à capacidade</p><h2>O que cada perfil ou grupo pode fazer</h2><p>A matriz percorre concessão → ação de interface → atividade → recurso e política aplicável.</p></header><div className="access-subjects">{[...access.profiles, ...access.groups].map((subject: any) => <FurgSurface key={subject.key} padding="medium"><FurgChip label={subject.groupRefs ? "Perfil" : "Grupo"} tone={subject.groupRefs ? "info" : "neutral"} /><h3>{subject.label}</h3><code>{subject.key}</code><strong>{matrix.filter((row) => row.subjectRef === subject.key).length} capacidades rastreadas</strong></FurgSurface>)}</div><div className="table-scroll"><table><caption>Matriz de acesso derivada das concessões canônicas</caption><thead><tr><th>Perfil ou grupo</th><th>Ação</th><th>Atividade</th><th>Recurso</th><th>Política</th></tr></thead><tbody>{matrix.map((row, index) => <tr key={`${row.subjectRef}-${row.actionRef}-${index}`}><td><code>{row.subjectRef}</code></td><td>{shortKey(row.actionRef)}</td><td>{row.activityRefs.map(shortKey).join(", ")}</td><td>{row.resourceRefs.map(shortKey).join(", ")}</td><td>{row.policyRefs.map(shortKey).join(", ")}</td></tr>)}</tbody></table></div></section>;
}

function EngineeringView({ software, automation, communications, decisions, states }: { software: any; automation: any; communications: any; decisions: any[]; states: any[] }) {
  return <section className="engineering-view">
    <header><p className="eyebrow">Arquitetura comportamental</p><h2>Sistemas, regras e mecanismos de execução</h2><p>Esta visão documenta a implementação; ela não transforma o catálogo em motor de fluxo de trabalho.</p></header>
    <div className="inventory-grid">
      <section><h3>Sistemas e pontos de entrada</h3>{software?.systems.map((system: any) => <FurgSurface key={system.key} padding="medium"><FurgChip label="Sistema" tone="info" /><h4>{system.label}</h4><code>{system.key}</code><p>{software.entryPoints.filter((entry: any) => entry.systemRef === system.key).map((entry: any) => `${entry.label}${entry.menuPath.length ? ` · ${entry.menuPath.join(" › ")}` : ""}`).join("; ") || "Sem entrada de interface"}</p><small>{software.operations.filter((operation: any) => operation.systemRef === system.key).length} operações catalogadas</small></FurgSurface>)}</section>
      <section><h3>Rotinas agendadas e integrações</h3>{automation?.jobs.map((job: any) => <FurgSurface key={job.key} padding="medium"><FurgChip label="Rotina agendada" tone="warning" /><h4>{job.label}</h4><code>{job.schedule} · {job.timezone}</code><p>{job.executor} · {job.environment}</p><small>Idempotência: {job.idempotency}; concorrência: {job.concurrencyLock}</small></FurgSurface>)}{automation?.integrations.map((integration: any) => <FurgSurface key={integration.key} padding="medium"><FurgChip label="Integração" /><h4>{integration.label}</h4><code>{integration.key}</code><p>{integration.protocol}</p></FurgSurface>)}</section>
      <section><h3>Decisões e estados</h3>{decisions.map((decision) => <FurgSurface key={decision.key} padding="medium"><FurgChip label={technicalLabel(decision.notation)} /><h4>{decision.label}</h4><p>{decision.description}</p><code>{decision.key}</code></FurgSurface>)}{states.map((machine) => <FurgSurface key={machine.key} padding="medium"><FurgChip label="Máquina de estados" /><h4>{machine.label}</h4><p>{machine.states.length} estados · {machine.transitions.length} transições</p></FurgSurface>)}</section>
      <section><h3>Comunicações</h3>{communications?.notifications.map((notification: any) => <FurgSurface key={notification.key} padding="medium"><FurgChip label="Notificação" /><h4>{notification.label}</h4><p>{notification.trigger}</p><code>{notification.templateRef}</code></FurgSurface>)}</section>
    </div>
  </section>;
}

function GovernanceView({ bindingSets, canReview, onReview, provenance, reviewing, version }: { bindingSets: NonNullable<ProcessV2Projection["bindingSets"]>; canReview: boolean; onReview: (id: string, keys: string[], decision: "APPROVED" | "REJECTED") => Promise<void>; provenance: any; reviewing: boolean; version: ProcessV2Projection["version"] }) {
  return <section className="governance-view">
    <header><p className="eyebrow">Composição reproduzível</p><h2>Versões do processo, vínculos, publicações e evidências</h2><p>O significado do processo e os vínculos técnicos possuem identidades próprias; cada publicação registra a composição disponibilizada.</p></header>
    <div className="release-identity"><FurgSurface padding="medium"><span>Versão do processo</span><strong>revisão {version.revision}</strong><code>{version.id}</code></FurgSurface><FurgSurface padding="medium"><span>Conjunto de vínculos ativo</span><strong>{technicalLabel(version.bindingStatus)}</strong><code>{version.bindingSetVersionId ?? "-"}</code></FurgSurface><FurgSurface padding="medium"><span>Publicação</span><strong>{version.releaseId ? "Publicado" : "Ainda não publicado"}</strong><code>{version.releaseId ?? "-"}</code></FurgSurface></div>
    <div className="table-scroll"><table><caption>Histórico de conjuntos de vínculos e decisão técnica</caption><thead><tr><th>Revisão</th><th>Estado</th><th>Operações</th><th>Revisão do CGTI</th></tr></thead><tbody>{bindingSets.map((binding) => { const pendingKeys = binding.approvals.filter((item) => item.status === "PENDING").map((item) => item.semanticKey); return <tr key={binding.id}><td><strong>#{binding.revision}</strong><code>{binding.id}</code></td><td><FurgChip label={technicalLabel(binding.status)} tone={binding.status === "APPROVED" ? "success" : binding.status === "REJECTED" ? "danger" : "warning"} /></td><td>{binding.approvals.length} vínculos<br /><small>{pendingKeys.length} pendentes</small></td><td>{canReview && pendingKeys.length ? <div className="review-actions"><FurgButton disabled={reviewing} onClick={() => void onReview(binding.id, pendingKeys, "APPROVED")} size="small">Aprovar vínculos</FurgButton><FurgButton disabled={reviewing} onClick={() => void onReview(binding.id, pendingKeys, "REJECTED")} size="small" variant="text">Rejeitar</FurgButton></div> : binding.reviewedAt ? new Date(binding.reviewedAt).toLocaleString("pt-BR") : "Aguardando CGTI"}</td></tr>; })}</tbody></table></div>
    {!canReview && bindingSets.some((item) => item.status === "PENDING") ? <FurgMessage title="Revisão técnica protegida" message="Somente o perfil institucional Administrador do CGTI pode oficializar vínculos entre processo, aplicações e operações." tone="info" /> : null}
    <div className="inventory-grid"><section><h3>Fontes</h3>{provenance?.sourceArtifacts.map((source: any) => <FurgSurface key={source.key} padding="medium"><FurgChip label={technicalLabel(source.kind)} /><h4>{source.label}</h4><code>{source.location.repository ?? source.location.document ?? source.location.url ?? source.key}</code><small>{source.location.commit ?? source.capturedAt}</small></FurgSurface>)}</section><section><h3>Evidências e divergências</h3>{provenance?.evidence.map((evidence: any) => <FurgSurface key={evidence.key} padding="medium"><FurgChip label={technicalLabel(evidence.status)} tone={evidence.status === "CONTESTED" ? "warning" : "neutral"} /><h4>{evidence.label}</h4><p>Confiança {Math.round(evidence.confidence * 100)}%</p>{evidence.discrepancy ? <strong>{evidence.discrepancy}</strong> : null}</FurgSurface>)}</section></div>
  </section>;
}
