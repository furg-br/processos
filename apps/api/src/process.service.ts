import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import type { Perspective, Prisma, RelationType, VersionStatus, Visibility } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { diffBpmn, extractBpmnOutline, validateBpmnXml } from "@furg/processos-bpmn";
import { buildProcessBundleV2, migrateProcessBundleV1ToV2, validateProcessBundleV2 } from "@furg/processos-bundle";
import { createProcessInputSchema, updateProcessInputSchema, type CreateProcessInput, type ProcessBundleMetadata, type ProcessSummary, type UpdateProcessInput } from "@furg/processos-contracts";
import { PrismaService } from "./prisma.service.js";
import { WorkflowService, type WorkflowAction } from "./workflow.service.js";
import { AuthorizationService } from "./authorization.service.js";
import { ProcessBundleV2Service } from "./process-bundle-v2.service.js";

const includeProcess = {
  ownerUnit: true,
  participantUnits: { include: { unit: true } },
  versions: { orderBy: { revision: "desc" }, include: { activeBindingSet: { include: { resources: true } } } },
  outgoingRelations: { include: { target: { select: { id: true, title: true, slug: true } } } },
  incomingRelations: { include: { source: { select: { id: true, title: true, slug: true } } } },
} satisfies Prisma.ProcessInclude;

type ProcessRecord = Prisma.ProcessGetPayload<{ include: typeof includeProcess }>;
type ProcessVersionRecord = ProcessRecord["versions"][number];

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ativo-importado";
}

function identity(headers?: Record<string, string | undefined>) {
  return {
    id: headers?.["x-user-id"] ?? "00000000-0000-4000-8000-000000000001",
    name: headers?.["x-user-name"] ?? "Curadoria de demonstração",
  };
}

@Injectable()
export class ProcessService {
  private readonly logger = new Logger(ProcessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly authorization: AuthorizationService = new AuthorizationService(prisma),
    @Optional() private readonly processBundles?: ProcessBundleV2Service,
  ) {}

