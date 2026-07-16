import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Perspective, Prisma, VersionStatus, Visibility } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { diffBpmn, extractBpmnOutline, validateBpmnXml } from "@furg/processos-bpmn";
import { createProcessInputSchema, updateProcessInputSchema, type CreateProcessInput, type ProcessBundleMetadata, type ProcessSummary, type UpdateProcessInput } from "@furg/processos-contracts";
import { PrismaService } from "./prisma.service.js";
import { WorkflowService, type WorkflowAction } from "./workflow.service.js";

const includeProcess = {
  ownerUnit: true,
  participantUnits: { include: { unit: true } },
  versions: { orderBy: { revision: "desc" } },
  outgoingRelations: true,
  incomingRelations: true,
} satisfies Prisma.ProcessInclude;

type ProcessRecord = Prisma.ProcessGetPayload<{ include: typeof includeProcess }>;

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
  ) {}

  async list(filters: { q?: string; visibility?: Visibility; status?: VersionStatus }) {
    const rows = await this.prisma.process.findMany({
      where: {
        archivedAt: null,
        visibility: filters.visibility,
        OR: filters.q ? [
          { title: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
          { category: { contains: filters.q, mode: "insensitive" } },
        ] : undefined,
        versions: filters.status ? { some: { status: filters.status } } : undefined,
      },
      include: includeProcess,
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    });
    return rows.map((row) => this.toSummary(row));
  }

  async detail(locator: string) {
    const row = await this.prisma.process.findFirst({
      where: { OR: [{ id: locator }, { slug: locator }], archivedAt: null },
      include: includeProcess,
    });
    if (!row) throw new NotFoundException("Processo não encontrado.");
    const selected = row.versions.find((version) => version.status === "PUBLISHED" && version.perspective === "AS_IS") ?? row.versions[0];
    if (!selected) throw new NotFoundException("O processo ainda não possui uma versão.");
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
    return {
      ...this.toSummary(row),
      bpmnXml: selected.bpmnXml,
      processSla: selected.processSla,
      continuous: row.continuous,
      versions: row.versions.map(this.versionSummary),
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
    };
  }

  async create(input: CreateProcessInput, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const parsed = createProcessInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: "Revise os dados do novo processo.", fields: parsed.error.flatten().fieldErrors });
    }
    const data = parsed.data;
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
    return this.detail(processId);
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
    const lease = await this.prisma.editLease.findFirst({ where: { processVersionId: versionId, token: leaseToken, holderId: actor.id, expiresAt: { gt: new Date() } } });
    if (!lease) {
      this.logger.warn(`BPMN_SAVE_REJECTED processId=${processId} versionId=${versionId} actorId=${actor.id} reason=invalid_lease`);
      throw new ConflictException("A edição não possui um bloqueio válido.");
    }
    const issues = validateBpmnXml(bpmnXml, version.process.continuous);
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
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: true } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
    const next = this.workflow.transition(version.status, action);
    if (["UNIT_REVIEW", "CURATOR_REVIEW", "PUBLISHED"].includes(next)) {
      const validation = await this.validate(processId, versionId);
      if (!validation.valid) throw new BadRequestException({ message: "Corrija o modelo antes de avançar a revisão.", issues: validation.issues });
    }
    return this.prisma.$transaction(async (tx) => {
      if (next === "PUBLISHED" && version.perspective === "AS_IS") {
        await tx.processVersion.updateMany({
          where: { processId, perspective: "AS_IS", status: "PUBLISHED", id: { not: versionId } },
          data: { status: "SUPERSEDED" },
        });
      }
      return tx.processVersion.update({
        where: { id: versionId },
        data: {
          status: next,
          reviewNote: note,
          submittedAt: action === "SUBMIT_UNIT" ? new Date() : undefined,
          unitApprovedAt: action === "APPROVE_UNIT" ? new Date() : undefined,
          curatorApprovedAt: action === "APPROVE_CURATOR" ? new Date() : undefined,
          publishedAt: next === "PUBLISHED" ? new Date() : undefined,
          audits: { create: { actorId: actor.id, actorName: actor.name, action, details: note ? { note } : {} } },
        },
      });
    });
  }

  async deleteDraftVersion(processId: string, versionId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
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
    return { deletedVersionId: result.deletedVersionId, deletedProcess: false as const, process: await this.detail(processId) };
  }

  async acquireLease(processId: string, versionId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    await this.getEditableVersion(processId, versionId);
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
    const detail = await this.detail(processId);
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
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
        : await this.prisma.organizationUnit.findFirst({ where: { active: true }, orderBy: { name: "asc" } });
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

    const zip = await JSZip.loadAsync(buffer);
    const [manifestText, metadataText, bpmnXml] = await Promise.all([
      zip.file("manifest.json")?.async("string"),
      zip.file("metadata.json")?.async("string"),
      zip.file("process.bpmn")?.async("string"),
    ]);
    if (!manifestText || !metadataText || !bpmnXml) throw new BadRequestException("O pacote não contém manifest.json, metadata.json e process.bpmn.");
    const manifest = JSON.parse(manifestText) as { format?: string; version?: string };
    const metadata = JSON.parse(metadataText) as ProcessBundleMetadata;
    if (manifest.format !== "furg.process-bundle" || manifest.version !== "1.0" || metadata.schemaVersion !== "furg.process/v1") {
      throw new BadRequestException("Formato de ProcessBundle não suportado.");
    }
    const issues = validateBpmnXml(bpmnXml);
    if (issues.some((issue) => issue.severity === "error")) throw new BadRequestException({ message: "O BPMN do pacote contém erros.", issues });

    let ownerUnit = await this.prisma.organizationUnit.findFirst({ where: { acronym: metadata.process.ownerUnit.acronym } });
    ownerUnit ??= await this.prisma.organizationUnit.create({
      data: {
        externalId: `IMPORT-${metadata.process.ownerUnit.acronym}`,
        acronym: metadata.process.ownerUnit.acronym,
        name: metadata.process.ownerUnit.name,
      },
    });
    const existing = await this.prisma.process.findFirst({ where: { OR: [{ id: metadata.process.id }, { slug: metadata.process.slug }] }, include: { versions: true } });
    const process = existing ?? await this.prisma.process.create({
      data: {
        id: metadata.process.id,
        slug: metadata.process.slug,
        title: metadata.process.title,
        description: metadata.process.description,
        category: metadata.process.category,
        audience: metadata.process.audience,
        visibility: metadata.process.visibility,
        ownerUnitId: ownerUnit.id,
        participantUnits: { create: { unitId: ownerUnit.id, role: "Dona do processo" } },
      },
      include: { versions: true },
    });
    const revision = Math.max(0, ...process.versions.map((version) => version.revision)) + 1;
    const version = await this.prisma.processVersion.create({
      data: {
        processId: process.id,
        revision,
        perspective: metadata.version.perspective,
        status: "DRAFT",
        bpmnXml,
        metadata: { importedFrom: manifest, originalVersionId: metadata.version.id },
        contentHash: hash(bpmnXml),
        createdBy: actor.id,
        audits: { create: { actorId: actor.id, actorName: actor.name, action: "PROCESS_BUNDLE_IMPORTED" } },
      },
    });
    const importWarnings = issues.filter((issue) => issue.severity === "warning");
    const schemaIdMap = new Map<string, string>();
    for (const importedSchema of metadata.informationSchemas) {
      const baseSlug = slugify(importedSchema.name);
      let asset = await this.prisma.informationAsset.findFirst({
        where: { OR: [{ id: importedSchema.assetId }, { slug: baseSlug }] },
      });
      asset ??= await this.prisma.informationAsset.create({
        data: {
          id: importedSchema.assetId,
          name: importedSchema.name,
          slug: baseSlug,
          description: `Ativo importado com o pacote ${metadata.process.slug}.`,
          kind: "JSON_SCHEMA",
          ownerUnitId: ownerUnit.id,
        },
      });
      let schema = await this.prisma.informationSchemaVersion.findFirst({
        where: { OR: [{ id: importedSchema.id }, { assetId: asset.id, version: importedSchema.version }] },
      });
      schema ??= await this.prisma.informationSchemaVersion.create({
        data: {
          id: importedSchema.id,
          assetId: asset.id,
          version: importedSchema.version,
          visibility: importedSchema.visibility,
          jsonSchema: importedSchema.jsonSchema as Prisma.InputJsonValue,
          contentHash: hash(JSON.stringify(importedSchema.jsonSchema)),
          createdBy: actor.id,
        },
      });
      schemaIdMap.set(importedSchema.id, schema.id);
    }
    for (const element of metadata.elements) {
      if (element.role || element.organizationUnitId || element.workDuration || element.waitDuration) {
        await this.prisma.elementBinding.create({
          data: {
            processVersionId: version.id,
            bpmnElementId: element.bpmnElementId,
            organizationUnitId: element.organizationUnitId,
            role: element.role,
            workDuration: element.workDuration,
            waitDuration: element.waitDuration,
          },
        });
      }
      for (const binding of element.softwareBindings) {
        const operation = await this.prisma.softwareOperation.findUnique({ where: { id: binding.operationId } });
        if (!operation) {
          importWarnings.push({
            severity: "warning",
            code: "UNRESOLVED_SOFTWARE_OPERATION",
            elementId: element.bpmnElementId,
            message: `A operaÃ§Ã£o ${binding.operationId} nÃ£o existe neste catÃ¡logo e nÃ£o foi vinculada.`,
          });
          continue;
        }
        await this.prisma.elementBinding.create({
          data: {
            processVersionId: version.id,
            bpmnElementId: element.bpmnElementId,
            operationId: operation.id,
            kind: binding.kind,
          },
        });
      }
      for (const binding of element.dataBindings) {
        const informationSchemaId = schemaIdMap.get(binding.informationSchemaId)
          ?? (await this.prisma.informationSchemaVersion.findUnique({ where: { id: binding.informationSchemaId } }))?.id;
        if (!informationSchemaId) {
          importWarnings.push({
            severity: "warning",
            code: "UNRESOLVED_INFORMATION_SCHEMA",
            elementId: element.bpmnElementId,
            message: `O schema ${binding.informationSchemaId} nÃ£o existe neste catÃ¡logo e nÃ£o foi vinculado.`,
          });
          continue;
        }
        await this.prisma.dataBinding.create({
          data: {
            processVersionId: version.id,
            bpmnElementId: element.bpmnElementId,
            informationSchemaId,
            direction: binding.direction,
          },
        });
      }
    }
    for (const relation of metadata.relations) {
      const sourceProcessId = relation.sourceProcessId === metadata.process.id ? process.id : relation.sourceProcessId;
      const targetProcessId = relation.targetProcessId === metadata.process.id ? process.id : relation.targetProcessId;
      const related = await this.prisma.process.count({ where: { id: { in: [sourceProcessId, targetProcessId] } } });
      if (related < (sourceProcessId === targetProcessId ? 1 : 2)) {
        importWarnings.push({
          severity: "warning",
          code: "UNRESOLVED_PROCESS_RELATION",
          message: `A relaÃ§Ã£o ${relation.id} depende de outro processo ainda nÃ£o importado.`,
        });
        continue;
      }
      await this.prisma.processRelation.upsert({
        where: { sourceProcessId_targetProcessId_type: { sourceProcessId, targetProcessId, type: relation.type } },
        create: { sourceProcessId, targetProcessId, type: relation.type, label: relation.label },
        update: { label: relation.label },
      });
    }
    return { kind: "process-bundle", processId: process.id, versionId: version.id, revision, warnings: importWarnings };
  }

  private async getEditableVersion(processId: string, versionId: string) {
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: true } });
    if (!version) throw new NotFoundException("Versão não encontrada.");
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(version.status)) throw new ConflictException("Somente rascunhos ou versões devolvidas podem ser editados.");
    return version;
  }

  private toSummary(row: ProcessRecord): ProcessSummary {
    const current = row.versions.find((version) => version.status === "PUBLISHED" && version.perspective === "AS_IS") ?? row.versions[0] ?? null;
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
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private versionSummary(version: { id: string; revision: number; perspective: Perspective; status: VersionStatus; createdAt: Date; publishedAt: Date | null }) {
    return {
      id: version.id,
      revision: version.revision,
      perspective: version.perspective,
      status: version.status,
      createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
    };
  }
}
