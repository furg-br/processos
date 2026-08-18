import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ProcessV2Workspace } from "./ProcessV2Workspace";
import * as api from "./api";

vi.mock("./api", async (loadOriginal) => ({ ...(await loadOriginal<typeof import("./api")>()), getProcessV2Projection: vi.fn(), getProcessAccessMatrix: vi.fn(), getProcessV2Activity: vi.fn(), reviewTechnicalBindings: vi.fn() }));

const projection = {
  process: { id: "process-1", slug: "rsc", title: "RSC", description: "Reconhecimento", ownerUnit: { acronym: "PROGEP", name: "Pró-Reitoria" } },
  version: { id: "version-1", revision: 1, profile: "IMPLEMENTABLE", status: "DRAFT", bindingSetVersionId: "binding-1", bindingStatus: "PENDING" },
  bpmnXml: "<definitions />",
  resources: [
    { kind: "ElementBindingCatalog", spec: { elements: [{ bpmnElementId: "Task_Submit", semanticId: "rsc.pedido.enviar", label: "Enviar pedido para avaliação", phaseRef: "fase.protocolo" }] } },
    { kind: "OperationalTraceabilityCatalog", spec: { activities: [{ activityRef: "rsc.pedido.enviar", executionMode: "HUMAN_UI", actorRefs: ["ator.servidor"], interactionPointRefs: ["rsc.tela.pedido"], completionActions: [{ key: "rsc.acao.enviar", label: "Enviar pedido para avaliação", operationRefs: ["rsc.operacao.enviar"], effects: [{ activityRef: "rsc.sistema.protocolar" }] }], timingPolicyRefs: [] }] } },
    { kind: "PhaseCatalog", spec: { phases: [{ key: "fase.protocolo", label: "Protocolo" }] } },
    { kind: "SoftwareCatalog", spec: { systems: [{ key: "sistema.srh", label: "SRH" }], modules: [], entryPoints: [{ key: "rsc.tela.pedido", systemRef: "sistema.srh", label: "Aplicação RSC", menuPath: ["SRH", "RSC"] }], operations: [{ key: "rsc.operacao.enviar", systemRef: "sistema.srh", label: "Enviar", kind: "UI_COMMAND", version: "1", deprecated: false, evidenceRefs: [] }] } },
    { kind: "FormCatalog", spec: { forms: [] } }, { kind: "DataAssetCatalog", spec: { assets: [] } },
    { kind: "AccessCatalog", spec: { actors: [], profiles: [], groups: [], grants: [], policies: [] } },
    { kind: "AutomationCatalog", spec: { timingPolicies: [], jobs: [], integrations: [] } },
    { kind: "DecisionCatalog", spec: { decisions: [] } }, { kind: "StateCatalog", spec: { machines: [] } },
    { kind: "CommunicationCatalog", spec: { templates: [], notifications: [] } },
    { kind: "ProjectionCatalog", spec: { projections: [] } }, { kind: "ProvenanceCatalog", spec: { sourceArtifacts: [], evidence: [] } },
  ],
  bindingSets: [{ id: "binding-1", revision: 1, status: "PENDING", createdAt: "2026-08-16T12:00:00Z", approvals: [{ semanticKey: "rsc.operacao.enviar", status: "PENDING" }] }],
  capabilities: { canReviewTechnicalBindings: false },
} as any;

afterEach(() => { cleanup(); vi.clearAllMocks(); globalThis.history.replaceState(null, "", "/"); });

describe("rastreabilidade operacional v2", () => {
  it("torna aplicação e ação de conclusão visíveis na tabela derivada", async () => {
    vi.mocked(api.getProcessV2Projection).mockResolvedValue(projection);
    vi.mocked(api.getProcessAccessMatrix).mockResolvedValue([]);
    render(<ProcessV2Workspace locator="rsc" />);

    expect(await screen.findByText("Aplicação RSC")).toBeInTheDocument();
    expect(screen.getAllByText("Enviar pedido para avaliação").length).toBeGreaterThan(0);
    expect(screen.getByText(/ator · servidor/)).toBeInTheDocument();
    const accessibility = await axe.run(globalThis.document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(accessibility.violations.map((violation) => violation.id)).toEqual([]);
  });

  it("explica que uma revisão pendente pertence ao CGTI", async () => {
    vi.mocked(api.getProcessV2Projection).mockResolvedValue(projection);
    vi.mocked(api.getProcessAccessMatrix).mockResolvedValue([]);
    render(<ProcessV2Workspace locator="rsc" />);
    fireEvent.click(await screen.findByRole("link", { name: "Evidências e publicações" }));

    expect(screen.getByText("Revisão técnica protegida")).toBeInTheDocument();
    expect(screen.getByText(/Administrador do CGTI/)).toBeInTheDocument();
  });

  it("abre uma visão diretamente por âncora e mantém links compartilháveis", async () => {
    globalThis.history.replaceState(null, "", "/processos/rsc/operacao#perfis-e-grupos");
    vi.mocked(api.getProcessV2Projection).mockResolvedValue(projection);
    vi.mocked(api.getProcessAccessMatrix).mockResolvedValue([]);
    render(<ProcessV2Workspace locator="rsc" />);

    expect(await screen.findByRole("heading", { name: "O que cada perfil ou grupo pode fazer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Perfis e grupos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dados e formulários" })).toHaveAttribute("href", "#dados-e-formularios");
  });

  it("apresenta inventários em acordeões e traduz categorias técnicas", async () => {
    globalThis.history.replaceState(null, "", "/processos/rsc/operacao#dados-e-formularios");
    const inventoryProjection = structuredClone(projection);
    inventoryProjection.resources.find((item: any) => item.kind === "DataAssetCatalog").spec.assets = [{ classification: "RESTRICTED", key: "dado.rsc.pedido", kind: "INFORMATION_ASSET", label: "Pedido de RSC", schemaPath: "pedido.schema.json" }];
    inventoryProjection.resources.find((item: any) => item.kind === "FormCatalog").spec.forms = [{ fields: [{ access: "READ_ONLY", component: "text-field", label: "SIAPE(read-only)", path: "siape" }], key: "formulario.formpedidoinserir", label: "FormPedidoInserir", uiSchemaDialect: "furg.forms/v1" }];
    vi.mocked(api.getProcessV2Projection).mockResolvedValue(inventoryProjection);
    vi.mocked(api.getProcessAccessMatrix).mockResolvedValue([]);
    render(<ProcessV2Workspace locator="rsc" />);

    expect(await screen.findByText("Ativo de informação")).toBeInTheDocument();
    expect(screen.getByText("Restrita")).toBeInTheDocument();
    expect(screen.getByText("Campo de texto · Somente leitura")).toBeInTheDocument();
    expect(screen.getByText("SIAPE(somente leitura)")).toBeInTheDocument();
    expect(screen.getByText("Inserir pedido").closest("details")).toHaveAttribute("open");
    expect(screen.queryByText("INFORMATION_ASSET")).not.toBeInTheDocument();
  });
});