  async list(filters: { q?: string; visibility?: Visibility; status?: VersionStatus }, headers?: Record<string, string | undefined>) {
    const rows = await this.prisma.process.findMany({
      where: {
        archivedAt: null,
        visibility: filters.visibility,
        OR: filters.q ? [
          { title: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
          { category: { contains: filters.q, mode: "insensitive" } },
        ] : undefined,
      },
      include: includeProcess,
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    });
    const summaries = await Promise.all(rows.map(async (row) => {
      try {
        await this.assertProcessVisibility(row, headers);
        const current = await this.selectVersionForViewer(row, headers);
        return current ? this.toSummary(row, current) : undefined;
      } catch (error) {
        if (error instanceof ForbiddenException) return undefined;
        throw error;
      }
    }));
    return summaries.filter((summary): summary is ProcessSummary => Boolean(summary && (!filters.status || summary.currentVersion?.status === filters.status)));
  }

  async detail(locator: string, headers?: Record<string, string | undefined>) {
    const row = await this.prisma.process.findFirst({
      where: { OR: [{ id: locator }, { slug: locator }], archivedAt: null },
      include: includeProcess,
    });
    if (!row) throw new NotFoundException("Processo não encontrado.");
    await this.assertProcessVisibility(row, headers);
    // The workspace exposes the newest revision the current actor may inspect;
    // an older published release remains the safe fallback for other actors.
    const selected = await this.selectVersionForViewer(row, headers);
    if (!selected) throw new ForbiddenException("Não há uma versão deste processo disponível para o usuário atual.");
    const visibleVersions = (await Promise.all(row.versions.map(async (version) => await this.canViewVersion(row.ownerUnitId, version, headers) ? version : undefined))).filter((version): version is ProcessVersionRecord => Boolean(version));
    const [elementBindings, dataBindings, schemas] = await Promise.all([
      this.prisma.elementBinding.findMany({ where: { processVersionId: selected.id } }),
      this.prisma.dataBinding.findMany({ where: { processVersionId: selected.id } }),
      this.prisma.informationSchemaVersion.findMany({
        where: { bindings: { some: { processVersionId: selected.id } } },
        include: { asset: true },
      }),
    ]);
    const relations = [...row.outgoingRelations, ...row.incomingRelations];
    const elementIds = new Set([...elementBindings.map((item) => item.bpmnElementId), ...dataBindings.map((item) => item.bpmnElementId).filter(Boolean) as string[]]);
    const availableTransitions: WorkflowAction[] = [];
    for (const action of this.workflow.actions(selected.status)) {
      try {
        await this.assertWorkflowPermission(row.ownerUnitId, selected.status, action, headers);
        availableTransitions.push(action);
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
        // A interface recebe apenas capacidades autorizadas pelo backend.
      }
    }
    return {
      ...this.toSummary(row, selected),
      bpmnXml: selected.bpmnXml,
      processSla: selected.processSla,
      continuous: row.continuous,
      versions: visibleVersions.map(this.versionSummary),
      relations,
      outline: extractBpmnOutline(selected.bpmnXml),
      elementMetadata: [...elementIds].map((bpmnElementId) => ({
        bpmnElementId,
        role: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.role,
        organizationUnitId: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.organizationUnitId,
        workDuration: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.workDuration,
        waitDuration: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.waitDuration,
        softwareBindings: elementBindings.filter((item) => item.bpmnElementId === bpmnElementId && item.operationId && item.kind)
          .map((item) => ({ operationId: item.operationId!, kind: item.kind! })),
        dataBindings: dataBindings.filter((item) => item.bpmnElementId === bpmnElementId)
          .map((item) => ({ informationSchemaId: item.informationSchemaId, direction: item.direction })),
      })),
      informationSchemas: schemas,
      availableTransitions,
    };
  }

  async listRelations(headers?: Record<string, string | undefined>) {
    const relations = await this.prisma.processRelation.findMany({
      where: { source: { archivedAt: null }, target: { archivedAt: null } },
      include: { source: { select: { id: true, slug: true, title: true, visibility: true, ownerUnitId: true } }, target: { select: { id: true, slug: true, title: true, visibility: true, ownerUnitId: true } } },
      orderBy: { createdAt: "asc" },
    });
    const visible = [];
    for (const relation of relations) {
      try {
        await this.assertProcessVisibility(relation.source, headers);
        await this.assertProcessVisibility(relation.target, headers);
        visible.push({ ...relation, source: { id: relation.source.id, slug: relation.source.slug, title: relation.source.title }, target: { id: relation.target.id, slug: relation.target.slug, title: relation.target.title } });
      } catch (error) { if (!(error instanceof ForbiddenException)) throw error; }
    }
    return visible;
  }

  async create(input: CreateProcessInput, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const parsed = createProcessInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Revise os dados do novo processo.", fields: parsed.error.flatten().fieldErrors });
    }
    const data = parsed.data;
    await this.authorization.assertUnitCapability(data.ownerUnitId, "PROCESS_CREATE", headers);
    const ownerUnit = await this.prisma.organizationUnit.findFirst({ where: { id: data.ownerUnitId, active: true } });
    if (!ownerUnit) throw new BadRequestException("A unidade responsável não está ativa ou não existe.");
    const issues = validateBpmnXml(data.bpmnXml);
    if (issues.some((issue) => issue.severity === "error")) throw new BadRequestException({ message: "O BPMN contém erros.", issues });
    const slug = await this.nextAvailableSlug(data.slug ?? data.title);
    return this.prisma.process.create({
      data: {
        slug,
        title: data.title,
        description: data.description,
        category: data.category,
        audience: data.audience,
        visibility: data.visibility,
        ownerUnitId: data.ownerUnitId,
        participantUnits: { create: { unitId: data.ownerUnitId, role: "Dona do processo" } },
        versions: {
          create: {
            revision: 1,
            perspective: data.perspective,
            bpmnXml: data.bpmnXml,
            contentHash: hash(data.bpmnXml),
            createdBy: actor.id,
            audits: { create: { actorId: actor.id, actorName: actor.name, action: "PROCESS_CREATED" } },
          },
        },
      },
      include: includeProcess,
    });
  }

  async updateMetadata(processId: string, versionId: string, input: UpdateProcessInput, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const parsed = updateProcessInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Revise os dados do processo.", fields: parsed.error.flatten().fieldErrors });
    }
    const data = parsed.data;
    const version = await this.getEditableVersion(processId, versionId);
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    if (version.contractVersion === "v2" && this.processBundles) {
      await this.processBundles.updateProcessMetadataFromUi(processId, versionId, data, headers);
      return this.detail(processId, headers);
    }
    if (version.process.ownerUnitId !== data.ownerUnitId) this.authorization.assertAnyRole(["CGTI_ADMIN", "PLATFORM_ADMIN"], headers);
    const ownerUnit = await this.prisma.organizationUnit.findFirst({ where: { id: data.ownerUnitId, active: true } });
    if (!ownerUnit) throw new BadRequestException("A unidade responsável não está ativa ou não existe.");

    const changedFields = [
      version.process.title !== data.title ? "title" : null,
      version.process.description !== data.description ? "description" : null,
      version.process.category !== data.category ? "category" : null,
      version.process.audience !== data.audience ? "audience" : null,
      version.process.visibility !== data.visibility ? "visibility" : null,
      version.process.ownerUnitId !== data.ownerUnitId ? "ownerUnitId" : null,
      version.perspective !== data.perspective ? "perspective" : null,
    ].filter((field): field is string => Boolean(field));

