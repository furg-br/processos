import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdentityMiddleware.name);
  private readonly jwks = process.env.SSO_JWKS_URL ? createRemoteJWKSet(new URL(process.env.SSO_JWKS_URL)) : undefined;

  async use(request: Request, response: Response, next: NextFunction) {
    if ((process.env.AUTH_MODE ?? "development") === "development") return next();
    if (this.isPublic(request)) return next();
    if (!this.jwks || !process.env.SSO_ISSUER || !process.env.SSO_CLIENT_ID) {
      this.logger.error("OIDC habilitado sem SSO_JWKS_URL, SSO_ISSUER ou SSO_CLIENT_ID.");
      return response.status(503).json({ message: "Autenticação institucional não configurada." });
    }
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response.status(401).json({ message: "Token institucional obrigatório." });
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: process.env.SSO_ISSUER, audience: process.env.SSO_CLIENT_ID });
      const roles = this.arrayClaim(payload.furg_roles ?? payload.roles);
      const units = this.arrayClaim(payload.furg_process_unit_ids ?? payload.furg_unit_ids);
      request.headers["x-user-id"] = String(payload.sub);
      request.headers["x-user-name"] = String(payload.name ?? payload.preferred_username ?? payload.sub);
      request.headers["x-platform-role"] = roles.includes("CGTI_ADMIN") ? "CGTI_ADMIN" : roles.includes("UNIT_ADMIN") ? "UNIT_ADMIN" : "UNIT_EDITOR";
      request.headers["x-platform-roles"] = roles.join(",");
      request.headers["x-unit-ids"] = units.join(",");
      return next();
    } catch (error) {
      this.logger.warn(`OIDC_TOKEN_REJECTED ${error instanceof Error ? error.message : "token inválido"}`);
      return response.status(401).json({ message: "Token institucional inválido ou expirado." });
    }
  }

  private isPublic(request: Request) {
    const url = new URL(request.originalUrl, "http://localhost");
    const path = url.pathname.replace(/\/$/, "");
    const operationalPublic = path.endsWith("/health") || path.includes("/docs/") || path.endsWith("/docs");
    const publicProjection = request.method === "GET"
      && /\/processes\/[^/]+\/projection$/.test(path)
      && url.searchParams.get("audience") === "PUBLIC";
    return operationalPublic || publicProjection;
  }

  private arrayClaim(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return value.split(/[ ,]+/).filter(Boolean);
    return [];
  }
}
