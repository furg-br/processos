import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProcess, listOrganizations } from "./api";
import { NewProcessDialog } from "./NewProcessDialog";

vi.mock("./api", () => ({ createProcess: vi.fn(), listOrganizations: vi.fn() }));

describe("criação de processo", () => {
  it("cria o rascunho e encaminha para o diagrama", async () => {
    vi.mocked(listOrganizations).mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000001",
      externalId: "FURG-CGTI",
      acronym: "CGTI",
      name: "Centro de Gestão de Tecnologia da Informação",
      active: true,
    }]);
    vi.mocked(createProcess).mockResolvedValue({ id: "process-id", slug: "aquisicao-de-material", title: "Aquisição de material" });
    const onCreated = vi.fn();
    render(<NewProcessDialog isOpen onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/Nome do processo/), { target: { value: "Aquisição de material" } });
    fireEvent.change(screen.getByLabelText(/Categoria/), { target: { value: "Compras" } });
    fireEvent.change(screen.getByLabelText(/Resumo/), { target: { value: "Organiza a aquisição de material permanente." } });
    fireEvent.change(screen.getByLabelText(/Público atendido/), { target: { value: "Unidades administrativas" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /CGTI/ })).toBeInTheDocument());
    expect(screen.getByLabelText(/Unidade responsável/)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(/Unidade responsável/), { target: { value: "00000000-0000-4000-8000-000000000001" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar e abrir diagrama" }));

    await waitFor(() => expect(createProcess).toHaveBeenCalledWith(expect.objectContaining({
      title: "Aquisição de material",
      ownerUnitId: "00000000-0000-4000-8000-000000000001",
      perspective: "AS_IS",
      visibility: "INTERNAL",
      bpmnXml: expect.stringContaining("Process_FURG"),
    })));
    expect(vi.mocked(createProcess).mock.calls[0]?.[0].bpmnXml).toContain('name="Aquisição de material"');
    expect(onCreated).toHaveBeenCalledWith({ id: "process-id", slug: "aquisicao-de-material", title: "Aquisição de material" });
  });
});
