import { describe, expect, it, vi } from "vitest";
import { GovernanceService } from "./governance.service.js";

const cgtiHeaders = { "x-platform-role": "CGTI_ADMIN" };

describe("administração delegada", () => {
  it("não expõe a lista de delegações para usuários comuns", async () => {
    const findMany = vi.fn();
    const service = new GovernanceService({ delegatedAdministration: { findMany } } as never);

    await expect(Promise.resolve().then(() => service.list("unit-id", { "x-platform-role": "UNIT_ADMIN" }))).rejects.toThrow("Somente o CGTI");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("aceita somente capacidades canônicas e remove duplicatas", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "delegation-id" });
    const service = new GovernanceService({
      organizationUnit: { findUnique: vi.fn().mockResolvedValue({ id: "unit-id" }) },
      delegatedAdministration: { upsert },
    } as never);

    await service.delegate("unit-id", { principalId: "person-id", capabilities: ["PROCESS_EDIT", "PROCESS_EDIT"] }, cgtiHeaders);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ capabilities: ["PROCESS_EDIT"] }) }));
    await expect(service.delegate("unit-id", { principalId: "person-id", capabilities: ["ROOT_ACCESS"] }, cgtiHeaders)).rejects.toThrow("Capacidades desconhecidas");
  });
});
