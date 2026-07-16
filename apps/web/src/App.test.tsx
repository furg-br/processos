import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { demoDetails, demoProcesses } from "./demo-data";

describe("Catálogo de processos", () => {
  beforeEach(() => window.history.replaceState({}, "", "/catalogo"));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("apresenta o catálogo demonstrativo quando a API está indisponível", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<App />);
    expect(await screen.findByRole("heading", { name: /Do trabalho institucional/i })).toBeInTheDocument();
    expect(await screen.findByText("Solicitação de desenvolvimento de software")).toBeInTheDocument();
    expect(screen.getByText(/Modo de demonstração/)).toBeInTheDocument();
  });

  it("abre uma visão compartilhada pela URL", async () => {
    window.history.replaceState({}, "", "/processos/solicitacao-desenvolvimento/estrutura");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Solicitação de desenvolvimento de software" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Fluxo em formato textual" })).toBeInTheDocument();
    expect(document.title).toBe("Solicitação de desenvolvimento de software — Visão textual | FURG");
  });

  it("remove o único rascunho pela aba Versões após confirmação", async () => {
    const process = demoDetails[demoProcesses[3]!.id]!;
    window.history.replaceState({}, "", `/processos/${process.id}/publicacao-producao/versoes`);
    const fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve({ ok: true, json: () => Promise.resolve({ deletedVersionId: process.currentVersion!.id, deletedProcess: true }) });
      if (input.endsWith(`/processes/${process.id}`)) return Promise.resolve({ ok: true, json: () => Promise.resolve(process) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(demoProcesses) });
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);
    const removeButton = await screen.findByRole("button", { name: "Remover rascunho v1" });
    fireEvent.click(removeButton);

    expect(await screen.findByText("O processo foi removido porque não possuía outra versão.")).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("também excluirá o cadastro do processo"));
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/processes/${process.id}/versions/${process.currentVersion!.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
