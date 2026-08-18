import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createBrowserRouter, Link, matchPath, RouterProvider, useBlocker, useLocation, useNavigate } from "react-router-dom";
import {
  FurgAppShell, FurgButton, FurgChip, FurgCriticalAction, FurgDialog, FurgHeader, FurgIcon, FurgMessage,
  FurgPage, FurgPageHeader, FurgProgressIndicator, FurgSelect, FurgSurface, FurgTextField,
} from "@furg/design-system/react";
import type { ProcessDetail, ProcessRelation, ProcessSummary, VersionStatus, Visibility } from "@furg/processos-contracts";
import { relationLabels, statusLabels } from "@furg/processos-contracts";
import { extractBpmnOutline } from "@furg/processos-bpmn";
import { acquireLease, deleteDraftVersion, downloadProcessBundle, getProcess, listOperations, listProcessRelations, listProcesses, listSchemas, saveBpmn, transition, type AuthoringState, type CatalogSoftwareOperation, type ImportProcessResult } from "./api";
import { EditProcessDialog } from "./EditProcessDialog";
import { ImportProcessDialog } from "./ImportProcessDialog";
import { NewProcessDialog } from "./NewProcessDialog";
import { ProcessV2Workspace } from "./ProcessV2Workspace";
import { useEditLease } from "./useEditLease";
import { PublicProcessPage } from "./PublicProcessPage";
import { InformationSchemaDialog, OpenApiImportDialog, SoftwareOperationDialog } from "./CatalogEditors";

const BpmnCanvas = lazy(() => import("./BpmnCanvas").then((module) => ({ default: module.BpmnCanvas })));
const ProcessMap = lazy(() => import("./ProcessMap").then((module) => ({ default: module.ProcessMap })));
const AuthoringWorkspace = lazy(() => import("./AuthoringWorkspace").then((module) => ({ default: module.AuthoringWorkspace })));

type Section = "catalog" | "map" | "schemas" | "software";
type DetailView = "overview" | "diagram" | "operations" | "structure" | "authoring" | "versions";
type WorkflowAction = NonNullable<ProcessDetail["availableTransitions"]>[number];

const sectionPaths: Record<Section, string> = {
  catalog: "/catalogo",
  map: "/mapa",
  schemas: "/dados",
  software: "/software",
};

const detailSegments: Record<DetailView, string> = {
  overview: "",
  diagram: "diagrama",
  operations: "operacao",
  structure: "estrutura",
  authoring: "autoria",
  versions: "versoes",
};

