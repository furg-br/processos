import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createBrowserRouter, Link, matchPath, RouterProvider, useBlocker, useLocation, useNavigate } from "react-router-dom";
import {
  FurgAppShell, FurgButton, FurgButtonLink, FurgChip, FurgHeader, FurgIcon, FurgMessage,
  FurgPage, FurgPageHeader, FurgProgressIndicator, FurgSelect, FurgSurface, FurgTextField,
} from "@furg/design-system/react";
import type { ProcessDetail, ProcessSummary, SoftwareOperation, VersionStatus, Visibility } from "@furg/processos-contracts";
import { relationLabels, statusLabels } from "@furg/processos-contracts";
import { extractBpmnOutline } from "@furg/processos-bpmn";
import { acquireLease, bundleUrl, deleteDraftVersion, getProcess, listOperations, listProcesses, listSchemas, saveBpmn, transition, type ImportProcessResult } from "./api";
import { demoRelations } from "./demo-data";
import { EditProcessDialog } from "./EditProcessDialog";
import { ImportProcessDialog } from "./ImportProcessDialog";
import { NewProcessDialog } from "./NewProcessDialog";
import { useEditLease } from "./useEditLease";

const BpmnCanvas = lazy(() => import("./BpmnCanvas").then((module) => ({ default: module.BpmnCanvas })));
const ProcessMap = lazy(() => import("./ProcessMap").then((module) => ({ default: module.ProcessMap })));

type Section = "catalog" | "map" | "schemas" | "software";
type DetailView = "overview" | "diagram" | "structure" | "versions";

const sectionPaths: Record<Section, string> = {
  catalog: "/catalogo",
  map: "/mapa",
  schemas: "/dados",
  software: "/software",
};

const detailSegments: Record<DetailView, string> = {
  overview: "",
  diagram: "diagrama",
  structure: "estrutura",
  versions: "versoes",
};

const detailViewsBySegment: Record<string, DetailView> = {
  diagrama: "diagram",
  estrutura: "structure",
  versoes: "versions",
};

function titleSlug(title: string) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "processo";
}

