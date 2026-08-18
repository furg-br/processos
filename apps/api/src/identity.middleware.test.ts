import { createServer } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityMiddleware } from "./identity.middleware.js";

afterEach(() => vi.unstubAllEnvs());

describe("IdentityMiddleware", () => {
  it("mantém o modo de desenvolvimento explícito sem provedor externo", async () => {
    vi.stubEnv("AUTH_MODE", "development");
    const next = vi.fn();
    await new IdentityMiddleware().use({ originalUrl: "/api/v1/processes", method: "GET", headers: {} } as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("não permite contornar autenticação injetando uma rota pública na query string", () => {
    const middleware = new IdentityMiddleware();
    expect((middleware as any).isPublic({ originalUrl: "/api/v1/processes/rsc/projection?audience=PUBLIC", method: "GET" })).toBe(true);
    expect((middleware as any).isPublic({ originalUrl: "/api/v1/processes?next=/projection&audience=PUBLIC", method: "GET" })).toBe(false);
  });

  it("valida assinatura, issuer e audience e deriva papéis e unidades dos claims", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "institutional-key", alg: "RS256", use: "sig" };
    const server = createServer((_request, response) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ keys: [jwk] })); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor JWKS não iniciou.");
    const issuer = "https://identidade.furg.br";
    vi.stubEnv("AUTH_MODE", "oidc");
    vi.stubEnv("SSO_JWKS_URL", `http://127.0.0.1:${address.port}/jwks`);
    vi.stubEnv("SSO_ISSUER", issuer);
    vi.stubEnv("SSO_CLIENT_ID", "catalogo-processos");
    const token = await new SignJWT({ name: "Pessoa CGTI", furg_roles: ["CGTI_ADMIN"], furg_unit_ids: ["unidade-cgti"] })
      .setProtectedHeader({ alg: "RS256", kid: "institutional-key" }).setIssuer(issuer).setAudience("catalogo-processos").setSubject("usuario-1").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const request = { originalUrl: "/api/v1/processes", method: "GET", headers: { authorization: `Bearer ${token}`, "x-platform-role": "UNIT_EDITOR" } };
    const next = vi.fn();
    try {
      await new IdentityMiddleware().use(request as never, { status: vi.fn() } as never, next);
      expect(next).toHaveBeenCalledOnce();
      expect(request.headers).toMatchObject({ "x-user-id": "usuario-1", "x-user-name": "Pessoa CGTI", "x-platform-role": "CGTI_ADMIN", "x-unit-ids": "unidade-cgti" });
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