const detailViewsBySegment: Record<string, DetailView> = {
  diagrama: "diagram",
  operacao: "operations",
  estrutura: "structure",
  autoria: "authoring",
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
  const [relations, setRelations] = useState<ProcessRelation[]>([]);
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
  const [catalogFacets, setCatalogFacets] = useState({ system: "ALL", module: "ALL", unit: "ALL", affiliation: "ALL" });
  const publicRouteMatch = matchPath("/publico/processos/:locator", location.pathname);

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
    if (publicRouteMatch?.params.locator) { setCatalogLoading(false); return; }
    void Promise.all([listProcesses(), listProcessRelations()]).then(([{ data, offline }, relationData]) => {
      setProcesses(data); setRelations(relationData); setOffline(offline); setCatalogLoading(false);
    });
  }, [publicRouteMatch?.params.locator]);

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
    const haystack = `${process.title} ${process.description} ${process.category} ${process.ownerUnit.acronym} ${process.facets?.systems.map((item) => item.label).join(" ") ?? ""} ${process.facets?.affiliations.map((item) => item.label).join(" ") ?? ""}`.toLowerCase();
    const hasFacet = (kind: "systems" | "modules" | "units" | "affiliations", selected: string) => selected === "ALL" || Boolean(process.facets?.[kind].some((item) => item.key === selected));
    return haystack.includes(query.toLowerCase()) && (visibility === "ALL" || process.visibility === visibility)
      && hasFacet("systems", catalogFacets.system) && hasFacet("modules", catalogFacets.module)
      && (catalogFacets.unit === "ALL" || hasFacet("units", catalogFacets.unit) || process.ownerUnit.id === catalogFacets.unit)
      && hasFacet("affiliations", catalogFacets.affiliation);
  }), [catalogFacets, processes, query, visibility]);

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
        message: imported.kind === "binding-set-v2"
          ? "Os novos vínculos técnicos foram importados para revisão do CGTI."
          : imported.kind === "process-bundle" || imported.kind === "process-bundle-v2"
            ? "O pacote foi restaurado como uma nova versão em rascunho."
            : "O diagrama BPMN foi criado como um novo processo em rascunho.",
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
    const [process, relationData] = await Promise.all([getProcess(selected.id, offline), listProcessRelations()]);
    setRelations(relationData);
    handleProcessUpdated(process);
  }

  if (publicRouteMatch?.params.locator) return <PublicProcessPage locator={publicRouteMatch.params.locator} />;

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
        ? <ProcessDetailPage process={selectedForRoute} view={detailView} onView={(view) => routerNavigate(processPath(selectedForRoute, view))} onAdministerVersion={() => routerNavigate(`${processPath(selectedForRoute, "versions")}#administracao-da-versao`)} onProcessUpdated={handleProcessUpdated} onProcessRemoved={handleProcessRemoved} onRefresh={refreshSelectedProcess} offline={offline} />
        : routeLocator && currentDetailError ? <NotFoundPage message={currentDetailError} />
        : !isKnownRoute ? <NotFoundPage />
        : section === "catalog" ? <CatalogPage processes={filtered} allProcesses={processes} facets={catalogFacets} query={query} visibility={visibility} offline={offline} onCreate={() => { setCatalogNotice(undefined); setCreatingProcess(true); }} onImport={() => { setCatalogNotice(undefined); setImportingProcess(true); }} onFacets={setCatalogFacets} onQuery={setQuery} onVisibility={setVisibility} onOpen={openProcess} />
      : section === "map" ? <MapPage processes={processes} relations={relations} onOpen={openProcess} />
        : section === "schemas" ? <SchemasPage />
        : <SoftwarePage />}
    </FurgPage>
    <NewProcessDialog isOpen={creatingProcess} onClose={() => setCreatingProcess(false)} onCreated={handleProcessCreated} />
    <ImportProcessDialog isOpen={importingProcess} onClose={() => setImportingProcess(false)} onImported={handleProcessImported} />
  </FurgAppShell>;
}

function CatalogPage({ processes, allProcesses, facets, query, visibility, offline, onCreate, onImport, onFacets, onQuery, onVisibility, onOpen }: {
  processes: ProcessSummary[]; allProcesses: ProcessSummary[]; query: string; visibility: "ALL" | Visibility;
  facets: { system: string; module: string; unit: string; affiliation: string };
  offline: boolean; onCreate: () => void; onImport: () => void;
  onFacets: (value: { system: string; module: string; unit: string; affiliation: string }) => void;
  onQuery: (value: string) => void; onVisibility: (value: "ALL" | Visibility) => void; onOpen: (id: string, view?: DetailView) => void;
}) {
  const published = allProcesses.filter((process) => process.currentVersion?.status === "PUBLISHED").length;
  const review = allProcesses.filter((process) => ["UNIT_REVIEW", "CURATOR_REVIEW"].includes(process.currentVersion?.status ?? "")).length;
  const optionsFor = (kind: "systems" | "modules" | "units" | "affiliations") => [...new Map(allProcesses.flatMap((process) => process.facets?.[kind] ?? []).map((item) => [item.key, item])).values()].sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  const unitOptions = [...optionsFor("units"), ...allProcesses.map((process) => ({ key: process.ownerUnit.id ?? process.ownerUnit.acronym, label: `${process.ownerUnit.acronym} - ${process.ownerUnit.name}` }))]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.label === item.label) === index);
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
      <div className="catalog-facets" aria-label="Agrupar e filtrar o universo institucional">
        <FurgSelect label="Sistema" value={facets.system} onChange={(event) => onFacets({ ...facets, system: event.target.value })} options={[{ value: "ALL", label: "Todos os sistemas" }, ...optionsFor("systems").map((item) => ({ value: item.key, label: item.label }))]} />
        <FurgSelect label="Módulo" value={facets.module} onChange={(event) => onFacets({ ...facets, module: event.target.value })} options={[{ value: "ALL", label: "Todos os módulos" }, ...optionsFor("modules").map((item) => ({ value: item.key, label: item.label }))]} />
        <FurgSelect label="Unidade participante" value={facets.unit} onChange={(event) => onFacets({ ...facets, unit: event.target.value })} options={[{ value: "ALL", label: "Todas as unidades" }, ...unitOptions.map((item) => ({ value: item.key, label: item.label }))]} />
        <FurgSelect label="Vínculo institucional" value={facets.affiliation} onChange={(event) => onFacets({ ...facets, affiliation: event.target.value })} options={[{ value: "ALL", label: "Todos os vínculos" }, ...optionsFor("affiliations").map((item) => ({ value: item.key, label: item.label }))]} />
      </div>
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
    <div className="process-row__status"><FurgChip label={statusLabels[status]} tone={toneByStatus[status]} /><small>v{process.currentVersion?.revision ?? 1} · {process.currentVersion?.perspective === "TO_BE" ? "Cenário futuro" : "Processo atual"}</small></div>
    <Link aria-label={`Abrir ${process.title}`} className="process-row__open" to={processPath(process)}>Abrir <FurgIcon name="arrow-forward" size={18} /></Link>
  </article>;
}

