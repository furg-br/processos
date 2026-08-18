import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizationService } from "./authorization.service.js";

afterEach(() => vi.unstubAllEnvs());

describe("AuthorizationService", () => {
  it("aceita capacidade delegada pela unidade", async () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const findFirst = vi.fn().mockResolvedValue({ id: "delegacao-1" });
    const authorization = new AuthorizationService({ delegatedAdministration: { findFirst } } as never);
    await expect(authorization.assertUnitCapability("unidade-1", "PROCESS_EDIT", { "x-user-id": "pessoa-1", "x-unit-ids": "" })).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ unitId: "unidade-1", principalId: "pessoa-1", capabilities: { has: "PROCESS_EDIT" } }) }));
  });

  it("separa aprovação de unidade de curadoria institucional", () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const authorization = new AuthorizationService({} as never);
    expect(() => authorization.assertAnyRole(["INSTITUTIONAL_CURATOR"], { "x-platform-roles": "UNIT_APPROVER,UNIT_ADMIN" })).toThrow("INSTITUTIONAL_CURATOR");
  });

  it("não transforma simples vínculo com a unidade em todas as capacidades", async () => {
    vi.stubEnv("AUTH_MODE", "oidc");
    const findFirst = vi.fn().mockResolvedValue(null);
    const authorization = new AuthorizationService({ delegatedAdministration: { findFirst } } as never);
    const headers = { "x-user-id": "pessoa-1", "x-unit-ids": "unidade-1", "x-platform-roles": "UNIT_APPROVER" };

    await expect(authorization.assertUnitCapability("unidade-1", "PROCESS_EDIT", headers)).rejects.toThrow("PROCESS_EDIT");
    await expect(authorization.assertUnitCapability("unidade-1", "PROCESS_APPROVE", headers)).resolves.toBeUndefined();
  });
});
