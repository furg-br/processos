import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

const isCgti = (headers?: Record<string, string | undefined>) => (headers?.["x-platform-roles"] ?? headers?.["x-platform-role"] ?? "").split(",").some((role) => ["CGTI_ADMIN", "PLATFORM_ADMIN"].includes(role.trim()));
const delegatedCapabilities = new Set([
  "PROCESS_CREATE", "PROCESS_EDIT", "PROCESS_APPROVE", "BUNDLE_IMPORT",
  "PROCESS_VIEW_TECHNICAL", "PROCESS_VIEW_RESTRICTED", "PROCESS_EXPORT_TECHNICAL",
  "SOURCE_EVIDENCE_CHECK",
]);

@Injectable()
export class GovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  list(unitId: string, headers?: Record<string, string | undefined>) {
    if (!isCgti(headers)) throw new ForbiddenException("Somente o CGTI pode consultar delegações de administração.");
    return this.prisma.delegatedAdministration.findMany({ where: { unitId, active: true }, orderBy: { createdAt: "asc" } });
  }

  async delegate(unitId: string, input: { principalId: string; capabilities: string[] }, headers?: Record<string, string | undefined>) {
    if (!isCgti(headers)) throw new ForbiddenException("Somente o CGTI pode conceder a administração inicial de uma unidade.");
    if (!await this.prisma.organizationUnit.findUnique({ where: { id: unitId } })) throw new NotFoundException("Unidade não encontrada.");
    const capabilities = [...new Set(input.capabilities)];
    const unknown = capabilities.filter((capability) => !delegatedCapabilities.has(capability));
    if (!capabilities.length || unknown.length) throw new BadRequestException(unknown.length ? `Capacidades desconhecidas: ${unknown.join(", ")}.` : "Informe ao menos uma capacidade.");
    return this.prisma.delegatedAdministration.upsert({ where: { unitId_principalId: { unitId, principalId: input.principalId } }, create: { unitId, principalId: input.principalId, capabilities, active: true }, update: { capabilities, active: true } });
  }

  async revoke(unitId: string, principalId: string, headers?: Record<string, string | undefined>) {
    if (!isCgti(headers)) throw new ForbiddenException("Somente o CGTI pode revogar a administração de uma unidade.");
    await this.prisma.delegatedAdministration.update({ where: { unitId_principalId: { unitId, principalId } }, data: { active: false } });
    return { revoked: true };
  }
}