function processPath(process: Pick<ProcessSummary, "id" | "title">, view: DetailView = "overview") {
  const suffix = detailSegments[view];
  return `/processos/${encodeURIComponent(process.id)}/${titleSlug(process.title)}${suffix ? `/${suffix}` : ""}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const toneByStatus: Record<VersionStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral", UNIT_REVIEW: "warning", CURATOR_REVIEW: "info", PUBLISHED: "success",
  CHANGES_REQUESTED: "danger", SUPERSEDED: "neutral", ARCHIVED: "neutral",
};

export function App() {
  const [router] = useState(() => createBrowserRouter([{ path: "*", element: <CatalogApp /> }]));
  return <RouterProvider router={router} />;
}

export function CatalogApp() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [selected, setSelected] = useState<ProcessDetail>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<{ locator: string; message: string }>();
  const [offline, setOffline] = useState(false);
  const [creatingProcess, setCreatingProcess] = useState(false);
  const [importingProcess, setImportingProcess] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState<{ title: string; message: string; tone: "success" | "warning" }>();
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"ALL" | Visibility>("ALL");

  const canonicalViewMatch = matchPath("/processos/:processId/:slug/:view", location.pathname);
  const twoSegmentMatch = matchPath("/processos/:locator/:segment", location.pathname);
  const legacyOverviewMatch = matchPath("/processos/:locator", location.pathname);
  const twoSegmentIsCanonical = Boolean(twoSegmentMatch?.params.locator && isUuid(twoSegmentMatch.params.locator));
  const routeLocator = canonicalViewMatch?.params.processId
    ?? twoSegmentMatch?.params.locator
    ?? legacyOverviewMatch?.params.locator;
  const routeViewSegment = canonicalViewMatch?.params.view
    ?? (twoSegmentMatch && !twoSegmentIsCanonical ? twoSegmentMatch.params.segment : undefined);
  const matchedDetailView = routeViewSegment ? detailViewsBySegment[routeViewSegment] : "overview";
  const detailView: DetailView = matchedDetailView ?? "overview";
  const isValidProcessRoute = Boolean(routeLocator && matchedDetailView && (
    canonicalViewMatch || legacyOverviewMatch || twoSegmentIsCanonical || routeViewSegment
  ));
  const selectedForRoute = selected && (selected.slug === routeLocator || selected.id === routeLocator) ? selected : undefined;
  const currentDetailError = detailError && detailError.locator === routeLocator ? detailError.message : undefined;
  const section = (Object.entries(sectionPaths).find(([, path]) => path === location.pathname)?.[0] as Section | undefined) ?? "catalog";
  const isKnownRoute = location.pathname === "/" || Object.values(sectionPaths).includes(location.pathname) || isValidProcessRoute;

  useEffect(() => {
    if (location.pathname === "/") routerNavigate(sectionPaths.catalog, { replace: true });
  }, [location.pathname, routerNavigate]);

  useEffect(() => {
    void listProcesses().then(({ data, offline }) => {
      setProcesses(data);
      setOffline(offline);
      setCatalogLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isValidProcessRoute || !routeLocator) {
      setSelected(undefined);
      setDetailLoading(false);
      setDetailError(undefined);
      return;
    }
    if (catalogLoading) {
      setDetailLoading(true);
      return;
    }
    if (selected && (selected.id === routeLocator || selected.slug === routeLocator)) {
      setDetailLoading(false);
      setDetailError(undefined);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError(undefined);
    void getProcess(routeLocator, offline)
      .then((process) => { if (active) setSelected(process); })
      .catch((error) => {
        if (!active) return;
        setSelected(undefined);
        setDetailError({ locator: routeLocator, message: error instanceof Error ? error.message : "Não foi possível abrir o processo." });
      })
      .finally(() => { if (active) setDetailLoading(false); });
    window.scrollTo?.({ top: 0, behavior: "smooth" });
    return () => { active = false; };
  }, [catalogLoading, isValidProcessRoute, offline, routeLocator, selected]);

  useEffect(() => {
    if (!selectedForRoute) return;
    const canonicalPath = processPath(selectedForRoute, detailView);
    if (location.pathname !== canonicalPath) routerNavigate(canonicalPath, { replace: true });
  }, [detailView, location.pathname, routerNavigate, selectedForRoute]);

  useDocumentMetadata(location.pathname, section, detailView, selectedForRoute);

  const filtered = useMemo(() => processes.filter((process) => {
    const haystack = `${process.title} ${process.description} ${process.category} ${process.ownerUnit.acronym}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (visibility === "ALL" || process.visibility === visibility);
  }), [processes, query, visibility]);

  function openProcess(locator: string, view: DetailView = "overview") {
    const process = processes.find((item) => item.id === locator || item.slug === locator);
    routerNavigate(process ? processPath(process, view) : `/processos/${encodeURIComponent(locator)}${detailSegments[view] ? `/${detailSegments[view]}` : ""}`);
  }

  function navigateSection(next: Section) { routerNavigate(sectionPaths[next]); }

  async function handleProcessCreated(created: { id: string; slug: string; title: string }) {
    setCreatingProcess(false);
    const result = await listProcesses();
    setProcesses(result.data);
    setOffline(result.offline);
    routerNavigate(processPath(created, "diagram"));
  }

  async function handleProcessImported(imported: ImportProcessResult) {
    setImportingProcess(false);
    const result = await listProcesses();
    setProcesses(result.data);
    setOffline(result.offline);
    const process = result.data.find((item) => item.id === imported.processId);
    const warningMessage = imported.warnings.map((warning) => warning.message).join(" ");
    setCatalogNotice(imported.warnings.length ? {
      title: "Processo importado com avisos",
      message: warningMessage,
      tone: "warning",
    } : {
      title: "Processo importado",
      message: imported.kind === "process-bundle" ? "O pacote foi restaurado como uma nova versão em rascunho." : "O diagrama BPMN foi criado como um novo processo em rascunho.",
      tone: "success",
    });
    routerNavigate(process ? processPath(process, "diagram") : `/processos/${encodeURIComponent(imported.processId)}`);
  }

  function handleProcessUpdated(process: ProcessDetail) {
    setSelected(process);
    setProcesses((current) => current.map((item) => item.id === process.id ? process : item));
  }

  function handleProcessRemoved(processId: string) {
    setSelected(undefined);
    setProcesses((current) => current.filter((item) => item.id !== processId));
    setCatalogNotice({
      title: "Rascunho removido",
      message: "O processo foi removido porque não possuía outra versão.",
      tone: "success",
    });
    routerNavigate(sectionPaths.catalog);
  }

  async function refreshSelectedProcess() {
    if (!selected) return;
    const process = await getProcess(selected.id, offline);
    handleProcessUpdated(process);
  }

  const navigation = <FurgHeader
    title="Processos FURG" sign="Catálogo institucional"
    actions={[
      { id: "catalog", href: sectionPaths.catalog, label: "Catálogo", icon: "document", active: !routeLocator && section === "catalog" },
      { id: "map", href: sectionPaths.map, label: "Mapa", icon: "results", active: !routeLocator && section === "map" },
      { id: "schemas", href: sectionPaths.schemas, label: "Dados", icon: "badge", active: !routeLocator && section === "schemas" },
      { id: "software", href: sectionPaths.software, label: "Software", icon: "sync", active: !routeLocator && section === "software" },
    ]}
    onAction={(action) => navigateSection(action.id as Section)}
  />;

  return <FurgAppShell navigation={navigation} footerGroups={[
    { category: "Catálogo", items: [{ label: "Processos", link: sectionPaths.catalog }, { label: "Mapa institucional", link: sectionPaths.map }] },
    { category: "Padrões abertos", items: [{ label: "BPMN 2.0", link: "https://www.omg.org/spec/BPMN/2.0.2/" }, { label: "JSON Schema", link: "https://json-schema.org/" }] },
  ]} licenseText="Universidade Federal do Rio Grande · Protótipo institucional aberto · Editor BPMN por bpmn.io">
    {offline ? <div className="offline-banner" role="status"><FurgIcon name="info" size={18} /><span>Modo de demonstração: conecte a API para persistir alterações.</span></div> : null}
    {!routeLocator ? <nav className="mobile-section-nav" aria-label="Seções do catálogo">
      <Link aria-current={section === "catalog" ? "page" : undefined} to={sectionPaths.catalog}><FurgIcon name="document" size={18} />Catálogo</Link>
      <Link aria-current={section === "map" ? "page" : undefined} to={sectionPaths.map}><FurgIcon name="results" size={18} />Mapa</Link>
      <Link aria-current={section === "schemas" ? "page" : undefined} to={sectionPaths.schemas}><FurgIcon name="badge" size={18} />Dados</Link>
      <Link aria-current={section === "software" ? "page" : undefined} to={sectionPaths.software}><FurgIcon name="sync" size={18} />Software</Link>
    </nav> : null}
    <FurgPage>
      {catalogNotice ? <div className="catalog-notice"><FurgMessage message={catalogNotice.message} title={catalogNotice.title} tone={catalogNotice.tone}><FurgButton onClick={() => setCatalogNotice(undefined)} size="small" variant="text">Dispensar</FurgButton></FurgMessage></div> : null}
      {detailLoading || (isValidProcessRoute && !selectedForRoute && !currentDetailError) || (!routeLocator && catalogLoading) ? <div className="page-loading"><FurgProgressIndicator label="Carregando o catálogo" /></div> : routeLocator && selectedForRoute
        ? <ProcessDetailPage process={selectedForRoute} view={detailView} onView={(view) => routerNavigate(processPath(selectedForRoute, view))} onProcessUpdated={handleProcessUpdated} onProcessRemoved={handleProcessRemoved} onRefresh={refreshSelectedProcess} offline={offline} />
        : routeLocator && currentDetailError ? <NotFoundPage message={currentDetailError} />
        : !isKnownRoute ? <NotFoundPage />
        : section === "catalog" ? <CatalogPage processes={filtered} allProcesses={processes} query={query} visibility={visibility} offline={offline} onCreate={() => { setCatalogNotice(undefined); setCreatingProcess(true); }} onImport={() => { setCatalogNotice(undefined); setImportingProcess(true); }} onQuery={setQuery} onVisibility={setVisibility} onOpen={openProcess} />
        : section === "map" ? <MapPage processes={processes} onOpen={openProcess} />
        : section === "schemas" ? <SchemasPage />
        : <SoftwarePage />}
    </FurgPage>
    <NewProcessDialog isOpen={creatingProcess} onClose={() => setCreatingProcess(false)} onCreated={handleProcessCreated} />
    <ImportProcessDialog isOpen={importingProcess} onClose={() => setImportingProcess(false)} onImported={handleProcessImported} />
  </FurgAppShell>;
}

