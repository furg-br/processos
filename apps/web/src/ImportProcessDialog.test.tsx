import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importProcess, listOrganizations } from "./api";
import { ImportProcessDialog } from "./ImportProcessDialog";

vi.mock("./api", () => ({ importProcess: vi.fn(), listOrganizations: vi.fn() }));

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

  it("envia um ProcessBundle e encaminha o resultado", async () => {
    const result = { kind: "process-bundle" as const, processId: "process-id", versionId: "version-id", revision: 2, warnings: [] };
    vi.mocked(importProcess).mockResolvedValue(result);
    const onImported = vi.fn();
    const { container } = render(<ImportProcessDialog isOpen onClose={vi.fn()} onImported={onImported} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [new File(["bundle"], "processo.zip", { type: "application/zip" })] } });

    expect(await screen.findByText("Pacote completo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importar e abrir" }));

    await waitFor(() => expect(importProcess).toHaveBeenCalledWith({
      fileName: "processo.zip",
      contentBase64: "YnVuZGxl",
    }));
    expect(onImported).toHaveBeenCalledWith(result);
  });

  it("solicita identificação adicional para BPMN puro", async () => {
    const result = { kind: "bpmn" as const, processId: "process-id", warnings: [] };
    vi.mocked(importProcess).mockResolvedValue(result);
    const { container } = render(<ImportProcessDialog isOpen onClose={vi.fn()} onImported={vi.fn()} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [new File(["<definitions />"], "Fluxo_de_Compras.bpmn", { type: "application/xml" })] } });

    expect(await screen.findByDisplayValue("Fluxo de Compras")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("select")).toHaveValue(organization.id));
    fireEvent.click(screen.getByRole("button", { name: "Importar e abrir" }));

    await waitFor(() => expect(importProcess).toHaveBeenCalledWith(expect.objectContaining({
      fileName: "Fluxo_de_Compras.bpmn",
      title: "Fluxo de Compras",
      slug: "fluxo-de-compras",
      ownerUnitId: organization.id,
    })));
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
