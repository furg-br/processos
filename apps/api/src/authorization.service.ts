import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

export type InstitutionalActor = { id: string; name: string; roles: string[]; unitIds: string[] };

const unitCapabilityRoles: Record<string, string[]> = {
  PROCESS_CREATE: ["UNIT_EDITOR", "UNIT_ADMIN"],
  PROCESS_EDIT: ["UNIT_EDITOR", "UNIT_ADMIN"],
  PROCESS_APPROVE: ["UNIT_APPROVER", "UNIT_ADMIN"],
  BUNDLE_IMPORT: ["UNIT_EDITOR", "UNIT_ADMIN"],
  PROCESS_VIEW_TECHNICAL: ["UNIT_VIEWER", "UNIT_EDITOR", "UNIT_APPROVER", "UNIT_ADMIN"],
  PROCESS_VIEW_RESTRICTED: ["UNIT_VIEWER", "UNIT_EDITOR", "UNIT_APPROVER", "UNIT_ADMIN"],
  PROCESS_EXPORT_TECHNICAL: ["UNIT_EDITOR", "UNIT_APPROVER", "UNIT_ADMIN"],
  SOURCE_EVIDENCE_CHECK: ["UNIT_EDITOR", "UNIT_APPROVER", "UNIT_ADMIN"],
};

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  actor(headers?: Record<string, string | undefined>): InstitutionalActor {
    const roles = new Set((headers?.["x-platform-roles"] ?? headers?.["x-platform-role"] ?? "UNIT_EDITOR").split(",").map((value) => value.trim()).filter(Boolean));
    return {
      id: headers?.["x-user-id"] ?? "00000000-0000-4000-8000-000000000001",
      name: headers?.["x-user-name"] ?? "Curadoria de demonstração",
      roles: [...roles],
      unitIds: (headers?.["x-unit-ids"] ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    };
  }

  isCgti(headers?: Record<string, string | undefined>) { return this.actor(headers).roles.some((role) => ["CGTI_ADMIN", "PLATFORM_ADMIN"].includes(role)); }

  async assertUnitCapability(unitId: string, capability: string, headers?: Record<string, string | undefined>) {
    if ((process.env.AUTH_MODE ?? "development") === "development" || this.isCgti(headers)) return;
    const actor = this.actor(headers);
    const allowedRoles = unitCapabilityRoles[capability] ?? [];
    if (actor.unitIds.includes(unitId) && actor.roles.some((role) => allowedRoles.includes(role))) return;
    const delegated = await this.prisma.delegatedAdministration.findFirst({ where: { unitId, principalId: actor.id, active: true, capabilities: { has: capability } }, select: { id: true } });
    if (!delegated) throw new ForbiddenException(`O usuário não possui a capacidade ${capability} para esta unidade.`);
  }

  assertAnyRole(allowed: string[], headers?: Record<string, string | undefined>) {
    if ((process.env.AUTH_MODE ?? "development") === "development") return;
    const actor = this.actor(headers);
    if (!actor.roles.some((role) => allowed.includes(role))) throw new ForbiddenException(`Esta ação exige um dos papéis: ${allowed.join(", ")}.`);
  }
}
