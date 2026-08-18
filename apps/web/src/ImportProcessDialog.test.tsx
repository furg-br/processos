import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyProcessBundle, dryRunProcessBundle, importProcess, listOrganizations } from "./api";
import { ImportProcessDialog } from "./ImportProcessDialog";

vi.mock("./api", () => ({ applyProcessBundle: vi.fn(), dryRunProcessBundle: vi.fn(), importProcess: vi.fn(), listOrganizations: vi.fn() }));

const organization = {
  id: "00000000-0000-4000-8000-000000000001",
  externalId: "FURG-CGTI",
  acronym: "CGTI",
  name: "Centro de Gestão de Tecnologia da Informação",
  active: true,
};

describe("importação de processo", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listOrganizations).mockResolvedValue([organization]);
  });

  it("valida o ProcessBundle em quarentena antes de aplicar a importação", async () => {
    const result = { kind: "process-bundle-v2" as const, processId: "process-id", versionId: "version-id", revision: 2, warnings: [] };
    vi.mocked(dryRunProcessBundle).mockResolvedValue({
      importId: "import-id", status: "VALIDATED", valid: true, readyToApply: true, issues: [],
      coverage: { bpmnActivities: 2, boundActivities: 2, tracedActivities: 2, completeMappings: 2, operations: 1, entryPoints: 1, forms: 1, dataAssets: 1, evidence: 1, publicPhases: 1 },
      manifest: { profile: "IMPLEMENTABLE", processDefinitionKey: "processo.teste", processVersionId: "version-id" },
      requiresCgtiApproval: true, technicalBindingsWillBe: "PENDING_CGTI_APPROVAL", diff: { createsNewProcess: true },
      institutionalUnitMappings: [{
        reference: "unidade.cgti", role: "OWNER", bundleAcronym: "CGTI", bundleLabel: "Centro de Gestão de Tecnologia da Informação",
        status: "RESOLVED", resolvedUnit: organization, candidates: [organization],
      }],
    });
    vi.mocked(applyProcessBundle).mockResolvedValue(result);
    const onImported = vi.fn();
    const { container } = render(<ImportProcessDialog isOpen onClose={vi.fn()} onImported={onImported} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [new File(["bundle"], "processo.zip", { type: "application/zip" })] } });

    expect(await screen.findByText("Pacote completo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Validar sem importar" }));

    await waitFor(() => expect(dryRunProcessBundle).toHaveBeenCalledWith({
      fileName: "processo.zip",
      contentBase64: "YnVuZGxl",
    }));
    expect(await screen.findByText("Pacote válido para importação")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importar e abrir" }));
    await waitFor(() => expect(applyProcessBundle).toHaveBeenCalledWith("import-id", [{ reference: "unidade.cgti", role: "OWNER", unitId: organization.id }]));
    expect(onImported).toHaveBeenCalledWith(result);
  });

  it("solicita identificação adicional para BPMN puro", async () => {
    const result = { kind: "bpmn" as const, processId: "process-id", warnings: [] };
    vi.mocked(importProcess).mockResolvedValue(result);
    const { container } = render(<ImportProcessDialog isOpen onClose={vi.fn()} onImported={vi.fn()} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [new File(["<definitions />"], "Fluxo_de_Compras.bpmn", { type: "application/xml" })] } });

    expect(await screen.findByDisplayValue("Fluxo de Compras")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("select")).toHaveValue(""));
    fireEvent.change(container.querySelector("select")!, { target: { value: organization.id } });
    fireEvent.click(screen.getByRole("button", { name: "Importar e abrir" }));

    await waitFor(() => expect(importProcess).toHaveBeenCalledWith(expect.objectContaining({
      fileName: "Fluxo_de_Compras.bpmn",
      title: "Fluxo de Compras",
      slug: "fluxo-de-compras",
      ownerUnitId: organization.id,
    })));
  });

  it("não aplica pacote enquanto uma referência institucional não for reconciliada", async () => {
    vi.mocked(dryRunProcessBundle).mockResolvedValue({
      importId: "import-id", status: "VALIDATED", valid: true, readyToApply: false, issues: [],
      coverage: { bpmnActivities: 1, boundActivities: 1, tracedActivities: 1, completeMappings: 1, operations: 0, entryPoints: 0, forms: 0, dataAssets: 0, evidence: 0, publicPhases: 1 },
      manifest: { profile: "ANALYZABLE", processDefinitionKey: "processo.teste", processVersionId: "version-id" },
      requiresCgtiApproval: false, technicalBindingsWillBe: "APPROVED", diff: { createsNewProcess: true },
      institutionalUnitMappings: [{
        reference: "unidade.desconhecida", role: "OWNER", bundleAcronym: "NOVA", bundleLabel: "Unidade ainda não cadastrada",
        status: "UNRESOLVED", candidates: [],
      }],
    });
    const { container } = render(<ImportProcessDialog isOpen onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [new File(["bundle"], "processo.zip", { type: "application/zip" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Validar sem importar" }));

    expect(await screen.findByText("Referência ainda não cadastrada. A decisão exige administração da plataforma.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar e abrir" })).toBeDisabled();
    fireEvent.change(container.querySelector("select")!, { target: { value: organization.id } });
    expect(screen.getByRole("button", { name: "Importar e abrir" })).toBeEnabled();
  });

  it("rejeita formatos que não representam um processo", async () => {
    const { container } = render(<ImportProcessDialog isOpen onClose={vi.fn()} onImported={vi.fn()} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [new File(["texto"], "anotacoes.txt", { type: "text/plain" })] } });

    expect(await screen.findByText("Selecione um ProcessBundle ZIP ou um arquivo BPMN/XML.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar e abrir" })).toBeDisabled();
    expect(importProcess).not.toHaveBeenCalled();
  });
});