function MapPage({ processes, relations, onOpen }: { processes: ProcessSummary[]; relations: ProcessRelation[]; onOpen: (id: string) => void }) {
  return <div className="contained-page"><FurgPageHeader eyebrow="Visão transversal" title="Mapa institucional" description="Processos separados, relações explícitas. Selecione um nó para abrir seu diagrama e seus contratos." />
    <Suspense fallback={<FurgProgressIndicator label="Preparando o mapa" />}><ProcessMap processes={processes} relations={relations} onOpen={onOpen} /></Suspense>
    <section className="accessible-map"><h2>Relações em formato textual</h2><ol>{relations.map((relation) => {
      const source = processes.find((process) => process.id === relation.sourceProcessId)?.title;
      const target = processes.find((process) => process.id === relation.targetProcessId)?.title;
      const sourceProcess = processes.find((process) => process.id === relation.sourceProcessId);
      const targetProcess = processes.find((process) => process.id === relation.targetProcessId);
      return <li key={relation.id}>{sourceProcess ? <Link to={processPath(sourceProcess)}>{source}</Link> : source} <strong>{relationLabels[relation.type]}</strong> {targetProcess ? <Link to={processPath(targetProcess)}>{target}</Link> : target}{relation.label ? <span> - {relation.label}</span> : null}</li>;
    })}</ol></section>
  </div>;
}