function CatalogPage({ processes, allProcesses, query, visibility, offline, onCreate, onImport, onQuery, onVisibility, onOpen }: {
  processes: ProcessSummary[]; allProcesses: ProcessSummary[]; query: string; visibility: "ALL" | Visibility;
  offline: boolean; onCreate: () => void; onImport: () => void;
  onQuery: (value: string) => void; onVisibility: (value: "ALL" | Visibility) => void; onOpen: (id: string, view?: DetailView) => void;
}) {
  const published = allProcesses.filter((process) => process.currentVersion?.status === "PUBLISHED").length;
  const review = allProcesses.filter((process) => ["UNIT_REVIEW", "CURATOR_REVIEW"].includes(process.currentVersion?.status ?? "")).length;
  return <>
    <section className="catalog-hero">
      <div className="catalog-hero__content">
        <p className="eyebrow">Arquitetura de processos · FURG</p>
        <h1>Do trabalho institucional<br />à próxima entrega digital.</h1>
        <p>Um lugar comum para compreender responsabilidades, decisões, dados e sistemas antes de transformar necessidades em software.</p>
        <div className="hero-search"><FurgTextField label="Buscar no catálogo" placeholder="Processo, unidade, categoria ou sistema" value={query} onChange={(event) => onQuery(event.target.value)} /><FurgIcon name="search" /></div>
      </div>
      <div className="process-pulse" aria-label="Resumo do acervo">
        <div><strong>{allProcesses.length}</strong><span>processos conectados</span></div>
        <div><strong>{published}</strong><span>versões vigentes</span></div>
        <div><strong>{review}</strong><span>em revisão</span></div>
        <svg viewBox="0 0 420 150" aria-hidden="true"><path d="M18 112 C92 20 132 132 210 62 S336 18 402 82" /><circle cx="18" cy="112" r="7" /><circle cx="210" cy="62" r="7" /><circle cx="402" cy="82" r="7" /></svg>
      </div>
    </section>

    <section className="catalog-section" id="catalogo">
      <header className="section-intro"><div><p className="eyebrow">Acervo governado</p><h2>Processos institucionais</h2><p>Explore o estado atual e as propostas futuras sem perder a história das decisões.</p></div>
        <div className="catalog-actions"><div className="catalog-actions__buttons"><FurgButton disabled={offline} icon="document" onClick={onCreate}>Novo processo</FurgButton><FurgButton disabled={offline} icon="upload" onClick={onImport} variant="outlined">Importar processo</FurgButton></div><FurgSelect label="Visibilidade" value={visibility} onChange={(event) => onVisibility(event.target.value as "ALL" | Visibility)} options={[
          { value: "ALL", label: "Todas" }, { value: "PUBLIC", label: "Públicas" }, { value: "INTERNAL", label: "Internas" }, { value: "RESTRICTED", label: "Restritas" },
        ]} />{offline ? <small>Conecte a API para criar, importar e persistir processos.</small> : null}</div>
      </header>
      <div className="process-list" role="list">
        {processes.map((process, index) => <ProcessRow key={process.id} process={process} order={index + 1} onOpen={onOpen} />)}
        {processes.length === 0 ? <FurgMessage title="Nenhum processo encontrado" message="Altere os termos da busca ou o filtro de visibilidade." /> : null}
      </div>
    </section>
  </>;
}

