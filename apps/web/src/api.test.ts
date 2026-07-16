import { afterEach, describe, expect, it, vi } from "vitest";
import { createProcess, deleteDraftVersion, importProcess, releaseLease, renewLease, updateProcessMetadata } from "./api";

describe("API de bloqueio de edição", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renova o bloqueio pela rota de lease do processo", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "lease-token", expiresAt: "2026-07-15T00:00:00.000Z" }),
    });
    vi.stubGlobal("fetch", fetch);

    await renewLease("lease-token");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/processes/leases/lease-token",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("libera o bloqueio com uma requisição preservada durante a saída da página", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ released: true }) });
    vi.stubGlobal("fetch", fetch);

    await releaseLease("lease-token");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/processes/leases/lease-token",
      expect.objectContaining({ method: "DELETE", keepalive: true }),
    );
  });
});

describe("API de processos", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("envia os metadados e o BPMN inicial para criação", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "process-id" }) });
    vi.stubGlobal("fetch", fetch);
    const input = {
      title: "Aquisição de material",
      description: "Organiza a aquisição de material permanente.",
      category: "Compras",
      audience: "Unidades administrativas",
      visibility: "INTERNAL" as const,
      ownerUnitId: "00000000-0000-4000-8000-000000000001",
      perspective: "AS_IS" as const,
      bpmnXml: "<definitions />",
    };

    await createProcess(input);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/processes",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("atualiza os dados na versão editável do processo", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "process-id" }) });
    vi.stubGlobal("fetch", fetch);
    const input = {
      title: "Aquisição de material revisada",
      description: "Organiza e acompanha a aquisição de material permanente.",
      category: "Compras",
      audience: "Unidades administrativas",
      visibility: "INTERNAL" as const,
      ownerUnitId: "00000000-0000-4000-8000-000000000001",
      perspective: "TO_BE" as const,
    };

    await updateProcessMetadata("process-id", "version-id", input);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/processes/process-id/versions/version-id/metadata",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(input) }),
    );
  });

  it("envia um ProcessBundle para importação", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ kind: "process-bundle", processId: "process-id", warnings: [] }) });
    vi.stubGlobal("fetch", fetch);
    const input = { fileName: "processo.zip", contentBase64: "YnVuZGxl" };

    await importProcess(input);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/processes/import",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("remove uma versão em rascunho", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ deletedVersionId: "version-id", deletedProcess: false }) });
    vi.stubGlobal("fetch", fetch);

    await deleteDraftVersion("process-id", "version-id");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/processes/process-id/versions/version-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