function ProcessDetailPage({ process, view, onView, onAdministerVersion, onProcessUpdated, onProcessRemoved, onRefresh, offline }: { process: ProcessDetail; view: DetailView; onView: (view: DetailView) => void; onAdministerVersion: () => void; onProcessUpdated: (process: ProcessDetail) => void; onProcessRemoved: (processId: string) => void; onRefresh: () => void; offline: boolean }) {
  const location = useLocation();
  const version = process.currentVersion;
  const [editing, setEditing] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [leaseToken, setLeaseToken] = useState<string>();
  const [deletingVersionId, setDeletingVersionId] = useState<string>();
  const [bundleValidation, setBundleValidation] = useState<AuthoringState["validation"]>();
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [transitioning, setTransitioning] = useState<WorkflowAction>();
  const [exporting, setExporting] = useState(false);
  const [focusVersionAdministration, setFocusVersionAdministration] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string; tone: "info" | "success" | "warning" | "danger" }>();
  const canEdit = version && ["DRAFT", "CHANGES_REQUESTED"].includes(version.status);
  const workflowActions = process.availableTransitions ?? [];
  const reviewActions = workflowActions.filter((action) => action !== "ARCHIVE");
  const archiveAllowed = workflowActions.includes("ARCHIVE");
  const hasVersionAdministration = archiveAllowed || process.versions.some((item) => item.status === "DRAFT");
  const navigationBlocker = useBlocker(editing && editorDirty);

  useEffect(() => {
    setBundleValidation(undefined);
    setIntegrityOpen(false);
  }, [process.id, version?.id]);

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

  useEffect(() => {
    if (view !== "versions" || (!focusVersionAdministration && location.hash !== "#administracao-da-versao")) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById("administracao-da-versao");
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusVersionAdministration(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusVersionAdministration, location.hash, view]);

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

  async function runTransition(action: WorkflowAction, noteOverride?: string) {
    if (!version || offline) return;
    setTransitioning(action);
    try {
      const note = noteOverride ?? reviewNote;
      await transition(process.id, version.id, action, note.trim() || undefined);
      if (noteOverride === undefined) setReviewNote("");
      setFeedback({ title: "Situação atualizada", message: workflowSuccessMessages[action], tone: "success" });
      onRefresh();
    } catch (error) {
      setFeedback({ title: "Situação não atualizada", message: error instanceof Error ? error.message : "Não foi possível avançar a revisão.", tone: "danger" });
    } finally {
      setTransitioning(undefined);
    }
  }

  async function exportBundle() {
    if (!version || exporting) return;
    setExporting(true);
    try {
      const blob = await downloadProcessBundle(process.id, version.id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${process.slug}-v${version.revision}.process-bundle.zip`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setFeedback({ title: "Pacote não exportado", message: error instanceof Error ? error.message : "Não foi possível exportar o pacote.", tone: "danger" });
    } finally {
      setExporting(false);
    }
  }

  async function removeDraftVersion(versionId: string, revision: number) {
    if (offline || deletingVersionId) return;
    if (editing) {
      setFeedback({ title: "Rascunho em edição", message: "Encerre a edição antes de remover uma versão.", tone: "warning" });
      return;
    }
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
      <div className="detail-actions">{canEdit ? <FurgButton disabled={editing || offline} icon="edit" onClick={() => setEditingMetadata(true)} variant="outlined">Editar dados</FurgButton> : null}{version ? <FurgButton disabled={offline} icon="download" loading={exporting} onClick={() => void exportBundle()} variant="outlined">Exportar pacote</FurgButton> : null}{view === "authoring" && version?.contractVersion === "v2" ? <FurgButton className={`integrity-trigger ${bundleValidation?.valid ? "is-valid" : "is-invalid"}`} disabled={!bundleValidation} onClick={() => setIntegrityOpen(true)} variant="outlined">{integrityButtonLabel(bundleValidation)}</FurgButton> : null}{hasVersionAdministration ? <FurgButton disabled={editing} onClick={() => { setFocusVersionAdministration(true); onAdministerVersion(); }} variant="outlined">Administrar versão</FurgButton> : null}{canEdit ? editing ? <FurgButton onClick={stopEditing} variant="outlined">Encerrar edição</FurgButton> : <FurgButton icon="edit" onClick={startEditing}>Editar diagrama</FurgButton> : null}</div>
    </header>
    {feedback ? <FurgMessage title={feedback.title} message={feedback.message} tone={feedback.tone} /> : null}
    <nav className="detail-nav" aria-label="Conteúdo do processo">{(["overview", "diagram", "operations", "structure", "authoring", "versions"] as const).map((item) => <Link aria-current={view === item ? "page" : undefined} key={item} onClick={(event) => { if (item !== view && !mayNavigate("Salve o rascunho ou encerre a edição antes de trocar de aba.")) event.preventDefault(); }} to={processPath(process, item)}>{({ overview: "Visão geral", diagram: "Diagrama", operations: "Rastreabilidade", structure: "Visão textual", authoring: "Autoria", versions: "Versões" })[item]}</Link>)}</nav>
    {reviewActions.length && !editing ? <WorkflowActions actions={reviewActions} note={reviewNote} onNoteChange={setReviewNote} onRun={runTransition} running={transitioning} /> : null}

    {view === "overview" ? <Overview process={process} onOpenDiagram={() => onView("diagram")} />
      : view === "diagram" ? <><Suspense fallback={<FurgProgressIndicator label="Preparando o editor BPMN" />}><BpmnCanvas editable={editing} key={`${process.id}:${version?.id ?? "sem-versao"}:${editing ? "edit" : "view"}`} xml={process.bpmnXml} onDirtyChange={setEditorDirty} onSave={handleSave} /></Suspense>{canEdit && !editing ? <div className="editor-callout"><FurgButton icon="edit" onClick={startEditing}>Obter bloqueio e editar</FurgButton><p>Uma pessoa por vez. O bloqueio é renovado enquanto a edição permanece ativa.</p></div> : null}</>
      : view === "operations" ? <ProcessV2Workspace locator={process.id} />
      : view === "structure" ? <StructuredView process={process} />
      : view === "authoring" ? <Suspense fallback={<FurgProgressIndicator label="Abrindo a mesa de autoria" />}><AuthoringWorkspace onChanged={onRefresh} onValidationChange={setBundleValidation} process={process} /></Suspense>
      : <VersionsView archiveAllowed={archiveAllowed} archiving={transitioning === "ARCHIVE"} deletingVersionId={deletingVersionId} disabledReason={offline ? "Conecte a API para administrar versões." : editing ? "Encerre a edição antes de administrar versões." : undefined} onArchive={(reason) => runTransition("ARCHIVE", reason)} onDelete={removeDraftVersion} process={process} />}
  </div><PackageIntegrityDialog isOpen={integrityOpen} onClose={() => setIntegrityOpen(false)} validation={bundleValidation} />{canEdit ? <EditProcessDialog isOpen={editingMetadata} onClose={() => setEditingMetadata(false)} onUpdated={(updated) => {
    setEditingMetadata(false);
    onProcessUpdated(updated);
    setFeedback({ title: "Dados atualizados", message: "As informações cadastrais do processo foram salvas.", tone: "success" });
  }} process={process} /> : null}</>;
}

function integrityButtonLabel(validation?: AuthoringState["validation"]) {
  if (!validation) return "Verificando integridade";
  const errors = validation.issues.filter((issue) => issue.severity === "error").length;
  const warnings = validation.issues.filter((issue) => issue.severity === "warning").length;
  if (errors) return `${errors} ${errors === 1 ? "erro impeditivo" : "erros impeditivos"}`;
  if (warnings) return `Sem erros · ${warnings} ${warnings === 1 ? "aviso" : "avisos"}`;
  return "Sem erros estruturais";
}

const coverageLabels: Record<string, string> = {
  bpmnActivities: "Atividades no BPMN", boundActivities: "Elementos vinculados", tracedActivities: "Atividades rastreadas",
  completeMappings: "Mapeamentos completos", operations: "Operações", entryPoints: "Pontos de entrada", forms: "Formulários",
  dataAssets: "Dados e documentos", evidence: "Evidências", publicPhases: "Fases públicas",
  decisions: "Decisões", stateMachines: "Máquinas de estados", jobs: "Rotinas agendadas",
  notifications: "Notificações", accessSubjects: "Perfis e grupos",
};

function PackageIntegrityDialog({ isOpen, onClose, validation }: { isOpen: boolean; onClose: () => void; validation?: AuthoringState["validation"] }) {
  if (!validation) return null;
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  const warnings = validation.issues.filter((issue) => issue.severity === "warning");
  return <FurgDialog description="Resultado da última verificação concluída pelo servidor, após carregar ou salvar esta versão." isOpen={isOpen} onClose={onClose} title="Integridade do pacote">
    <div className="package-integrity">
      {errors.length ? <FurgMessage title={`${errors.length} ${errors.length === 1 ? "erro impede" : "erros impedem"} o salvamento, a revisão e a publicação`} message="Corrija as referências indicadas antes de salvar qualquer alteração contratual." tone="danger" /> : <FurgMessage title="Nenhum erro estrutural encontrado" message={warnings.length ? `O pacote tem ${warnings.length} ${warnings.length === 1 ? "aviso não impeditivo" : "avisos não impeditivos"}.` : "Estrutura, manifesto, BPMN e referências técnicas passaram pela verificação."} tone="success" />}
      <p className="package-integrity__scope">Esta verificação confirma a integridade técnica do contrato. Ela não substitui a análise do conteúdo, a aprovação institucional nem comprova que o processo esteja completo.</p>
      {validation.issues.length ? <section aria-labelledby="integrity-issues"><h3 id="integrity-issues">Apontamentos</h3><ul className="package-integrity__issues">{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><FurgChip label={issue.severity === "error" ? "Erro" : "Aviso"} tone={issue.severity === "error" ? "danger" : "warning"} /><div><strong>{issue.message}</strong>{issue.path ? <code>{issue.path}</code> : null}</div></li>)}</ul></section> : null}
      <section aria-labelledby="integrity-coverage"><h3 id="integrity-coverage">Cobertura registrada</h3><dl className="package-integrity__coverage">{Object.entries(validation.coverage).map(([key, value]) => <div key={key}><dt>{coverageLabels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl></section>
      <div className="package-integrity__actions"><FurgButton onClick={onClose}>Fechar</FurgButton></div>
    </div>
  </FurgDialog>;
}

const workflowLabels: Record<WorkflowAction, string> = {
  SUBMIT_UNIT: "Enviar para revisão da unidade",
  APPROVE_UNIT: "Aprovar pela unidade",
  APPROVE_CURATOR: "Aprovar e publicar",
  REQUEST_CHANGES: "Solicitar ajustes",
  ARCHIVE: "Arquivar versão",
};

const workflowSuccessMessages: Record<WorkflowAction, string> = {
  SUBMIT_UNIT: "Versão enviada para revisão da unidade.",
  APPROVE_UNIT: "Versão aprovada pela unidade e encaminhada à curadoria institucional.",
  APPROVE_CURATOR: "Versão aprovada pela curadoria e publicada.",
  REQUEST_CHANGES: "Versão devolvida para ajustes com a justificativa registrada.",
  ARCHIVE: "Versão arquivada com a justificativa registrada.",
};

function WorkflowActions({ actions, note, running, onNoteChange, onRun }: { actions: WorkflowAction[]; note: string; running?: WorkflowAction; onNoteChange: (note: string) => void; onRun: (action: WorkflowAction) => Promise<void> }) {
  const requiresNote = (action: WorkflowAction) => action === "REQUEST_CHANGES" || action === "ARCHIVE";
  return <FurgSurface className="workflow-panel" padding="large">
    <div><p className="eyebrow">Governança da versão</p><h2>Ações disponíveis para você</h2><p>As opções são calculadas pelo servidor conforme seu papel, sua unidade e a situação atual.</p></div>
    <label><span>Parecer ou justificativa</span><textarea maxLength={1000} onChange={(event) => onNoteChange(event.target.value)} placeholder="Registre o fundamento da decisão. Obrigatório para solicitar ajustes ou arquivar." rows={3} value={note} /></label>
    <div className="workflow-panel__actions">{actions.map((action) => <FurgButton disabled={Boolean(running) || (requiresNote(action) && !note.trim())} key={action} loading={running === action} onClick={() => void onRun(action)} variant={action === "REQUEST_CHANGES" || action === "ARCHIVE" ? "outlined" : "tonal"}>{workflowLabels[action]}</FurgButton>)}</div>
  </FurgSurface>;
}

function Overview({ process, onOpenDiagram }: { process: ProcessDetail; onOpenDiagram: () => void }) {
  return <div className="overview-grid"><main>
    <FurgSurface className="process-thesis" padding="large"><p className="eyebrow">Escopo e resultado</p><h2>{process.audience}</h2><p>O processo é conduzido por <strong>{process.ownerUnit.name}</strong> e termina com um resultado verificável. O prazo planejado global é <strong>{process.processSla ?? "não informado"}</strong>.</p><FurgButton icon="arrow-forward" onClick={onOpenDiagram} variant="text">Percorrer o diagrama</FurgButton></FurgSurface>
    <section className="relation-list"><h2>Encadeamento</h2>{process.relations.length ? process.relations.map((relation) => { const related = relation.sourceProcessId === process.id ? relation.target : relation.source; return <article key={relation.id}><FurgIcon name={relation.type === "EXCHANGES_INFORMATION" ? "sync" : "arrow-forward"} /><div><strong>{relationLabels[relation.type]}</strong>{related ? <Link to={processPath(related)}>{related.title}</Link> : null}<p>{relation.label ?? "Relação institucional registrada"}</p></div></article>; }) : <p>Nenhuma relação registrada.</p>}</section>
  </main><aside><section className="fact-block"><p className="eyebrow">Responsabilidade</p><h2>{process.ownerUnit.acronym}</h2><p>{process.ownerUnit.name}</p></section><section className="fact-block"><p className="eyebrow">Unidades participantes</p><ul>{process.participantUnits.map((unit) => <li key={unit.acronym}>{unit.acronym}<span>{unit.name}</span></li>)}</ul></section><section className="fact-block"><p className="eyebrow">Elementos mapeados</p><strong className="large-number">{process.outline.length}</strong><span>eventos, ações e decisões</span></section></aside></div>;
}

function StructuredView({ process }: { process: ProcessDetail }) {
  return <section className="structured-view"><header><p className="eyebrow">Alternativa acessível ao canvas</p><h2>Fluxo em formato textual</h2><p>Os elementos mantêm os mesmos identificadores do BPMN XML e podem ser percorridos sem interação visual.</p></header><ol>{process.outline.map((element, index) => {
    const metadata = process.elementMetadata.find((item) => item.bpmnElementId === element.id);
    return <li key={element.id}><span className="structured-index">{String(index + 1).padStart(2, "0")}</span><div><small>{humanElementType(element.type)} · {element.id}</small><h3>{element.name}</h3>{metadata ? <dl><div><dt>Papel</dt><dd>{metadata.role ?? "Não definido"}</dd></div><div><dt>Trabalho</dt><dd>{metadata.workDuration ?? "Não informado"}</dd></div><div><dt>Espera</dt><dd>{metadata.waitDuration ?? "Não informada"}</dd></div></dl> : null}</div></li>;
  })}</ol></section>;
}

function VersionsView({ process, archiveAllowed, archiving, deletingVersionId, disabledReason, onArchive, onDelete }: { process: ProcessDetail; archiveAllowed: boolean; archiving: boolean; deletingVersionId?: string; disabledReason?: string; onArchive: (reason: string) => void | Promise<void>; onDelete: (versionId: string, revision: number) => void }) {
  const drafts = process.versions.filter((version) => version.status === "DRAFT");
  const currentVersion = process.currentVersion;
  const hasCriticalActions = archiveAllowed || drafts.length > 0;
  return <section className="versions-view"><h2>Histórico governado</h2><p>Consulte as revisões registradas, suas situações e datas de criação.</p><ol>{process.versions.map((version) => <li key={version.id}><span>v{version.revision}</span><div className="version-row__summary"><strong>{version.perspective === "AS_IS" ? "Processo atual" : "Cenário futuro"}</strong><small>{new Date(version.createdAt).toLocaleDateString("pt-BR")}</small></div><div className="version-row__actions"><FurgChip label={statusLabels[version.status]} tone={toneByStatus[version.status]} /></div></li>)}</ol>
    {hasCriticalActions ? <section className="version-administration" id="administracao-da-versao" tabIndex={-1}><p className="eyebrow">Área reservada</p><h2>Administração da versão</h2><p>Operações desta área alteram a disponibilidade ou removem conteúdo. Cada ação exige uma confirmação explícita.</p>{disabledReason ? <FurgMessage message={disabledReason} title="Administração indisponível" tone="warning" /> : null}<div className="version-danger-zone">
      {archiveAllowed && currentVersion ? <FurgCriticalAction actionLabel="Arquivar versão" confirmationValue={`${process.slug}/v${currentVersion.revision}`} description="A versão permanece preservada no histórico e na auditoria, mas deixa de ser a versão vigente." disabled={Boolean(disabledReason)} impact={currentVersion.status === "PUBLISHED" ? "Esta ação retira a versão vigente da consulta pública. Se não houver outra versão publicada, a página pública do processo ficará indisponível." : "A versão deixará de participar do fluxo ativo, mas continuará preservada para consulta interna e auditoria."} loading={archiving} onConfirm={onArchive} reasonLabel="Justificativa do arquivamento" title={`Arquivar a versão v${currentVersion.revision}`} /> : null}
      {drafts.map((draft) => <FurgCriticalAction actionLabel="Remover rascunho" confirmationValue={`${process.slug}/v${draft.revision}`} description={process.versions.length === 1 ? "Este é o único rascunho. Sua remoção também excluirá o cadastro do processo." : "O rascunho será removido definitivamente e deixará de aparecer no histórico."} disabled={Boolean(disabledReason || deletingVersionId)} impact={process.versions.length === 1 ? "Esta ação remove a única versão e o cadastro completo do processo. Ela não pode ser desfeita." : "Esta ação remove definitivamente o conteúdo do rascunho. Ela não pode ser desfeita."} key={draft.id} loading={deletingVersionId === draft.id} onConfirm={() => onDelete(draft.id, draft.revision)} reasonEnabled={false} title={`Remover o rascunho v${draft.revision}`} />)}
    </div></section> : null}
  </section>;
}

function SchemasPage() {
  const [schemas, setSchemas] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  async function reload(selectedAssetId?: string) { const data = await listSchemas(); setSchemas(data); setSelected(data.find((item) => item.assetId === selectedAssetId) ?? data[0]); }
  useEffect(() => { void reload(); }, []);
  return <div className="contained-page"><FurgPageHeader eyebrow="Contratos de informação" title="Dados que atravessam os processos" description="Entradas e saídas deixam de ser rótulos: cada uma ganha semântica, versão, validação e classificação." />
    <div className="schema-layout"><aside><div className="schema-index-heading"><h2>Ativos catalogados</h2><FurgButton icon="document" onClick={() => setCreating(true)} size="small" variant="outlined">Novo contrato</FurgButton></div>{schemas.map((schema) => <button className={selected?.id === schema.id ? "is-selected" : ""} key={schema.id} onClick={() => setSelected(schema)}><span>{schema.name}</span><small>versão {schema.version} · {schema.visibility === "PUBLIC" ? "público" : schema.visibility === "RESTRICTED" ? "restrito" : "institucional"}</small></button>)}</aside>
      {selected ? <main><div className="schema-heading"><div><p className="eyebrow">JSON Schema 2020-12</p><h2>{selected.name}</h2></div><FurgButton icon="edit" onClick={() => setEditing(true)} variant="outlined">Criar nova versão</FurgButton></div><pre className="schema-code" tabIndex={0}><code>{JSON.stringify(selected.jsonSchema, null, 2)}</code></pre><div className="schema-fields"><h3>Campos principais</h3><ul>{Object.entries(selected.jsonSchema.properties ?? {}).map(([name, value]: [string, any]) => <li key={name}><code>{name}</code><span>{value.type}</span><small>{selected.jsonSchema.required?.includes(name) ? "Obrigatório" : "Opcional"}</small></li>)}</ul></div></main> : <main><FurgMessage title="Nenhum contrato cadastrado" message="Crie o primeiro contrato de dados para torná-lo vinculável aos processos." tone="info" /></main>}
    </div>
    <InformationSchemaDialog current={selected} isOpen={editing} onClose={() => setEditing(false)} onSaved={() => reload(selected?.assetId)} />
    <InformationSchemaDialog isOpen={creating} onClose={() => setCreating(false)} onSaved={() => reload()} />
  </div>;
}

function SoftwarePage() {
  const [operations, setOperations] = useState<CatalogSoftwareOperation[]>([]);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<CatalogSoftwareOperation | null | undefined>();
  const [notice, setNotice] = useState<string>();
  async function reload(message?: string) { setOperations(await listOperations()); if (message) setNotice(message); }
  useEffect(() => { void reload(); }, []);
  return <div className="contained-page"><FurgPageHeader eyebrow="Rastreabilidade técnica" title="Do processo à operação de software" description="Uma tarefa pode usar várias operações; uma operação pode apoiar vários processos sem forçar uma relação um-para-um." />
    {notice ? <FurgMessage title="Catálogo atualizado" message={notice} tone="success" /> : null}
    <FurgSurface padding="large"><div className="software-heading"><div><h2>Operações catalogadas</h2><p>Importações aceleram o cadastro; correções pontuais permanecem disponíveis pela interface.</p></div><div className="software-heading__actions"><FurgButton icon="document" onClick={() => setEditing(null)} variant="outlined">Adicionar operação</FurgButton><FurgButton icon="upload" onClick={() => setImporting(true)}>Importar OpenAPI</FurgButton></div></div><div className="table-scroll"><table><caption>Operações dos sistemas vinculáveis aos elementos BPMN</caption><thead><tr><th>Sistema</th><th>Módulo</th><th>Funcionalidade</th><th>Operação</th><th>Versão</th><th>Ajuste manual</th></tr></thead><tbody>{operations.map((operation) => <tr key={operation.id}><td>{operation.system}</td><td>{operation.module}</td><td>{operation.functionality}</td><td><code>{operation.method} {operation.path}</code><small>{operation.operationId}{operation.deprecated ? " · descontinuada" : ""}</small></td><td>{operation.version}</td><td><FurgButton icon="edit" onClick={() => setEditing(operation)} size="small" variant="text">Editar</FurgButton></td></tr>)}</tbody></table></div></FurgSurface>
    <OpenApiImportDialog isOpen={importing} onClose={() => setImporting(false)} onSaved={reload} />
    <SoftwareOperationDialog current={editing ?? undefined} isOpen={editing !== undefined} onClose={() => setEditing(undefined)} onSaved={reload} />
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
      operations: "Rastreabilidade operacional",
      structure: "Visão textual",
      authoring: "Autoria do contrato",
      versions: "Versões",
    };
    const fallback = sectionMetadata[section];
    const title = process ? `${process.title} - ${viewLabel[view]} | FURG` : fallback.title;
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
      author: { "@type": "Organization", name: "Universidade Federal do Rio Grande - FURG" },
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
