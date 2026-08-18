import { afterEach, describe, expect, it, vi } from "vitest";
import { WebhookService } from "./webhook.service.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("WebhookService", () => {
  it("reserva o despacho ao CGTI", async () => {
    const service = new WebhookService({} as never);
    await expect(service.dispatch({ "x-platform-role": "UNIT_EDITOR" })).rejects.toThrow("Somente administradores do CGTI");
  });

  it("entrega evento assinado e confirma o outbox somente após resposta 2xx", async () => {
    vi.stubEnv("PROCESS_REVIEW_WEBHOOK_URL", "https://integracao.furg.br/process-review");
    vi.stubEnv("PROCESS_REVIEW_WEBHOOK_SECRET", "segredo-de-teste");
    const update = vi.fn().mockResolvedValue({});
    const prisma = { webhookOutboxEvent: { findMany: vi.fn().mockResolvedValue([{ id: "event-1", type: "process.source-drift.detected", payload: { processVersionId: "version-1" }, status: "PENDING", attempts: 0, createdAt: new Date("2026-08-16T12:00:00Z") }]), update } };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetch);

    const result = await new WebhookService(prisma as never).dispatch({ "x-platform-role": "CGTI_ADMIN" });

    expect(result).toMatchObject({ attempted: 1, delivered: 1 });
    expect(fetch).toHaveBeenCalledWith("https://integracao.furg.br/process-review", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-processos-signature-256": expect.stringMatching(/^sha256=[a-f0-9]{64}$/) }) }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DELIVERED" }) }));
  });
});
