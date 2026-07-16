import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { demoDetails, demoProcesses } from "./demo-data";
import { listOrganizations, updateProcessMetadata } from "./api";
import { EditProcessDialog } from "./EditProcessDialog";

vi.mock("./api", () => ({ listOrganizations: vi.fn(), updateProcessMetadata: vi.fn() }));

describe("edição dos dados do processo", () => {
  it("carrega os valores atuais e salva os ajustes", async () => {
    const process = demoDetails[demoProcesses[3]!.id]!;
    vi.mocked(listOrganizations).mockResolvedValue([{
      id: process.ownerUnit.id!,
      externalId: "FURG-CGTI",
      acronym: process.ownerUnit.acronym,
      name: process.ownerUnit.name,
      active: true,
    }]);
    vi.mocked(updateProcessMetadata).mockResolvedValue({ ...process, title: "Publicação controlada em produção" });
    const onUpdated = vi.fn();

    render(<EditProcessDialog isOpen process={process} onClose={vi.fn()} onUpdated={onUpdated} />);

    expect(screen.getByLabelText(/Nome do processo/)).toHaveValue(process.title);
    fireEvent.change(screen.getByLabelText(/Nome do processo/), { target: { value: "Publicação controlada em produção" } });
    fireEvent.change(screen.getByLabelText("Visibilidade"), { target: { value: "RESTRICTED" } });
    await waitFor(() => expect(screen.getByLabelText(/Unidade responsável/)).toHaveValue(process.ownerUnit.id!));
    fireEvent.click(screen.getByRole("button", { name: "Salvar dados" }));

    await waitFor(() => expect(updateProcessMetadata).toHaveBeenCalledWith(
      process.id,
      process.currentVersion!.id,
      expect.objectContaining({ title: "Publicação controlada em produção", visibility: "RESTRICTED" }),
    ));
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ title: "Publicação controlada em produção" }));
  });
});