    await this.prisma.$transaction(async (tx) => {
      await tx.process.update({
        where: { id: processId },
        data: {
          title: data.title,
          description: data.description,
          category: data.category,
          audience: data.audience,
          visibility: data.visibility,
          ownerUnitId: data.ownerUnitId,
        },
      });
      if (version.process.ownerUnitId !== data.ownerUnitId) {
        await tx.processUnit.deleteMany({ where: { processId, role: "Dona do processo" } });
        await tx.processUnit.create({ data: { processId, unitId: data.ownerUnitId, role: "Dona do processo" } });
      }
      await tx.processVersion.update({
        where: { id: versionId },
        data: {
          perspective: data.perspective,
          audits: { create: { actorId: actor.id, actorName: actor.name, action: "PROCESS_METADATA_UPDATED", details: { changedFields } } },
        },
      });
    });
    return this.detail(processId, headers);
  }

  async createRelation(processId: string, versionId: string, input: { targetProcessId: string; type: RelationType; label?: string; sourceElementId?: string }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.getEditableVersion(processId, versionId);
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    if (input.targetProcessId === processId) throw new BadRequestException("Um processo não pode se relacionar consigo mesmo.");
    const target = await this.prisma.process.findFirst({ where: { id: input.targetProcessId, archivedAt: null }, select: { id: true, title: true } });
    if (!target) throw new BadRequestException("Selecione um processo relacionado válido.");
    const type = input.type;
    if (!["DECOMPOSES", "CALLS", "PRECEDES", "EXCHANGES_INFORMATION", "RELATED_TO"].includes(type)) throw new BadRequestException("Tipo de relação inválido.");
    const label = input.label?.trim() || undefined;
    const sourceElementId = input.sourceElementId?.trim() || undefined;
    this.assertRelationSourceElement(version.bpmnXml, sourceElementId);
    await this.assertAcyclicProcessRelation(processId, target.id, type);
    try {
      await this.prisma.$transaction(async (tx) => {
        const relation = await tx.processRelation.create({ data: { sourceProcessId: processId, targetProcessId: target.id, type, label, sourceElementId } });
        await tx.auditEvent.create({ data: { processVersionId: versionId, actorId: actor.id, actorName: actor.name, action: "PROCESS_RELATION_CREATED", details: { relationId: relation.id, targetProcessId: target.id, targetTitle: target.title, type, label, sourceElementId } } });
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") throw new ConflictException("Esta relação já está registrada.");
      throw error;
    }
    return this.detail(processId, headers);
  }

  async updateRelation(processId: string, versionId: string, relationId: string, input: { type: RelationType; label?: string; sourceElementId?: string }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.getEditableVersion(processId, versionId);
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    const relation = await this.prisma.processRelation.findFirst({ where: { id: relationId, sourceProcessId: processId } });
    if (!relation) throw new NotFoundException("Relação editável não encontrada. Relações recebidas devem ser alteradas no processo de origem.");
    const type = input.type;
    if (!["DECOMPOSES", "CALLS", "PRECEDES", "EXCHANGES_INFORMATION", "RELATED_TO"].includes(type)) throw new BadRequestException("Tipo de relação inválido.");
    const sourceElementId = input.sourceElementId?.trim() || undefined;
    this.assertRelationSourceElement(version.bpmnXml, sourceElementId);
    await this.assertAcyclicProcessRelation(processId, relation.targetProcessId, type, relationId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processRelation.update({ where: { id: relationId }, data: { type, label: input.label?.trim() || null, sourceElementId: sourceElementId || null } });
        await tx.auditEvent.create({ data: { processVersionId: versionId, actorId: actor.id, actorName: actor.name, action: "PROCESS_RELATION_UPDATED", details: { relationId, type, label: input.label?.trim() || null, sourceElementId: sourceElementId || null } } });
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") throw new ConflictException("Esta relação já está registrada.");
      throw error;
    }
    return this.detail(processId, headers);
  }

  async deleteRelation(processId: string, versionId: string, relationId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.getEditableVersion(processId, versionId);
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    const relation = await this.prisma.processRelation.findFirst({ where: { id: relationId, sourceProcessId: processId } });
    if (!relation) throw new NotFoundException("Relação editável não encontrada. Relações recebidas devem ser alteradas no processo de origem.");
    await this.prisma.$transaction(async (tx) => {
      await tx.processRelation.delete({ where: { id: relationId } });
      await tx.auditEvent.create({ data: { processVersionId: versionId, actorId: actor.id, actorName: actor.name, action: "PROCESS_RELATION_DELETED", details: { relationId, targetProcessId: relation.targetProcessId, type: relation.type } } });
    });
    return this.detail(processId, headers);
  }

  private async nextAvailableSlug(value: string) {
    const base = slugify(value);
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.process.findUnique({ where: { slug: candidate }, select: { id: true } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  async updateBpmn(processId: string, versionId: string, bpmnXml: string, leaseToken: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.getEditableVersion(processId, versionId);
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    const lease = await this.prisma.editLease.findFirst({ where: { processVersionId: versionId, token: leaseToken, holderId: actor.id, expiresAt: { gt: new Date() } } });
    if (!lease) {
      this.logger.warn(`BPMN_SAVE_REJECTED processId=${processId} versionId=${versionId} actorId=${actor.id} reason=invalid_lease`);
      throw new ConflictException("A edição não possui um bloqueio válido.");
    }
    const issues = validateBpmnXml(bpmnXml, version.process.continuous);
    if (version.contractVersion === "v2" && this.processBundles) {
      const result = await this.processBundles.updateBpmnFromUi(processId, versionId, bpmnXml, issues, headers);
      this.logger.log(`BPMN_SAVED processId=${processId} versionId=${versionId} actorId=${actor.id} contentHash=${result.contentHash} xmlChars=${bpmnXml.length}`);
      return result;
    }
    const contentHash = hash(bpmnXml);
    const updated = await this.prisma.processVersion.update({
      where: { id: versionId },
      data: { bpmnXml, contentHash, audits: { create: { actorId: actor.id, actorName: actor.name, action: "BPMN_SAVED", details: { issueCount: issues.length, contentHash, xmlChars: bpmnXml.length } } } },
    });
    const savedAt = new Date().toISOString();
    this.logger.log(`BPMN_SAVED processId=${processId} versionId=${versionId} actorId=${actor.id} contentHash=${updated.contentHash} xmlChars=${bpmnXml.length}`);
    return { savedAt, contentHash: updated.contentHash, issues };
  }

  async validate(processId: string, versionId: string) {
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: true } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
    const issues = validateBpmnXml(version.bpmnXml, version.process.continuous);
    return { valid: !issues.some((issue) => issue.severity === "error"), issues };
  }

  async transition(processId: string, versionId: string, action: WorkflowAction, note: string | undefined, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: true, activeBindingSet: { include: { resources: true, files: true, approvals: true } } } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
    const normalizedNote = note?.trim() || undefined;
    if (["REQUEST_CHANGES", "ARCHIVE"].includes(action) && !normalizedNote) throw new BadRequestException("Informe uma justificativa para solicitar ajustes ou arquivar a versão.");
    if (normalizedNote && normalizedNote.length > 1000) throw new BadRequestException("O parecer ou justificativa deve ter no máximo 1.000 caracteres.");
    await this.assertWorkflowPermission(version.process.ownerUnitId, version.status, action, headers);
    const next = this.workflow.transition(version.status, action);
      if (["UNIT_REVIEW", "CURATOR_REVIEW", "PUBLISHED"].includes(next)) {
        const validation = await this.validate(processId, versionId);
        if (!validation.valid) throw new BadRequestException({ message: "Corrija o modelo antes de avançar a revisão.", issues: validation.issues });
        if (version.contractVersion === "v2" && (!version.activeBindingSet || version.activeBindingSet.status !== "APPROVED" || version.activeBindingSet.approvals.some((binding) => binding.status !== "APPROVED"))) {
          throw new ConflictException("Os vínculos técnicos precisam de aprovação do CGTI antes da revisão ou publicação.");
        }
        if (version.contractVersion === "v2" && version.activeBindingSet) {
          const definitionResource = version.activeBindingSet.resources.find((resource) => resource.kind === "ProcessDefinition");
          const definition = definitionResource?.content as {
            metadata?: { key?: string; createdAt?: string };
            spec?: { processVersionId?: string; bindingSetVersionId?: string; releaseId?: string };
          } | undefined;
          if (!definition?.metadata?.key || !definition.spec?.processVersionId || !definition.spec.bindingSetVersionId || !definition.spec.releaseId) {
            throw new ConflictException("A versão v2 não contém identidade completa de processo, vínculos e release.");
          }
          const resourcesByPath = new Map(version.activeBindingSet.resources.map((resource) => [
            resource.path,
            Buffer.from(`${JSON.stringify(resource.content, null, 2)}\n`, "utf8"),
          ]));
          const bundle = await buildProcessBundleV2({
            profile: version.conformanceProfile as "DOCUMENTARY" | "ANALYZABLE" | "IMPLEMENTABLE" | "EXECUTABLE",
            processDefinitionKey: definition.metadata.key,
            processVersionId: definition.spec.processVersionId,
            bindingSetVersionId: definition.spec.bindingSetVersionId,
            releaseId: definition.spec.releaseId,
            createdAt: definition.metadata.createdAt ?? new Date().toISOString(),
            createdBy: actor.name,
            files: version.activeBindingSet.files.map((file) => ({
              path: file.path,
              mediaType: file.mediaType,
              visibility: file.visibility as "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED",
              content: resourcesByPath.get(file.path) ?? Buffer.from(file.content),
            })),
          });
          const bundleValidation = await validateProcessBundleV2(bundle);
          if (!bundleValidation.valid) {
            throw new BadRequestException({ message: "O ProcessBundle v2 completo não está apto para revisão ou publicação.", issues: bundleValidation.issues });
          }
        }
      }
    return this.prisma.$transaction(async (tx) => {
      if (next === "PUBLISHED" && version.perspective === "AS_IS") {
        await tx.processVersion.updateMany({
          where: { processId, perspective: "AS_IS", status: "PUBLISHED", id: { not: versionId } },
          data: { status: "SUPERSEDED" },
        });
      }
      const publishedAt = next === "PUBLISHED" ? new Date() : undefined;
      const updated = await tx.processVersion.update({
        where: { id: versionId },
        data: {
          status: next,
          reviewNote: normalizedNote,
          submittedAt: action === "SUBMIT_UNIT" ? new Date() : undefined,
          unitApprovedAt: action === "APPROVE_UNIT" ? new Date() : undefined,
          curatorApprovedAt: action === "APPROVE_CURATOR" ? new Date() : undefined,
          publishedAt,
          immutableAt: next === "PUBLISHED" && version.contractVersion === "v2" ? publishedAt : undefined,
          audits: { create: { actorId: actor.id, actorName: actor.name, action, details: normalizedNote ? { note: normalizedNote } : {} } },
        },
      });
      if (next === "PUBLISHED" && version.contractVersion === "v2") {
        const bindingSet = version.activeBindingSet;
        const definition = bindingSet?.resources.find((resource) => resource.kind === "ProcessDefinition")?.content as { spec?: { releaseId?: string; bindingSetVersionId?: string } } | undefined;
        const releaseId = definition?.spec?.releaseId;
        if (!releaseId || !bindingSet || !version.bundleHash) throw new ConflictException("A versão v2 não contém identidade completa de release.");
        await tx.processRelease.create({ data: {
          id: releaseId, processVersionId: version.id, bindingSetVersionId: bindingSet.id, bundleHash: bindingSet.contentHash,
          publishedAt, immutableSnapshot: {
            contractVersion: "v2", processVersionId: version.id, bpmnXml: version.bpmnXml, contentHash: version.contentHash,
            bindingSetVersionId: bindingSet.id,
            resources: bindingSet.resources.map((resource) => ({ path: resource.path, hash: resource.contentHash, content: resource.content })),
            files: bindingSet.files.map((file) => ({ path: file.path, mediaType: file.mediaType, visibility: file.visibility, hash: file.contentHash })),
          },
        } });
      }
      return updated;
    });
  }

  async deleteDraftVersion(processId: string, versionId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    if ((process.env.AUTH_MODE ?? "development") !== "development") {
      const authorizationTarget = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, select: { process: { select: { ownerUnitId: true } } } });
      if (!authorizationTarget) throw new NotFoundException("Versão não encontrada.");
      await this.authorization.assertUnitCapability(authorizationTarget.process.ownerUnitId, "PROCESS_EDIT", headers);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const version = await tx.processVersion.findFirst({
        where: { id: versionId, processId },
        select: { id: true, revision: true, status: true },
      });
      if (!version) throw new NotFoundException("Versão não encontrada.");
      if (version.status !== "DRAFT") throw new ConflictException("Somente versões em rascunho podem ser removidas.");

      const activeLease = await tx.editLease.findFirst({
        where: { processVersionId: versionId, expiresAt: { gt: new Date() } },
        select: { holderName: true },
      });
      if (activeLease) throw new ConflictException(`Encerre a edição de ${activeLease.holderName} antes de remover este rascunho.`);

      const versionCount = await tx.processVersion.count({ where: { processId } });
      if (versionCount === 1) {
        await tx.process.delete({ where: { id: processId } });
        return { deletedVersionId: versionId, deletedProcess: true as const, revision: version.revision };
      }

      const auditTarget = await tx.processVersion.findFirst({
        where: { processId, id: { not: versionId } },
        orderBy: { revision: "desc" },
        select: { id: true },
      });
      await tx.processVersion.delete({ where: { id: versionId } });
      if (auditTarget) {
        await tx.auditEvent.create({
          data: {
            processVersionId: auditTarget.id,
            actorId: actor.id,
            actorName: actor.name,
            action: "DRAFT_VERSION_DELETED",
            details: { deletedVersionId: versionId, revision: version.revision },
          },
        });
      }
      return { deletedVersionId: versionId, deletedProcess: false as const, revision: version.revision };
    }, { isolationLevel: "Serializable" });

    this.logger.log(`DRAFT_VERSION_DELETED processId=${processId} versionId=${versionId} revision=${result.revision} actorId=${actor.id} processDeleted=${result.deletedProcess}`);
    if (result.deletedProcess) return { deletedVersionId: result.deletedVersionId, deletedProcess: true as const };
    return { deletedVersionId: result.deletedVersionId, deletedProcess: false as const, process: await this.detail(processId, headers) };
  }

  async acquireLease(processId: string, versionId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.getEditableVersion(processId, versionId);
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    const active = await this.prisma.editLease.findFirst({ where: { processVersionId: versionId, expiresAt: { gt: new Date() } } });
    if (active && active.holderId !== actor.id) throw new ConflictException(`Esta versão está sendo editada por ${active.holderName}.`);
    await this.prisma.editLease.deleteMany({ where: { processVersionId: versionId } });
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    return this.prisma.editLease.create({ data: { processVersionId: versionId, holderId: actor.id, holderName: actor.name, token: randomUUID(), expiresAt } });
  }

  async renewLease(token: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const lease = await this.prisma.editLease.findFirst({ where: { token, holderId: actor.id, expiresAt: { gt: new Date() } } });
    if (!lease) throw new ConflictException("O bloqueio expirou.");
    return this.prisma.editLease.update({ where: { id: lease.id }, data: { expiresAt: new Date(Date.now() + 5 * 60_000) } });
  }

  async releaseLease(token: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    await this.prisma.editLease.deleteMany({ where: { token, holderId: actor.id } });
    return { released: true };
  }

  async diff(processId: string, fromVersionId: string, toVersionId: string) {
    const versions = await this.prisma.processVersion.findMany({ where: { processId, id: { in: [fromVersionId, toVersionId] } } });
    const from = versions.find((item) => item.id === fromVersionId);
    const to = versions.find((item) => item.id === toVersionId);
    if (!from || !to) throw new NotFoundException("Uma das versões não foi encontrada.");
    return diffBpmn(from.bpmnXml, to.bpmnXml);
  }

  async exportBundle(processId: string, versionId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const detail = await this.detail(processId, headers);
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: true, activeBindingSet: { include: { resources: true, files: true } } } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
    await this.authorization.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EXPORT_TECHNICAL", headers);
    if (version.contractVersion === "v2") {
      const bindingSet = version.activeBindingSet;
      const definition = bindingSet?.resources.find((resource) => resource.kind === "ProcessDefinition")?.content as { metadata?: { key?: string }; spec?: { releaseId?: string } } | undefined;
      if (!definition?.metadata?.key || !definition.spec?.releaseId || !bindingSet || !version.conformanceProfile) throw new ConflictException("A versão v2 não contém os identificadores necessários para exportação.");
      if (bindingSet.bundleContent) return Buffer.from(bindingSet.bundleContent);
      return buildProcessBundleV2({
        profile: version.conformanceProfile as "DOCUMENTARY" | "ANALYZABLE" | "IMPLEMENTABLE" | "EXECUTABLE",
        processDefinitionKey: definition.metadata.key, processVersionId: version.id, bindingSetVersionId: bindingSet.id,
        releaseId: definition.spec.releaseId, createdAt: version.createdAt.toISOString(), createdBy: actor.name,
        files: bindingSet.files.map((file) => ({ path: file.path, mediaType: file.mediaType, visibility: file.visibility as "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED", content: Buffer.from(file.content) })),
      });
    }
    const [schemas, elementBindings, dataBindings] = await Promise.all([
      this.prisma.informationSchemaVersion.findMany({
        where: { bindings: { some: { processVersionId: versionId } } },
        include: { asset: true },
      }),
      this.prisma.elementBinding.findMany({ where: { processVersionId: versionId } }),
      this.prisma.dataBinding.findMany({ where: { processVersionId: versionId } }),
    ]);
    const elementIds = new Set([
      ...elementBindings.map((item) => item.bpmnElementId),
      ...dataBindings.map((item) => item.bpmnElementId).filter(Boolean) as string[],
    ]);
    const elements = [...elementIds].map((bpmnElementId) => ({
      bpmnElementId,
      role: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.role,
      organizationUnitId: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.organizationUnitId,
      workDuration: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.workDuration,
      waitDuration: elementBindings.find((item) => item.bpmnElementId === bpmnElementId)?.waitDuration,
      softwareBindings: elementBindings
        .filter((item) => item.bpmnElementId === bpmnElementId && item.operationId && item.kind)
        .map((item) => ({ operationId: item.operationId!, kind: item.kind! })),
      dataBindings: dataBindings
        .filter((item) => item.bpmnElementId === bpmnElementId)
        .map((item) => ({ informationSchemaId: item.informationSchemaId, direction: item.direction })),
    }));
    const exportedAt = new Date().toISOString();
    const metadata: ProcessBundleMetadata = {
      schemaVersion: "furg.process/v1",
      process: {
        id: detail.id,
        slug: detail.slug,
        title: detail.title,
        description: detail.description,
        category: detail.category,
        audience: detail.audience,
        visibility: detail.visibility,
        ownerUnit: detail.ownerUnit,
        participantUnits: detail.participantUnits,
        updatedAt: detail.updatedAt,
      },
      version: this.versionSummary(version),
      outline: extractBpmnOutline(version.bpmnXml),
      elements,
      relations: detail.relations,
      informationSchemas: schemas.map((schema) => ({
        id: schema.id,
        assetId: schema.assetId,
        name: schema.asset.name,
        version: schema.version,
        visibility: schema.visibility,
        jsonSchema: schema.jsonSchema as Record<string, unknown>,
        createdAt: schema.createdAt.toISOString(),
      })),
      provenance: { exportedBy: actor.name, exportedAt, source: "Catálogo Institucional de Processos da FURG" },
    };
    const zip = new JSZip();
    zip.file("process.bpmn", version.bpmnXml);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    for (const schema of schemas) zip.file(`schemas/${schema.asset.slug}.v${schema.version}.schema.json`, JSON.stringify(schema.jsonSchema, null, 2));
    const files = ["process.bpmn", "metadata.json", ...schemas.map((schema) => `schemas/${schema.asset.slug}.v${schema.version}.schema.json`)];
    zip.file("manifest.json", JSON.stringify({
      format: "furg.process-bundle",
      version: "1.0",
      processId,
      processVersionId: versionId,
      exportedAt,
      files,
      contentHash: hash(version.bpmnXml + JSON.stringify(metadata)),
    }, null, 2));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  async importFile(input: {
    fileName: string;
    contentBase64: string;
    title?: string;
    slug?: string;
    ownerUnitId?: string;
  }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const buffer = Buffer.from(input.contentBase64, "base64");
    if (input.fileName.toLowerCase().endsWith(".bpmn") || input.fileName.toLowerCase().endsWith(".xml")) {
      const bpmnXml = buffer.toString("utf8");
      const ownerUnit = input.ownerUnitId
        ? await this.prisma.organizationUnit.findUnique({ where: { id: input.ownerUnitId } })
        : null;
      if (!ownerUnit || !input.title || !input.slug) {
        throw new BadRequestException("BPMN puro exige title, slug e uma unidade proprietária disponível.");
      }
      const created = await this.create({
        title: input.title,
        slug: input.slug,
        description: "Processo importado de BPMN 2.0 XML.",
        category: "Importado",
        audience: "A definir",
        visibility: "INTERNAL",
        ownerUnitId: ownerUnit.id,
        bpmnXml,
      }, headers);
      return { kind: "bpmn", processId: created.id, warnings: [] };
    }

    if (!this.processBundles) throw new ConflictException("Serviço de importação governada indisponível.");
    let migrated;
    try { migrated = await migrateProcessBundleV1ToV2(buffer, actor.name); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "ProcessBundle v1 inválido."); }
    const dryRun = await this.processBundles.dryRun({ fileName: `${input.fileName.replace(/\.zip$/i, "")}.v2.zip`, contentBase64: migrated.bundle.toString("base64") }, headers);
    if (!dryRun.valid) throw new BadRequestException({ message: "A migração v1 → v2 produziu um pacote inválido.", issues: dryRun.issues });
    const applied = await this.processBundles.apply(dryRun.importId, { ownerUnitId: input.ownerUnitId }, headers);
    return { ...applied, kind: "process-bundle-v2", warnings: migrated.warnings.map((warning) => ({ severity: "warning", ...warning })) };
  }

  private async assertWorkflowPermission(ownerUnitId: string, status: VersionStatus, action: WorkflowAction, headers?: Record<string, string | undefined>) {
    if (action === "SUBMIT_UNIT") return this.authorization.assertUnitCapability(ownerUnitId, "PROCESS_EDIT", headers);
    if (action === "APPROVE_UNIT" || (action === "REQUEST_CHANGES" && status === "UNIT_REVIEW")) {
      this.authorization.assertAnyRole(["UNIT_APPROVER", "UNIT_ADMIN", "CGTI_ADMIN", "PLATFORM_ADMIN"], headers);
      return this.authorization.assertUnitCapability(ownerUnitId, "PROCESS_APPROVE", headers);
    }
    if (action === "APPROVE_CURATOR" || (action === "REQUEST_CHANGES" && status === "CURATOR_REVIEW") || action === "ARCHIVE") {
      this.authorization.assertAnyRole(["INSTITUTIONAL_CURATOR", "CGTI_ADMIN", "PLATFORM_ADMIN"], headers);
      return;
    }
    throw new ConflictException("A ação de workflow não possui política de autorização definida.");
  }

  private async getEditableVersion(processId: string, versionId: string) {
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: true } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
    if (version.immutableAt) throw new ConflictException("Releases publicadas são imutáveis; crie uma nova versão para alterar o processo.");
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(version.status)) throw new ConflictException("Somente rascunhos ou versões devolvidas podem ser editados.");
    return version;
  }

  private assertRelationSourceElement(bpmnXml: string, sourceElementId?: string) {
    if (!sourceElementId) return;
    if (!extractBpmnOutline(bpmnXml).some((element) => element.id === sourceElementId)) {
      throw new BadRequestException("O elemento BPMN de origem não existe na versão atual do processo.");
    }
  }

  private async assertAcyclicProcessRelation(sourceProcessId: string, targetProcessId: string, type: RelationType, ignoredRelationId?: string) {
    if (!["DECOMPOSES", "PRECEDES"].includes(type)) return;
    const relations = await this.prisma.processRelation.findMany({
      where: { type, ...(ignoredRelationId ? { id: { not: ignoredRelationId } } : {}) },
      select: { sourceProcessId: true, targetProcessId: true },
    });
    const outgoing = new Map<string, string[]>();
    for (const relation of relations) outgoing.set(relation.sourceProcessId, [...(outgoing.get(relation.sourceProcessId) ?? []), relation.targetProcessId]);
    const pending = [targetProcessId];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === sourceProcessId) throw new BadRequestException("A relação criaria um ciclo incompatível com o tipo selecionado.");
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(outgoing.get(current) ?? []));
    }
  }

  private async assertProcessVisibility(row: Pick<ProcessRecord, "visibility" | "ownerUnitId">, headers?: Record<string, string | undefined>) {
    if (row.visibility !== "RESTRICTED" || (process.env.AUTH_MODE ?? "development") === "development") return;
    this.authorization.assertAnyRole(["UNIT_ADMIN", "INSTITUTIONAL_CURATOR", "CGTI_ADMIN", "PLATFORM_ADMIN"], headers);
    await this.authorization.assertUnitCapability(row.ownerUnitId, "PROCESS_VIEW_RESTRICTED", headers);
  }

  private async canViewVersion(ownerUnitId: string, version: ProcessVersionRecord, headers?: Record<string, string | undefined>) {
    if (["PUBLISHED", "SUPERSEDED", "ARCHIVED"].includes(version.status)) return true;
    try {
      if (["DRAFT", "CHANGES_REQUESTED"].includes(version.status)) await this.assertWorkflowPermission(ownerUnitId, version.status, "SUBMIT_UNIT", headers);
      else if (version.status === "UNIT_REVIEW") await this.assertWorkflowPermission(ownerUnitId, version.status, "APPROVE_UNIT", headers);
      else if (version.status === "CURATOR_REVIEW") await this.assertWorkflowPermission(ownerUnitId, version.status, "APPROVE_CURATOR", headers);
      else return false;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  private async selectVersionForViewer(row: ProcessRecord, headers?: Record<string, string | undefined>) {
    const newest = row.versions[0];
    if (newest && await this.canViewVersion(row.ownerUnitId, newest, headers)) return newest;
    return row.versions.find((version) => version.status === "PUBLISHED" && version.perspective === "AS_IS")
      ?? row.versions.find((version) => version.status === "PUBLISHED");
  }

  private toSummary(row: ProcessRecord, current: ProcessVersionRecord | null = row.versions[0] ?? null): ProcessSummary {
    const resources = current?.activeBindingSet?.resources.map((resource) => resource.content as any) ?? [];
    const definition = resources.find((resource) => resource.kind === "ProcessDefinition");
    const software = resources.find((resource) => resource.kind === "SoftwareCatalog")?.spec;
    const context = resources.find((resource) => resource.kind === "InstitutionalContextCatalog")?.spec;
    const taxonomyRefs = new Set<string>(definition?.spec.taxonomyRefs ?? []);
    const unitRefs = new Set<string>([definition?.spec.ownerUnitRef, ...(definition?.spec.participantUnitRefs ?? [])].filter(Boolean));
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      audience: row.audience,
      visibility: row.visibility,
      ownerUnit: { id: row.ownerUnit.id, acronym: row.ownerUnit.acronym, name: row.ownerUnit.name },
      participantUnits: row.participantUnits.map(({ unit }) => ({ acronym: unit.acronym, name: unit.name })),
      currentVersion: current ? this.versionSummary(current) : null,
      facets: {
        systems: software?.systems.map((item: any) => ({ key: item.key, label: item.label })) ?? [],
        modules: software?.modules.map((item: any) => ({ key: item.key, label: item.label })) ?? [],
        units: context?.organizationUnits.filter((item: any) => unitRefs.has(item.key)).map((item: any) => ({ key: item.key, label: `${item.acronym} - ${item.label}` })) ?? [],
        affiliations: context?.affiliations.filter((item: any) => taxonomyRefs.has(item.key)).map((item: any) => ({ key: item.key, label: item.label })) ?? [],
        domains: context?.domains.filter((item: any) => taxonomyRefs.has(item.key)).map((item: any) => ({ key: item.key, label: item.label })) ?? [],
      },
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private versionSummary(version: { id: string; revision: number; perspective: Perspective; status: VersionStatus; createdAt: Date; publishedAt: Date | null; contractVersion?: string }) {
    return {
      id: version.id,
      revision: version.revision,
      perspective: version.perspective,
      status: version.status,
      createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
      contractVersion: version.contractVersion === "v2" ? "v2" as const : "v1" as const,
    };
  }
}