function ProcessRow({ process, order }: { process: ProcessSummary; order: number; onOpen: (id: string, view?: DetailView) => void }) {
  const status = process.currentVersion?.status ?? "DRAFT";
  return <article className="process-row" role="listitem">
    <span className="process-row__order" aria-hidden="true">{String(order).padStart(2, "0")}</span>
    <div className="process-row__main"><div className="row-meta"><span>{process.category}</span><span>{process.ownerUnit.acronym}</span></div><h3><Link to={processPath(process)}>{process.title}</Link></h3><p>{process.description}</p></div>
    <div className="process-row__units" aria-label="Unidades participantes">{process.participantUnits.slice(0, 3).map((unit) => <span key={unit.acronym}>{unit.acronym}</span>)}</div>
    <div className="process-row__status"><FurgChip label={statusLabels[status]} tone={toneByStatus[status]} /><small>v{process.currentVersion?.revision ?? 1} · {process.currentVersion?.perspective === "TO_BE" ? "TO-BE" : "AS-IS"}</small></div>
    <Link aria-label={`Abrir ${process.title}`} className="process-row__open" to={processPath(process)}>Abrir <FurgIcon name="arrow-forward" size={18} /></Link>
  </article>;
}

function MapPage({ processes, onOpen }: { processes: ProcessSummary[]; onOpen: (id: string) => void }) {
  return <div className="contained-page"><FurgPageHeader eyebrow="Visão transversal" title="Mapa institucional" description="Processos separados, relações explícitas. Selecione um nó para abrir seu diagrama e seus contratos." />
    <Suspense fallback={<FurgProgressIndicator label="Preparando o mapa" />}><ProcessMap processes={processes} relations={demoRelations} onOpen={onOpen} /></Suspense>
    <section className="accessible-map"><h2>Relações em formato textual</h2><ol>{demoRelations.map((relation) => {
      const source = processes.find((process) => process.id === relation.sourceProcessId)?.title;
      const target = processes.find((process) => process.id === relation.targetProcessId)?.title;
      const sourceProcess = processes.find((process) => process.id === relation.sourceProcessId);
      const targetProcess = processes.find((process) => process.id === relation.targetProcessId);
      return <li key={relation.id}>{sourceProcess ? <Link to={processPath(sourceProcess)}>{source}</Link> : source} <strong>{relationLabels[relation.type]}</strong> {targetProcess ? <Link to={processPath(targetProcess)}>{target}</Link> : target}{relation.label ? <span> — {relation.label}</span> : null}</li>;
    })}</ol></section>
  </div>;
}

