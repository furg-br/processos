import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(document.title).toBe("Solicitação de desenvolvimento de software - Visão textual | FURG");
  });

  it("remove o único rascunho pela zona de risco após repetir o identificador", async () => {
    const process = demoDetails[demoProcesses[3]!.id]!;
    window.history.replaceState({}, "", `/processos/${process.id}/publicacao-producao/versoes`);
    const fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return Promise.resolve({ ok: true, json: () => Promise.resolve({ deletedVersionId: process.currentVersion!.id, deletedProcess: true }) });
      if (input.endsWith(`/processes/${process.id}`)) return Promise.resolve({ ok: true, json: () => Promise.resolve(process) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(demoProcesses) });
    });
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Remover rascunho" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Identificador de confirmação" }), { target: { value: `${process.slug}/v1` } });
    const finalAction = screen.getAllByRole("button", { name: "Remover rascunho" })[1];
    expect(finalAction).toBeEnabled();
    fireEvent.click(finalAction!);

    expect(await screen.findByText("O processo foi removido porque não possuía outra versão.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/processes/${process.id}/versions/${process.currentVersion!.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("mantém o arquivamento fora das ações rotineiras e protegido na administração da versão", async () => {
    const source = demoDetails[demoProcesses[0]!.id]!;
    const process = {
      ...source,
      currentVersion: { ...source.currentVersion!, status: "PUBLISHED" as const },
      versions: [{ ...source.currentVersion!, status: "PUBLISHED" as const }],
      availableTransitions: ["ARCHIVE"] as const,
    };
    window.history.replaceState({}, "", `/processos/${process.id}/${process.slug}`);
    const fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "POST" && input.endsWith("/transitions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "ARCHIVED" }) });
      if (input.endsWith(`/processes/${process.id}`)) return Promise.resolve({ ok: true, json: () => Promise.resolve(process) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(demoProcesses) });
    });
    vi.stubGlobal("fetch", fetch);

    render(<App />);
    expect(await screen.findByRole("button", { name: "Administrar versão" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ações disponíveis para você" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Administrar versão" }));
    expect(await screen.findByRole("heading", { name: "Administração da versão" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#administracao-da-versao");
    fireEvent.click(screen.getByRole("button", { name: "Arquivar versão" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Justificativa do arquivamento (obrigatória)" }), { target: { value: "Substituída pela versão aprovada." } });
    fireEvent.change(screen.getByRole("textbox", { name: "Identificador de confirmação" }), { target: { value: `${process.slug}/v${process.currentVersion.revision}` } });
    fireEvent.click(screen.getAllByRole("button", { name: "Arquivar versão" })[1]!);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/processes/${process.id}/versions/${process.currentVersion.id}/transitions`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "ARCHIVE", note: "Substituída pela versão aprovada." }) }),
    ));
  });

  it("mostra a integridade do pacote sob demanda ao lado da exportação", async () => {
    const source = demoDetails[demoProcesses[0]!.id]!;
    const process = {
      ...source,
      currentVersion: { ...source.currentVersion!, contractVersion: "v2" as const },
      versions: [{ ...source.currentVersion!, contractVersion: "v2" as const }],
    };
    const coverage = {
      bpmnActivities: 3, boundActivities: 3, tracedActivities: 3, completeMappings: 3, operations: 2,
      entryPoints: 1, forms: 1, dataAssets: 1, evidence: 1, publicPhases: 2, decisions: 1,
      stateMachines: 1, jobs: 0, notifications: 1, accessSubjects: 2,
    };
    window.history.replaceState({}, "", `/processos/${process.id}/${process.slug}/autoria`);
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => {
      if (input.endsWith(`/processes/${process.id}`)) return Promise.resolve({ ok: true, json: () => Promise.resolve(process) });
      if (input.endsWith(`/processes/${process.id}/versions/${process.currentVersion.id}/authoring`)) return Promise.resolve({ ok: true, json: () => Promise.resolve({
        version: { id: process.currentVersion.id, revision: process.currentVersion.revision, status: "PUBLISHED", immutable: true, bindingSetVersionId: "binding-set" },
        editable: false, resources: [], responsibilities: { ownerUnit: process.ownerUnit, participantUnits: process.participantUnits },
        validation: { valid: true, issues: [], coverage }, capabilities: { canEdit: false, canEditTechnical: false },
      }) });
      if (input.endsWith("/catalog/organizations")) return Promise.resolve({ ok: true, json: () => Promise.resolve([process.ownerUnit, ...process.participantUnits]) });
      if (input.endsWith("/processes/relations/catalog")) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve([process]) });
    }));

    render(<App />);

    const integrity = await screen.findByRole("button", { name: "Sem erros estruturais" }, { timeout: 10_000 });
    expect(screen.getByRole("button", { name: "Exportar pacote" }).parentElement).toContainElement(integrity);
    expect(screen.queryByRole("heading", { name: "Integridade do pacote" })).not.toBeInTheDocument();
    fireEvent.click(integrity);
    expect(await screen.findByRole("heading", { name: "Integridade do pacote" })).toBeInTheDocument();
    expect(screen.getByText(/não substitui a análise do conteúdo/i)).toBeInTheDocument();
    expect(screen.getByText("Máquinas de estados")).toBeInTheDocument();
  });

  it("mostra somente transições autorizadas pelo backend e exige justificativa ao devolver", async () => {
    const source = demoDetails[demoProcesses[2]!.id]!;
    const process = {
      ...source,
      currentVersion: { ...source.currentVersion!, status: "UNIT_REVIEW" as const },
      versions: [{ ...source.currentVersion!, status: "UNIT_REVIEW" as const }],
      availableTransitions: ["APPROVE_UNIT", "REQUEST_CHANGES"] as const,
    };
    window.history.replaceState({}, "", `/processos/${process.id}/${process.slug}`);
    const fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === "POST" && input.endsWith("/transitions")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "CHANGES_REQUESTED" }) });
      if (input.endsWith(`/processes/${process.id}`)) return Promise.resolve({ ok: true, json: () => Promise.resolve(process) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(demoProcesses) });
    });
    vi.stubGlobal("fetch", fetch);

    render(<App />);

    const returnButton = await screen.findByRole("button", { name: "Solicitar ajustes" });
    expect(screen.getByRole("button", { name: "Aprovar pela unidade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar e publicar" })).not.toBeInTheDocument();
    expect(returnButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Parecer ou justificativa"), { target: { value: "Completar as evidências normativas." } });
    expect(returnButton).toBeEnabled();
    fireEvent.click(returnButton);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/processes/${process.id}/versions/${process.currentVersion!.id}/transitions`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "REQUEST_CHANGES", note: "Completar as evidências normativas." }) }),
    ));
  });
});