function ProcessDetailPage({ process, view, onView, onProcessUpdated, onProcessRemoved, onRefresh, offline }: { process: ProcessDetail; view: DetailView; onView: (view: DetailView) => void; onProcessUpdated: (process: ProcessDetail) => void; onProcessRemoved: (processId: string) => void; onRefresh: () => void; offline: boolean }) {
  const version = process.currentVersion;
  const [editing, setEditing] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [leaseToken, setLeaseToken] = useState<string>();
  const [deletingVersionId, setDeletingVersionId] = useState<string>();
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone: "info" | "success" | "warning" | "danger" }>();
  const canEdit = version && ["DRAFT", "CHANGES_REQUESTED"].includes(version.status);
  const navigationBlocker = useBlocker(editing && editorDirty);

  useEditLease(leaseToken, (message) => {
    setLeaseToken(undefined);
    setEditing(false);
    setEditorDirty(false);
    setFeedback({ title: "Edição interrompida", message, tone: "warning" });
  });

  useEffect(() => {
    if (!editing || !editorDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [editing, editorDirty]);

  useEffect(() => {
    if (navigationBlocker.state !== "blocked") return;
    const leave = window.confirm("Há alterações não salvas. Deseja sair desta página mesmo assim?");
    if (leave) {
      setEditorDirty(false);
      setEditing(false);
      setLeaseToken(undefined);
      navigationBlocker.proceed();
      return;
    }
    navigationBlocker.reset();
    setFeedback({
      title: "Alterações ainda não salvas",
      message: "A navegação foi cancelada. Salve o rascunho ou encerre a edição antes de sair.",
      tone: "warning",
    });
  }, [navigationBlocker]);

  async function startEditing() {
    if (!version) return;
    if (offline) { setFeedback(undefined); setEditing(true); onView("diagram"); return; }
    try {
      const lease = await acquireLease(process.id, version.id);
      setLeaseToken(lease.token);
      setEditing(true);
      setFeedback(undefined);
      onView("diagram");
    } catch (error) {
      setFeedback({ title: "Edição indisponível", message: error instanceof Error ? error.message : "Não foi possível iniciar a edição.", tone: "warning" });
    }
  }

  function stopEditing() {
    if (editorDirty && !window.confirm("Há alterações não salvas. Deseja encerrar a edição mesmo assim?")) return;
    setEditing(false);
    setEditorDirty(false);
    setLeaseToken(undefined);
    setFeedback({
      title: "Edição encerrada",
      message: offline ? "A sessão demonstrativa foi encerrada sem persistir alterações." : "O bloqueio exclusivo foi liberado para outras pessoas.",
      tone: "info",
    });
  }

  async function handleSave(xml: string) {
    if (offline) throw new Error("O modo de demonstração não persiste alterações. Conecte a API para salvar.");
    if (!version || !leaseToken) throw new Error("Bloqueio de edição ausente.");
    await saveBpmn(process.id, version.id, xml, leaseToken);
    onProcessUpdated({ ...process, bpmnXml: xml, outline: extractBpmnOutline(xml) });
  }

  function mayNavigate(message: string) {
    if (editing && editorDirty) {
      setFeedback({
        title: "Alterações ainda não salvas",
        message,
        tone: "warning",
      });
      return false;
    }
    return true;
  }

  async function sendToReview() {
    if (!version || offline) return;
    try { await transition(process.id, version.id, "SUBMIT_UNIT"); setFeedback({ title: "Situação atualizada", message: "Versão enviada para revisão da unidade.", tone: "success" }); onRefresh(); }
    catch (error) { setFeedback({ title: "Revisão não iniciada", message: error instanceof Error ? error.message : "Não foi possível avançar a revisão.", tone: "danger" }); }
  }

  async function removeDraftVersion(versionId: string, revision: number) {
    if (offline || deletingVersionId) return;
    if (editing) {
      setFeedback({ title: "Rascunho em edição", message: "Encerre a edição antes de remover uma versão.", tone: "warning" });
      return;
    }
    const onlyVersion = process.versions.length === 1;
    const confirmation = onlyVersion
      ? `A versão v${revision} é o único rascunho deste processo. Removê-la também excluirá o cadastro do processo. Esta ação não pode ser desfeita. Deseja continuar?`
      : `Remover definitivamente a versão v${revision} em rascunho? Esta ação não pode ser desfeita.`;
    if (!window.confirm(confirmation)) return;

    setDeletingVersionId(versionId);
    try {
      const result = await deleteDraftVersion(process.id, versionId);
      if (result.deletedProcess) {
        onProcessRemoved(process.id);
        return;
      }
      if (result.process) onProcessUpdated(result.process);
      setFeedback({ title: "Rascunho removido", message: `A versão v${revision} foi removida definitivamente.`, tone: "success" });
    } catch (error) {
      setFeedback({ title: "Rascunho não removido", message: error instanceof Error ? error.message : "Não foi possível remover a versão.", tone: "danger" });
    } finally {
      setDeletingVersionId(undefined);
    }
  }

  return <><div className="process-detail">
    <Link className="back-link" onClick={(event) => { if (!mayNavigate("Salve o rascunho ou encerre a edição antes de voltar ao catálogo.")) event.preventDefault(); }} to={sectionPaths.catalog}><FurgIcon name="arrow-back" size={18} />Voltar ao catálogo</Link>
    <header className="process-detail__header"><div><p className="eyebrow">{process.category} · {process.ownerUnit.acronym}</p><h1>{process.title}</h1><p>{process.description}</p><div className="detail-chips"><FurgChip label={statusLabels[version?.status ?? "DRAFT"]} tone={toneByStatus[version?.status ?? "DRAFT"]} /><FurgChip label={version?.perspective === "TO_BE" ? "Cenário futuro" : "Processo atual"} tone="info" /><FurgChip label={process.visibility === "PUBLIC" ? "Público" : process.visibility === "INTERNAL" ? "Interno" : "Restrito"} /></div></div>
      <div className="detail-actions">{canEdit ? <FurgButton disabled={editing || offline} icon="edit" onClick={() => setEditingMetadata(true)} variant="outlined">Editar dados</FurgButton> : null}{version ? <FurgButtonLink download href={bundleUrl(process.id, version.id)} icon="download" variant="outlined">Exportar pacote</FurgButtonLink> : null}{canEdit ? editing ? <FurgButton onClick={stopEditing} variant="outlined">Encerrar edição</FurgButton> : <FurgButton icon="edit" onClick={startEditing}>Editar diagrama</FurgButton> : null}</div>
    </header>
    {feedback ? <FurgMessage title={feedback.title} message={feedback.message} tone={feedback.tone} /> : null}
    <nav className="detail-nav" aria-label="Conteúdo do processo">{(["overview", "diagram", "structure", "versions"] as const).map((item) => <Link aria-current={view === item ? "page" : undefined} key={item} onClick={(event) => { if (item !== view && !mayNavigate("Salve o rascunho ou encerre a edição antes de trocar de aba.")) event.preventDefault(); }} to={processPath(process, item)}>{({ overview: "Visão geral", diagram: "Diagrama", structure: "Visão textual", versions: "Versões" })[item]}</Link>)}</nav>

    {view === "overview" ? <Overview process={process} onOpenDiagram={() => onView("diagram")} />
      : view === "diagram" ? <><Suspense fallback={<FurgProgressIndicator label="Preparando o editor BPMN" />}><BpmnCanvas editable={editing} key={`${process.id}:${version?.id ?? "sem-versao"}:${editing ? "edit" : "view"}`} xml={process.bpmnXml} onDirtyChange={setEditorDirty} onSave={handleSave} /></Suspense>{canEdit && !editing ? <div className="editor-callout"><FurgButton icon="edit" onClick={startEditing}>Obter bloqueio e editar</FurgButton><p>Uma pessoa por vez. O bloqueio é renovado enquanto a edição permanece ativa.</p></div> : null}{canEdit && version?.status === "DRAFT" && !editing ? <div className="review-action"><FurgButton icon="send" onClick={sendToReview} variant="tonal">Enviar para revisão da unidade</FurgButton></div> : null}</>
      : view === "structure" ? <StructuredView process={process} />
      : <VersionsView deletingVersionId={deletingVersionId} disabledReason={offline ? "Conecte a API para remover o rascunho." : editing ? "Encerre a edição antes de remover o rascunho." : undefined} onDelete={removeDraftVersion} process={process} />}
  </div>{canEdit ? <EditProcessDialog isOpen={editingMetadata} onClose={() => setEditingMetadata(false)} onUpdated={(updated) => {
    setEditingMetadata(false);
    onProcessUpdated(updated);
    setFeedback({ title: "Dados atualizados", message: "As informações cadastrais do processo foram salvas.", tone: "success" });
  }} process={process} /> : null}</>;
}

function Overview({ process, onOpenDiagram }: { process: ProcessDetail; onOpenDiagram: () => void }) {
  return <div className="overview-grid"><main>
    <FurgSurface className="process-thesis" padding="large"><p className="eyebrow">Escopo e resultado</p><h2>{process.audience}</h2><p>O processo é conduzido por <strong>{process.ownerUnit.name}</strong> e termina com um resultado verificável. O prazo planejado global é <strong>{process.processSla ?? "não informado"}</strong>.</p><FurgButton icon="arrow-forward" onClick={onOpenDiagram} variant="text">Percorrer o diagrama</FurgButton></FurgSurface>
    <section className="relation-list"><h2>Encadeamento</h2>{process.relations.length ? process.relations.map((relation) => <article key={relation.id}><FurgIcon name={relation.type === "EXCHANGES_INFORMATION" ? "sync" : "arrow-forward"} /><div><strong>{relationLabels[relation.type]}</strong><p>{relation.label ?? "Relação institucional registrada"}</p></div></article>) : <p>Nenhuma relação registrada.</p>}</section>
  </main><aside><section className="fact-block"><p className="eyebrow">Responsabilidade</p><h2>{process.ownerUnit.acronym}</h2><p>{process.ownerUnit.name}</p></section><section className="fact-block"><p className="eyebrow">Unidades participantes</p><ul>{process.participantUnits.map((unit) => <li key={unit.acronym}>{unit.acronym}<span>{unit.name}</span></li>)}</ul></section><section className="fact-block"><p className="eyebrow">Elementos mapeados</p><strong className="large-number">{process.outline.length}</strong><span>eventos, ações e decisões</span></section></aside></div>;
}

function StructuredView({ process }: { process: ProcessDetail }) {
  return <section className="structured-view"><header><p className="eyebrow">Alternativa acessível ao canvas</p><h2>Fluxo em formato textual</h2><p>Os elementos mantêm os mesmos identificadores do BPMN XML e podem ser percorridos sem interação visual.</p></header><ol>{process.outline.map((element, index) => {
    const metadata = process.elementMetadata.find((item) => item.bpmnElementId === element.id);
    return <li key={element.id}><span className="structured-index">{String(index + 1).padStart(2, "0")}</span><div><small>{humanElementType(element.type)} · {element.id}</small><h3>{element.name}</h3>{metadata ? <dl><div><dt>Papel</dt><dd>{metadata.role ?? "Não definido"}</dd></div><div><dt>Trabalho</dt><dd>{metadata.workDuration ?? "Não informado"}</dd></div><div><dt>Espera</dt><dd>{metadata.waitDuration ?? "Não informada"}</dd></div></dl> : null}</div></li>;
  })}</ol></section>;
}

function VersionsView({ process, deletingVersionId, disabledReason, onDelete }: { process: ProcessDetail; deletingVersionId?: string; disabledReason?: string; onDelete: (versionId: string, revision: number) => void }) {
  return <section className="versions-view"><h2>Histórico governado</h2><p>Consulte as revisões registradas e remova rascunhos que não devem permanecer no histórico.</p><ol>{process.versions.map((version) => <li key={version.id}><span>v{version.revision}</span><div className="version-row__summary"><strong>{version.perspective === "AS_IS" ? "Processo atual" : "Cenário futuro"}</strong><small>{new Date(version.createdAt).toLocaleDateString("pt-BR")}</small></div><div className="version-row__actions"><FurgChip label={statusLabels[version.status]} tone={toneByStatus[version.status]} />{version.status === "DRAFT" ? <FurgButton aria-label={`Remover rascunho v${version.revision}`} className="version-remove-button" disabled={Boolean(disabledReason || deletingVersionId)} loading={deletingVersionId === version.id} onClick={() => onDelete(version.id, version.revision)} size="small" title={disabledReason} variant="text">Remover</FurgButton> : null}</div></li>)}</ol></section>;
}

function SchemasPage() {
  const [schemas, setSchemas] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  useEffect(() => { void listSchemas().then((data) => { setSchemas(data); setSelected(data[0]); }); }, []);
  return <div className="contained-page"><FurgPageHeader eyebrow="Contratos de informação" title="Dados que atravessam os processos" description="Entradas e saídas deixam de ser rótulos: cada uma ganha semântica, versão, validação e classificação." />
    <div className="schema-layout"><aside><h2>Ativos catalogados</h2>{schemas.map((schema) => <button className={selected?.id === schema.id ? "is-selected" : ""} key={schema.id} onClick={() => setSelected(schema)}><span>{schema.name}</span><small>versão {schema.version} · {schema.visibility === "PUBLIC" ? "público" : "interno"}</small></button>)}</aside>
      {selected ? <main><div className="schema-heading"><div><p className="eyebrow">JSON Schema 2020-12</p><h2>{selected.name}</h2></div><FurgButton icon="edit" variant="outlined">Criar nova versão</FurgButton></div><pre className="schema-code" tabIndex={0}><code>{JSON.stringify(selected.jsonSchema, null, 2)}</code></pre><div className="schema-fields"><h3>Campos principais</h3><ul>{Object.entries(selected.jsonSchema.properties ?? {}).map(([name, value]: [string, any]) => <li key={name}><code>{name}</code><span>{value.type}</span><small>{selected.jsonSchema.required?.includes(name) ? "Obrigatório" : "Opcional"}</small></li>)}</ul></div></main> : null}
    </div>
  </div>;
}

function SoftwarePage() {
  const [operations, setOperations] = useState<SoftwareOperation[]>([]);
  useEffect(() => { void listOperations().then(setOperations); }, []);
  return <div className="contained-page"><FurgPageHeader eyebrow="Rastreabilidade técnica" title="Do processo à operação de software" description="Uma tarefa pode usar várias operações; uma operação pode apoiar vários processos sem forçar uma relação um-para-um." />
    <FurgSurface padding="large"><div className="software-heading"><div><h2>Operações catalogadas</h2><p>Cadastro manual e fontes OpenAPI versionadas.</p></div><FurgButton icon="upload">Importar OpenAPI</FurgButton></div><div className="table-scroll"><table><caption>Operações dos sistemas vinculáveis aos elementos BPMN</caption><thead><tr><th>Sistema</th><th>Módulo</th><th>Funcionalidade</th><th>Operação</th><th>Versão</th></tr></thead><tbody>{operations.map((operation) => <tr key={operation.id}><td>{operation.system}</td><td>{operation.module}</td><td>{operation.functionality}</td><td><code>{operation.method} {operation.path}</code><small>{operation.operationId}</small></td><td>{operation.version}</td></tr>)}</tbody></table></div></FurgSurface>
  </div>;
}

function humanElementType(type: string) {
  const labels: Record<string, string> = { startEvent: "Início", endEvent: "Fim", task: "Atividade", userTask: "Atividade humana", serviceTask: "Atividade automática", exclusiveGateway: "Decisão", callActivity: "Processo chamado", subProcess: "Subprocesso" };
  return labels[type] ?? type;
}

function NotFoundPage({ message = "O endereço informado não corresponde a uma seção ou processo disponível." }: { message?: string }) {
  return <div className="contained-page not-found-page">
    <FurgMessage title="Página não encontrada" message={message} tone="warning" />
    <Link className="back-link" to={sectionPaths.catalog}><FurgIcon name="arrow-back" size={18} />Ir para o catálogo</Link>
  </div>;
}

function useDocumentMetadata(pathname: string, section: Section, view: DetailView, process?: ProcessDetail) {
  useEffect(() => {
    const sectionMetadata: Record<Section, { title: string; description: string }> = {
      catalog: {
        title: "Catálogo Institucional de Processos | FURG",
        description: "Conheça os processos institucionais, responsabilidades, dados e sistemas da Universidade Federal do Rio Grande.",
      },
      map: {
        title: "Mapa institucional de processos | FURG",
        description: "Explore as relações entre os processos institucionais da Universidade Federal do Rio Grande.",
      },
      schemas: {
        title: "Dados dos processos | FURG",
        description: "Consulte os contratos de informação e dados vinculados aos processos institucionais da FURG.",
      },
      software: {
        title: "Software e processos | FURG",
        description: "Consulte a rastreabilidade entre processos, sistemas e operações de software da FURG.",
      },
    };
    const viewLabel: Record<DetailView, string> = {
      overview: "Visão geral",
      diagram: "Diagrama BPMN",
      structure: "Visão textual",
      versions: "Versões",
    };
    const fallback = sectionMetadata[section];
    const title = process ? `${process.title} — ${viewLabel[view]} | FURG` : fallback.title;
    const description = process?.description ?? fallback.description;
    const configuredBase = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "");
    const canonicalUrl = `${configuredBase ?? window.location.origin}${pathname}`;
    const indexingEnabled = import.meta.env.VITE_PUBLIC_INDEXING === "true";
    const canIndexProcess = process?.visibility === "PUBLIC" && process.currentVersion?.status === "PUBLISHED";
    const robots = indexingEnabled && (!process || canIndexProcess) ? "index, follow" : "noindex, nofollow";

    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "robots", robots);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", process ? "article" : "website");
    setMeta("property", "og:url", canonicalUrl);
    setCanonical(canonicalUrl);

    const existingStructuredData = document.getElementById("process-structured-data");
    if (!process || !canIndexProcess) {
      existingStructuredData?.remove();
      return;
    }
    const structuredData = existingStructuredData ?? Object.assign(document.createElement("script"), {
      id: "process-structured-data",
      type: "application/ld+json",
    });
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: process.title,
      description: process.description,
      url: canonicalUrl,
      version: String(process.currentVersion?.revision ?? 1),
      author: { "@type": "Organization", name: "Universidade Federal do Rio Grande — FURG" },
    });
    if (!existingStructuredData) document.head.append(structuredData);
  }, [pathname, process, section, view]);
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }
  element.href = href;
}
