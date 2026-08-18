import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { processBundleV2ResourceSchema, type ProcessBundleV2Resource } from "@furg/processos-contracts";
import { buildProcessBundleV2, createPublicProcessProjection, validateProcessBundleV2, type BundleValidationReport } from "@furg/processos-bundle";
import { PrismaService } from "./prisma.service.js";
import { AuthorizationService } from "./authorization.service.js";

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "processo-importado";
const identity = (headers?: Record<string, string | undefined>) => ({
  id: headers?.["x-user-id"] ?? "00000000-0000-4000-8000-000000000001",
  name: headers?.["x-user-name"] ?? "Curadoria de demonstração",
  platformRole: headers?.["x-platform-role"] ?? "UNIT_EDITOR",
  unitIds: (headers?.["x-unit-ids"] ?? "").split(",").map((value) => value.trim()).filter(Boolean),
});
const isCgti = (headers?: Record<string, string | undefined>) => (headers?.["x-platform-roles"] ?? identity(headers).platformRole).split(",").some((role) => ["CGTI_ADMIN", "PLATFORM_ADMIN"].includes(role.trim()));
const hasAnyRole = (headers: Record<string, string | undefined> | undefined, allowed: string[]) => (headers?.["x-platform-roles"] ?? identity(headers).platformRole).split(",").some((role) => allowed.includes(role.trim()));
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const projectionVisibility: Record<"INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED", Set<string>> = {
  INSTITUTIONAL: new Set(["PUBLIC", "INSTITUTIONAL"]),
  TECHNICAL: new Set(["PUBLIC", "INSTITUTIONAL", "TECHNICAL"]),
  RESTRICTED: new Set(["PUBLIC", "INSTITUTIONAL", "TECHNICAL", "RESTRICTED"]),
};

export function filterResourcesForAudience(resources: ProcessBundleV2Resource[], audience: "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED") {
  return resources.filter((resource) => projectionVisibility[audience].has(resource.metadata.visibility));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function processMeaningHash(resources: ProcessBundleV2Resource[]) {
  const stableResources = resources.map((resource) => {
    if (["SoftwareCatalog", "ProvenanceCatalog", "ProcessRelease"].includes(resource.kind)) return undefined;
    const copy = structuredClone(resource) as any;
    delete copy.metadata.id;
    delete copy.metadata.version;
    delete copy.metadata.status;
    delete copy.metadata.createdAt;
    delete copy.metadata.updatedAt;
    if (copy.kind === "ProcessDefinition") {
      delete copy.spec.bindingSetVersionId;
      delete copy.spec.releaseId;
    }
    if (copy.kind === "OperationalTraceabilityCatalog") {
      for (const activity of copy.spec.activities) {
        delete activity.interactionPointRefs;
        delete activity.evidenceRefs;
        for (const action of activity.completionActions) {
          delete action.operationRefs;
          delete action.evidenceRefs;
        }
      }
    }
    if (copy.kind === "AccessCatalog") {
      for (const profile of copy.spec.profiles) delete profile.sourceSystemRef;
      for (const group of copy.spec.groups) delete group.sourceSystemRef;
      for (const policy of copy.spec.policies) delete policy.evidenceRefs;
    }
    if (copy.kind === "AutomationCatalog") {
      copy.spec = {
        timingPolicies: copy.spec.timingPolicies,
        jobs: copy.spec.jobs.map((job: any) => ({ key: job.key, label: job.label, schedule: job.schedule, timezone: job.timezone, ownerUnitRef: job.ownerUnitRef })),
      };
    }
    if (copy.kind === "DataAssetCatalog") for (const asset of copy.spec.assets) delete asset.evidenceRefs;
    if (copy.kind === "DecisionCatalog") for (const decision of copy.spec.decisions) delete decision.evidenceRefs;
    if (copy.kind === "StateCatalog") for (const machine of copy.spec.machines) for (const transition of machine.transitions) delete transition.operationRef;
    if (copy.kind === "CommunicationCatalog") {
      for (const template of copy.spec.templates) delete template.templatePath;
      for (const notification of copy.spec.notifications) delete notification.evidenceRefs;
    }
    return copy;
  }).filter((resource): resource is ProcessBundleV2Resource => Boolean(resource)).sort((left, right) => left.metadata.key.localeCompare(right.metadata.key));
  return sha256(stableJson(stableResources));
}

function byKind<T extends ProcessBundleV2Resource["kind"]>(resources: ProcessBundleV2Resource[], kind: T) {
  return resources.find((resource) => resource.kind === kind) as Extract<ProcessBundleV2Resource, { kind: T }> | undefined;
}

type ImportedResource = { path: string; resource: ProcessBundleV2Resource; hash: string };
type ImportedArtifact = { path: string; mediaType: string; visibility: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED"; sha256: string; content: Buffer };
type ImportedSourceArtifact = Extract<ProcessBundleV2Resource, { kind: "ProvenanceCatalog" }>["spec"]["sourceArtifacts"][number];
type ExistingProcessVersion = Prisma.ProcessVersionGetPayload<{ include: { process: true; activeBindingSet: { include: { resources: true } }; bindingSets: true } }>;
type InstitutionalUnitRole = "OWNER" | "PARTICIPANT";
type InstitutionalUnitMappingInput = { reference: string; unitId: string; role: InstitutionalUnitRole };
type InstitutionalUnitMapping = {
  reference: string;
  role: InstitutionalUnitRole;
  bundleAcronym: string;
  bundleLabel: string;
  status: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS";
  resolvedUnit?: { id: string; externalId: string; acronym: string; name: string };
  candidates: Array<{ id: string; externalId: string; acronym: string; name: string }>;
};
type AuthoringVersion = Prisma.ProcessVersionGetPayload<{ include: { process: { include: { ownerUnit: true; participantUnits: { include: { unit: true } } } }; activeBindingSet: { include: { resources: true; files: true; approvals: true } } } }>;

@Injectable()
export class ProcessBundleV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService = new AuthorizationService(prisma),
  ) {}

  async dryRun(input: { fileName: string; contentBase64: string }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    if (!input.fileName.toLowerCase().endsWith(".zip")) throw new BadRequestException("O ProcessBundle v2 deve ser enviado como ZIP.");
    if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(input.contentBase64)) throw new BadRequestException("Conteúdo Base64 inválido.");
    const content = Buffer.from(input.contentBase64, "base64");
    if (content.byteLength > 15 * 1024 * 1024) throw new BadRequestException("O arquivo excede o limite de 15 MB.");
    const report = await validateProcessBundleV2(content, { maxCompressedBytes: 15 * 1024 * 1024 });
    const software = byKind(report.resources, "SoftwareCatalog");
    const requiresCgtiApproval = Boolean(software && (software.spec.entryPoints.length || software.spec.operations.length));
    const existing = report.manifest ? await this.prisma.bundleResource.findFirst({
      where: { kind: "ProcessDefinition", semanticKey: report.manifest.processDefinitionKey },
      include: { bindingSetVersion: { include: { processVersion: { include: { process: true } } } } }, orderBy: { createdAt: "desc" },
    }) : null;
    const diff = existing ? {
      processId: existing.bindingSetVersion.processVersion.processId, currentVersionId: existing.bindingSetVersion.processVersionId,
      incomingVersionId: report.manifest?.processVersionId, sameContent: existing.bindingSetVersion.contentHash === sha256(content),
    } : { createsNewProcess: true };
    const institutionalUnitMappings = report.valid ? await this.resolveInstitutionalUnitMappings(report.resources) : [];
    const readyToApply = report.valid && institutionalUnitMappings.every((mapping) => mapping.status === "RESOLVED");
    const job = await this.prisma.bundleImportJob.create({ data: {
      status: report.valid ? "VALIDATED" : "REJECTED", fileName: input.fileName, uploadedBy: actor.id, uploadedByName: actor.name,
      content, manifest: report.manifest ? asJson(report.manifest) : undefined, validationReport: asJson(report),
      proposedProcessKey: report.manifest?.processDefinitionKey, requiresCgtiApproval,
    } });
    return { importId: job.id, status: job.status, valid: report.valid, readyToApply, issues: report.issues, coverage: report.coverage, manifest: report.manifest, requiresCgtiApproval, technicalBindingsWillBe: requiresCgtiApproval && !isCgti(headers) ? "PENDING_CGTI_APPROVAL" : "APPROVED", institutionalUnitMappings, diff };
  }

  async apply(importId: string, input: { unitMappings?: InstitutionalUnitMappingInput[]; ownerUnitId?: string }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const job = await this.prisma.bundleImportJob.findUnique({ where: { id: importId } });
    if (!job) throw new NotFoundException("Importação não encontrada.");
    if (job.status !== "VALIDATED") throw new ConflictException("Somente uma importação validada pode ser aplicada.");
    if (!isCgti(headers) && job.uploadedBy !== actor.id) throw new ForbiddenException("Somente quem enviou o pacote ou o CGTI pode aplicar esta importação.");
    const content = Buffer.from(job.content);
    const report = await validateProcessBundleV2(content);
    if (!report.valid || !report.manifest) throw new ConflictException("O conteúdo em quarentena não é mais válido.");
    const definition = byKind(report.resources, "ProcessDefinition");
    if (!definition) throw new BadRequestException("ProcessDefinition ausente.");
    const zip = await JSZip.loadAsync(content);
    const bpmnXml = await zip.file("process/process.bpmn")?.async("string");
    if (!bpmnXml) throw new BadRequestException("BPMN ausente.");
    const resourceEntries = await Promise.all(report.manifest.files.filter((file) => file.mediaType === "application/json").map(async (file) => {
      const entry = zip.file(file.path);
      if (!entry) return undefined;
      const parsed = processBundleV2ResourceSchema.safeParse(JSON.parse(await entry.async("string")));
      return parsed.success ? { path: file.path, resource: parsed.data, hash: file.sha256 } : undefined;
    }));
    const resources = resourceEntries.filter((item): item is NonNullable<typeof item> => Boolean(item));
    const artifactEntries = (await Promise.all(report.manifest.files.map(async (file) => {
      const entry = zip.file(file.path);
      return entry ? { ...file, content: await entry.async("nodebuffer") } : undefined;
    }))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const sourceArtifacts = byKind(report.resources, "ProvenanceCatalog")?.spec.sourceArtifacts ?? [];
    const softwareKeys = byKind(report.resources, "SoftwareCatalog")?.spec.operations.map((operation) => operation.key) ?? [];
    const technicalApproved = isCgti(headers) || softwareKeys.length === 0;
    const requestedMappings = input.unitMappings ?? (input.ownerUnitId ? [{ reference: definition.spec.ownerUnitRef, unitId: input.ownerUnitId, role: "OWNER" as const }] : []);
    const unitMappings = await this.validateInstitutionalUnitMappings(report.resources, requestedMappings, headers);
    const ownerMapping = unitMappings.find((mapping) => mapping.role === "OWNER");
    if (!ownerMapping) throw new BadRequestException("A unidade responsável declarada no pacote não foi reconciliada.");
    const ownerUnit = ownerMapping.unit;
    const existingVersion = await this.prisma.processVersion.findUnique({
      where: { id: report.manifest.processVersionId },
      include: { process: true, activeBindingSet: { include: { resources: true } }, bindingSets: { orderBy: { revision: "desc" }, take: 1 } },
    });
    const existingBindingSet = await this.prisma.bindingSetVersion.findUnique({ where: { id: report.manifest.bindingSetVersionId }, select: { id: true } });
    const existingResource = await this.prisma.bundleResource.findFirst({ where: { kind: "ProcessDefinition", semanticKey: definition.metadata.key }, include: { bindingSetVersion: { include: { processVersion: true } } } });
    const existingProcess = existingResource ? await this.prisma.process.findUnique({ where: { id: existingResource.bindingSetVersion.processVersion.processId }, include: { versions: true } }) : null;
    const governedUnitId = existingVersion?.process.ownerUnitId ?? existingProcess?.ownerUnitId ?? ownerUnit.id;
    if ((existingVersion || existingProcess) && ownerUnit.id !== governedUnitId) {
      throw new ConflictException("Uma nova versão deve preservar a unidade proprietária do processo existente.");
    }
    await this.assertUnitCapability(governedUnitId, "BUNDLE_IMPORT", headers);
    if (existingVersion) {
      if (existingVersion.contractVersion !== "v2" || !existingVersion.activeBindingSet) throw new ConflictException("O identificador de versão já pertence a um processo incompatível.");
      if ((existingProcess && existingVersion.process.id !== existingProcess.id) || definition.metadata.key !== (existingVersion.metadata as any).processDefinitionKey) throw new ConflictException("O pacote tenta reutilizar a identidade de outra versão de processo.");
      if (existingBindingSet) throw new ConflictException("Este binding set já foi importado.");
      if (existingVersion.contentHash !== sha256(bpmnXml)) throw new ConflictException("Mudanças no BPMN exigem uma nova ProcessVersion.");
      const storedResources = existingVersion.activeBindingSet.resources.map((item) => item.content as unknown as ProcessBundleV2Resource);
      if (existingVersion.conformanceProfile !== report.manifest.profile || processMeaningHash(storedResources) !== processMeaningHash(report.resources)) {
        throw new ConflictException("Mudanças no significado, dados, formulários, decisões ou projeções exigem uma nova ProcessVersion.");
      }
      return this.applyBindingSetUpdate({ jobId: importId, version: existingVersion, report, resources, artifactEntries, softwareKeys, sourceArtifacts, actor, content, headers });
    }
    if (existingBindingSet) throw new ConflictException("O identificador do binding set já pertence a outra versão de processo.");
    const visibility = definition.metadata.visibility === "PUBLIC" ? "PUBLIC" : definition.metadata.visibility === "RESTRICTED" ? "RESTRICTED" : "INTERNAL";
    const processUnitsById = new Map<string, { unitId: string; role: string }>();
    for (const mapping of unitMappings) {
      if (!processUnitsById.has(mapping.unit.id) || mapping.role === "OWNER") {
        processUnitsById.set(mapping.unit.id, { unitId: mapping.unit.id, role: mapping.role === "OWNER" ? "Responsável pelo processo" : "Participante" });
      }
    }
    const processUnitRows = [...processUnitsById.values()];
    const result = await this.prisma.$transaction(async (tx) => {
      const process = existingProcess ?? await tx.process.create({ data: {
        slug: slugify(definition.metadata.key.replace(/^processo\./, "")), title: definition.metadata.title,
        description: definition.metadata.description ?? "Processo importado por ProcessBundle v2.", category: definition.metadata.labels.category ?? "Processo institucional",
        audience: definition.metadata.labels.audience ?? (definition.spec.audienceRefs.join(", ") || "Público institucional"), visibility, ownerUnitId: ownerUnit.id,
        participantUnits: { create: processUnitRows },
      }, include: { versions: true } });
      if (existingProcess) {
        await tx.processUnit.deleteMany({ where: { processId: process.id } });
        await tx.processUnit.createMany({ data: processUnitRows.map((row) => ({ processId: process.id, ...row })), skipDuplicates: true });
      }
      const revision = Math.max(0, ...process.versions.map((version) => version.revision)) + 1;
      const version = await tx.processVersion.create({ data: {
        id: report.manifest!.processVersionId, processId: process.id, revision, perspective: definition.spec.perspective, status: "DRAFT", bpmnXml,
        metadata: asJson({ processDefinitionKey: definition.metadata.key, importedFrom: report.manifest }), contentHash: sha256(bpmnXml), createdBy: actor.id,
        contractVersion: "v2", conformanceProfile: report.manifest!.profile, bundleHash: sha256(content),
        gitEvidence: { create: sourceArtifacts.filter((item) => item.location.repository && item.location.commit).map((item) => ({ repository: item.location.repository!, commit: item.location.commit!, tag: item.location.tag, pullRequest: item.location.pullRequest, path: item.location.path, sourceArtifactKey: item.key })) },
        audits: { create: { actorId: actor.id, actorName: actor.name, action: "PROCESS_BUNDLE_V2_IMPORTED", details: asJson({ importId, profile: report.manifest!.profile, pendingTechnicalBindings: !isCgti(headers) ? softwareKeys.length : 0, institutionalUnitMappings: unitMappings.map((mapping) => ({ reference: mapping.reference, role: mapping.role, unitId: mapping.unit.id, externalId: mapping.unit.externalId })) }) } },
      } });
      const bindingSet = await tx.bindingSetVersion.create({ data: {
        id: report.manifest!.bindingSetVersionId, processVersionId: version.id, revision: 1,
        status: technicalApproved ? "APPROVED" : "PENDING", contentHash: sha256(content), bundleContent: Uint8Array.from(content), createdBy: actor.id,
        reviewedBy: technicalApproved ? actor.id : undefined, reviewedAt: technicalApproved ? new Date() : undefined,
        resources: { create: resources.map(({ path, resource, hash }) => ({ path, kind: resource.kind, semanticKey: resource.metadata.key, resourceVersion: resource.metadata.version, visibility: resource.metadata.visibility, content: asJson(resource), contentHash: hash })) },
        files: { create: artifactEntries.map((item) => ({ path: item.path, mediaType: item.mediaType, visibility: item.visibility, content: Uint8Array.from(item.content), contentHash: item.sha256 })) },
        approvals: { create: softwareKeys.map((semanticKey) => ({ semanticKey, status: isCgti(headers) ? "APPROVED" : "PENDING", reviewedBy: isCgti(headers) ? actor.id : undefined, reviewedAt: isCgti(headers) ? new Date() : undefined })) },
      } });
      await tx.processVersion.update({ where: { id: version.id }, data: { bindingSetVersionId: bindingSet.id } });
      await tx.bundleImportJob.update({ where: { id: importId }, data: { status: "APPLIED", appliedAt: new Date(), processVersionId: version.id } });
      return { process, version, revision };
    }, { isolationLevel: "Serializable" });
    return { kind: "process-bundle-v2", processId: result.process.id, versionId: result.version.id, revision: result.revision, warnings: [], pendingTechnicalBindings: technicalApproved ? 0 : softwareKeys.length };
  }

  private declaredInstitutionalUnits(resources: ProcessBundleV2Resource[]) {
    const definition = byKind(resources, "ProcessDefinition");
    if (!definition) return [];
    const context = byKind(resources, "InstitutionalContextCatalog");
    const catalog = new Map((context?.spec.organizationUnits ?? []).map((unit) => [unit.key, unit]));
    const references: Array<{ reference: string; role: InstitutionalUnitRole }> = [
      { reference: definition.spec.ownerUnitRef, role: "OWNER" },
      ...definition.spec.participantUnitRefs.filter((reference) => reference !== definition.spec.ownerUnitRef).map((reference) => ({ reference, role: "PARTICIPANT" as const })),
    ];
    return references.map(({ reference, role }) => ({
      reference,
      role,
      bundleAcronym: catalog.get(reference)?.acronym ?? reference.split(".").at(-1)?.toUpperCase() ?? reference,
      bundleLabel: catalog.get(reference)?.label ?? reference,
    }));
  }

  private async resolveInstitutionalUnitMappings(resources: ProcessBundleV2Resource[]): Promise<InstitutionalUnitMapping[]> {
    const declared = this.declaredInstitutionalUnits(resources);
    if (!declared.length) return [];
    const references = await this.prisma.organizationUnitReference.findMany({
      where: { sourceSystem: "PROCESS_BUNDLE_V2", reference: { in: declared.map((item) => item.reference) }, unit: { active: true } },
      include: { unit: true },
    });
    return declared.map((item) => {
      const candidates = references.filter((entry) => entry.reference === item.reference).map((entry) => ({
        id: entry.unit.id, externalId: entry.unit.externalId, acronym: entry.unit.acronym, name: entry.unit.name,
      }));
      return {
        ...item,
        status: candidates.length === 1 ? "RESOLVED" as const : candidates.length > 1 ? "AMBIGUOUS" as const : "UNRESOLVED" as const,
        resolvedUnit: candidates.length === 1 ? candidates[0] : undefined,
        candidates,
      };
    });
  }

  private async validateInstitutionalUnitMappings(resources: ProcessBundleV2Resource[], requested: InstitutionalUnitMappingInput[], headers?: Record<string, string | undefined>) {
    const declared = await this.resolveInstitutionalUnitMappings(resources);
    const declaredByReference = new Map(declared.map((mapping) => [mapping.reference, mapping]));
    const requestedByReference = new Map<string, InstitutionalUnitMappingInput>();
    for (const mapping of requested) {
      const expected = declaredByReference.get(mapping.reference);
      if (!expected || expected.role !== mapping.role) throw new BadRequestException(`O vínculo institucional ${mapping.reference} não foi declarado pelo pacote.`);
      if (requestedByReference.has(mapping.reference)) throw new BadRequestException(`O vínculo institucional ${mapping.reference} foi informado mais de uma vez.`);
      requestedByReference.set(mapping.reference, mapping);
    }
    const selectedIds = new Set<string>();
    for (const mapping of declared) {
      const requestedMapping = requestedByReference.get(mapping.reference);
      if (mapping.status === "RESOLVED") {
        if (requestedMapping && requestedMapping.unitId !== mapping.resolvedUnit!.id && !isCgti(headers)) {
          throw new ForbiddenException("Somente administradores da plataforma podem substituir uma correspondência institucional canônica.");
        }
        selectedIds.add(requestedMapping?.unitId ?? mapping.resolvedUnit!.id);
      } else {
        if (!requestedMapping) throw new BadRequestException(`A referência institucional ${mapping.reference} ainda não possui correspondência na plataforma.`);
        if (!isCgti(headers)) throw new ForbiddenException("Somente administradores da plataforma podem decidir correspondências institucionais não resolvidas.");
        selectedIds.add(requestedMapping.unitId);
      }
    }
    const units = await this.prisma.organizationUnit.findMany({ where: { id: { in: [...selectedIds] }, active: true } });
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    return declared.map((mapping) => {
      const unitId = requestedByReference.get(mapping.reference)?.unitId ?? mapping.resolvedUnit?.id;
      const unit = unitId ? unitsById.get(unitId) : undefined;
      if (!unit) throw new BadRequestException(`A unidade escolhida para ${mapping.reference} não existe ou está inativa.`);
      return { reference: mapping.reference, role: mapping.role, unit };
    });
  }

  private async applyBindingSetUpdate(input: {
    jobId: string;
    version: ExistingProcessVersion;
    report: BundleValidationReport;
    resources: ImportedResource[];
    artifactEntries: ImportedArtifact[];
    softwareKeys: string[];
    sourceArtifacts: ImportedSourceArtifact[];
    actor: ReturnType<typeof identity>;
    content: Buffer;
    headers?: Record<string, string | undefined>;
  }) {
    const manifest = input.report.manifest!;
    const approved = isCgti(input.headers) || input.softwareKeys.length === 0;
    const nextRevision = (input.version.bindingSets[0]?.revision ?? 0) + 1;
    const definition = byKind(input.report.resources, "ProcessDefinition")!;
    const releaseId = definition.spec.releaseId;
    const result = await this.prisma.$transaction(async (tx) => {
      const bindingSet = await tx.bindingSetVersion.create({ data: {
        id: manifest.bindingSetVersionId, processVersionId: input.version.id, revision: nextRevision,
        status: approved ? "APPROVED" : "PENDING", contentHash: sha256(input.content), bundleContent: Uint8Array.from(input.content), createdBy: input.actor.id,
        reviewedBy: approved ? input.actor.id : undefined, reviewedAt: approved ? new Date() : undefined,
        resources: { create: input.resources.map(({ path, resource, hash }) => ({ path, kind: resource.kind, semanticKey: resource.metadata.key, resourceVersion: resource.metadata.version, visibility: resource.metadata.visibility, content: asJson(resource), contentHash: hash })) },
        files: { create: input.artifactEntries.map((item) => ({ path: item.path, mediaType: item.mediaType, visibility: item.visibility, content: Uint8Array.from(item.content), contentHash: item.sha256 })) },
        approvals: { create: input.softwareKeys.map((semanticKey) => ({ semanticKey, status: approved ? "APPROVED" : "PENDING", reviewedBy: approved ? input.actor.id : undefined, reviewedAt: approved ? new Date() : undefined })) },
      }, include: { resources: true, files: true } });
      if (input.sourceArtifacts.length) await tx.gitEvidenceLink.createMany({ data: input.sourceArtifacts.filter((item) => item.location.repository && item.location.commit).map((item) => ({ processVersionId: input.version.id, repository: item.location.repository!, commit: item.location.commit!, tag: item.location.tag, pullRequest: item.location.pullRequest, path: item.location.path, sourceArtifactKey: item.key })) });
      if (approved) {
        await tx.processVersion.update({ where: { id: input.version.id }, data: { bindingSetVersionId: bindingSet.id, bundleHash: bindingSet.contentHash } });
        if (input.version.status === "PUBLISHED") await tx.processRelease.create({ data: {
          id: releaseId, processVersionId: input.version.id, bindingSetVersionId: bindingSet.id, bundleHash: bindingSet.contentHash,
          immutableSnapshot: { contractVersion: "v2", processVersionId: input.version.id, bindingSetVersionId: bindingSet.id, bpmnXml: input.version.bpmnXml, contentHash: input.version.contentHash, resources: bindingSet.resources.map((resource) => ({ path: resource.path, hash: resource.contentHash, content: resource.content })), files: bindingSet.files.map((file) => ({ path: file.path, mediaType: file.mediaType, visibility: file.visibility, hash: file.contentHash })) },
        } });
      }
      await tx.auditEvent.create({ data: { processVersionId: input.version.id, actorId: input.actor.id, actorName: input.actor.name, action: approved ? "BINDING_SET_IMPORTED_AND_APPROVED" : "BINDING_SET_IMPORTED_FOR_REVIEW", details: asJson({ bindingSetVersionId: bindingSet.id, revision: nextRevision, releaseId, technicalOperations: input.softwareKeys.length }) } });
      await tx.bundleImportJob.update({ where: { id: input.jobId }, data: { status: "APPLIED", appliedAt: new Date(), processVersionId: input.version.id } });
      return bindingSet;
    }, { isolationLevel: "Serializable" });
    return { kind: "binding-set-v2", processId: input.version.processId, versionId: input.version.id, bindingSetVersionId: result.id, bindingRevision: result.revision, releaseId: approved && input.version.status === "PUBLISHED" ? releaseId : undefined, pendingTechnicalBindings: approved ? 0 : input.softwareKeys.length };
  }

  async reviewBindings(versionId: string, input: { bindingSetVersionId?: string; semanticKeys: string[]; decision: "APPROVED" | "REJECTED"; note?: string }, headers?: Record<string, string | undefined>) {
    if (!isCgti(headers)) throw new ForbiddenException("Somente administradores do CGTI podem aprovar vínculos técnicos.");
    const actor = identity(headers);
    const bindingSet = await this.prisma.bindingSetVersion.findFirst({
      where: { id: input.bindingSetVersionId, processVersionId: versionId, ...(input.bindingSetVersionId ? {} : { status: "PENDING" }) },
      orderBy: { revision: "desc" }, include: { processVersion: true, resources: true, files: true },
    });
    if (!bindingSet) throw new NotFoundException("Binding set pendente não encontrado.");
    const result = await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.technicalBindingApproval.updateMany({ where: { bindingSetVersionId: bindingSet.id, semanticKey: { in: input.semanticKeys }, status: "PENDING" }, data: { status: input.decision, reviewedBy: actor.id, reviewedAt: new Date(), note: input.note } });
      const pending = await tx.technicalBindingApproval.count({ where: { bindingSetVersionId: bindingSet.id, status: "PENDING" } });
      const rejected = await tx.technicalBindingApproval.count({ where: { bindingSetVersionId: bindingSet.id, status: "REJECTED" } });
      let releaseId: string | undefined;
      if (pending === 0) {
        const status = rejected > 0 ? "REJECTED" : "APPROVED";
        await tx.bindingSetVersion.update({ where: { id: bindingSet.id }, data: { status, reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: input.note } });
        if (status === "APPROVED") {
          await tx.processVersion.update({ where: { id: versionId }, data: { bindingSetVersionId: bindingSet.id, bundleHash: bindingSet.contentHash } });
          if (bindingSet.processVersion.status === "PUBLISHED") {
            const definition = bindingSet.resources.find((resource) => resource.kind === "ProcessDefinition")?.content as { spec?: { releaseId?: string } } | undefined;
            releaseId = definition?.spec?.releaseId;
            if (!releaseId) throw new ConflictException("O binding set não declara releaseId.");
            await tx.processRelease.create({ data: { id: releaseId, processVersionId: versionId, bindingSetVersionId: bindingSet.id, bundleHash: bindingSet.contentHash, immutableSnapshot: { contractVersion: "v2", processVersionId: versionId, bindingSetVersionId: bindingSet.id, bpmnXml: bindingSet.processVersion.bpmnXml, contentHash: bindingSet.processVersion.contentHash, resources: bindingSet.resources.map((resource) => ({ path: resource.path, hash: resource.contentHash, content: resource.content })), files: bindingSet.files.map((file) => ({ path: file.path, mediaType: file.mediaType, visibility: file.visibility, hash: file.contentHash })) } } });
          }
        }
      }
      await tx.auditEvent.create({ data: { processVersionId: versionId, actorId: actor.id, actorName: actor.name, action: "TECHNICAL_BINDINGS_REVIEWED", details: asJson({ bindingSetVersionId: bindingSet.id, semanticKeys: input.semanticKeys, decision: input.decision, reviewed: reviewed.count, pending, rejected, releaseId }) } });
      return { reviewed: reviewed.count, pending, rejected, releaseId };
    });
    return { ...result, decision: input.decision, bindingSetVersionId: bindingSet.id };
  }

  async forkVersion(processId: string, sourceVersionId: string, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const source = await this.prisma.processVersion.findFirst({ where: { id: sourceVersionId, processId }, include: { process: true, activeBindingSet: { include: { resources: true, files: true, approvals: true } }, gitEvidence: true } });
    if (!source || source.contractVersion !== "v2" || !source.activeBindingSet) throw new NotFoundException("Versão v2 de origem não encontrada.");
    const sourceBindingSet = source.activeBindingSet;
    await this.assertUnitCapability(source.process.ownerUnitId, "PROCESS_EDIT", headers);
    const processVersionId = randomUUID();
    const bindingSetVersionId = randomUUID();
    const releaseId = randomUUID();
    const now = new Date().toISOString();
    const resources = sourceBindingSet.resources.map((stored) => {
      const content = structuredClone(stored.content) as any;
      content.metadata.id = randomUUID();
      content.metadata.version = `${content.metadata.version}-draft.${Date.now()}`;
      content.metadata.status = "DRAFT";
      content.metadata.updatedAt = now;
      if (content.kind === "ProcessDefinition") Object.assign(content.spec, { processVersionId, bindingSetVersionId, releaseId });
      if (content.kind === "ProcessRelease") Object.assign(content.spec, { releaseId, processVersionId, bindingSetVersionId, publishedAt: undefined, effectiveFrom: undefined, effectiveUntil: undefined });
      return { ...stored, content, contentHash: sha256(JSON.stringify(content)) };
    });
    const resourceContentByPath = new Map(resources.map((item) => [item.path, Buffer.from(`${JSON.stringify(item.content, null, 2)}\n`, "utf8")]));
    const bundleFiles = sourceBindingSet.files.map((file) => ({ path: file.path, mediaType: file.mediaType, visibility: file.visibility as "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED", content: resourceContentByPath.get(file.path) ?? Buffer.from(file.content) }));
    const portableBundle = await buildProcessBundleV2({ profile: source.conformanceProfile as "DOCUMENTARY" | "ANALYZABLE" | "IMPLEMENTABLE" | "EXECUTABLE", processDefinitionKey: (resources.find((item) => item.kind === "ProcessDefinition")?.content as any).metadata.key, processVersionId, bindingSetVersionId, releaseId, createdAt: now, createdBy: actor.name, files: bundleFiles });
    const { version, revision } = await this.prisma.$transaction(async (tx) => {
      const revision = Math.max(...(await tx.processVersion.findMany({ where: { processId }, select: { revision: true } })).map((item) => item.revision)) + 1;
      const version = await tx.processVersion.create({ data: {
        id: processVersionId, processId, revision, perspective: source.perspective, status: "DRAFT", bpmnXml: source.bpmnXml, metadata: asJson({ forkedFrom: sourceVersionId }),
        contentHash: source.contentHash, createdBy: actor.id, contractVersion: "v2", conformanceProfile: source.conformanceProfile,
        bundleHash: sha256(portableBundle),
        gitEvidence: { create: source.gitEvidence.map((item) => ({ repository: item.repository, commit: item.commit, tag: item.tag, pullRequest: item.pullRequest, path: item.path, sourceArtifactKey: item.sourceArtifactKey, observedHash: item.observedHash })) },
        audits: { create: { actorId: actor.id, actorName: actor.name, action: "PROCESS_BUNDLE_V2_VERSION_FORKED", details: asJson({ sourceVersionId }) } },
      } });
      await tx.bindingSetVersion.create({ data: {
        id: bindingSetVersionId, processVersionId: version.id, revision: 1,
        status: isCgti(headers) || sourceBindingSet.approvals.length === 0 ? sourceBindingSet.status : "PENDING",
        contentHash: sha256(portableBundle), bundleContent: Uint8Array.from(portableBundle), createdBy: actor.id,
        resources: { create: resources.map((item) => ({ path: item.path, kind: item.kind, semanticKey: (item.content as any).metadata.key, resourceVersion: (item.content as any).metadata.version, visibility: item.visibility, content: asJson(item.content), contentHash: item.contentHash })) },
        files: { create: bundleFiles.map((item) => ({ path: item.path, mediaType: item.mediaType, visibility: item.visibility, content: Uint8Array.from(item.content), contentHash: sha256(item.content) })) },
        approvals: { create: sourceBindingSet.approvals.map((item) => ({ semanticKey: item.semanticKey, status: isCgti(headers) ? item.status : "PENDING" })) },
      } });
      await tx.processVersion.update({ where: { id: version.id }, data: { bindingSetVersionId } });
      return { version, revision };
    }, { isolationLevel: "Serializable" });
    return { processId, versionId: version.id, revision, bindingSetVersionId, releaseId };
  }

  async authoringState(processId: string, versionId: string, headers?: Record<string, string | undefined>) {
    const version = await this.prisma.processVersion.findFirst({
      where: { id: versionId, processId },
      include: { process: { include: { ownerUnit: true, participantUnits: { include: { unit: true } } } }, activeBindingSet: { include: { resources: { orderBy: { kind: "asc" } }, files: true, approvals: true } } },
    });
    if (!version || version.contractVersion !== "v2" || !version.activeBindingSet) throw new NotFoundException("Versão v2 não encontrada.");
    await this.assertUnitCapability(version.process.ownerUnitId, "PROCESS_VIEW_TECHNICAL", headers);
    const validation = await validateProcessBundleV2(Buffer.from(version.activeBindingSet.bundleContent ?? []));
    return {
      version: { id: version.id, revision: version.revision, status: version.status, immutable: Boolean(version.immutableAt), bindingSetVersionId: version.activeBindingSet.id },
      editable: !version.immutableAt && ["DRAFT", "CHANGES_REQUESTED"].includes(version.status),
      resources: version.activeBindingSet.resources.map((stored) => ({ path: stored.path, kind: stored.kind, semanticKey: stored.semanticKey, visibility: stored.visibility, content: stored.content })),
      responsibilities: {
        ownerUnit: version.process.ownerUnit,
        participantUnits: version.process.participantUnits.map(({ unit, role }) => ({ ...unit, role })),
      },
      validation: { valid: validation.valid, issues: validation.issues, coverage: validation.coverage },
      capabilities: { canEdit: await this.canEditAuthoringVersion(version, headers), canEditTechnical: isCgti(headers) },
    };
  }

  async updateContractResource(processId: string, versionId: string, resourceKey: string, input: { content: unknown; reason: string }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException("Informe o motivo da alteração.");
    if (reason.length > 1000) throw new BadRequestException("O motivo deve ter no máximo 1.000 caracteres.");
    const version = await this.editableAuthoringVersion(processId, versionId, headers);
    const bindingSet = version.activeBindingSet!;
    const stored = bindingSet.resources.find((resource) => resource.semanticKey === resourceKey);
    if (!stored) throw new NotFoundException("Recurso canônico não encontrado.");
    const parsed = processBundleV2ResourceSchema.safeParse(input.content);
    if (!parsed.success) throw new BadRequestException({ message: "Revise os campos do recurso.", fields: parsed.error.flatten() });
    if (parsed.data.kind !== stored.kind) throw new BadRequestException("O tipo de um recurso existente não pode ser trocado.");
    if (["SoftwareCatalog", "AutomationCatalog"].includes(parsed.data.kind) && !isCgti(headers)) throw new ForbiddenException("Sistemas, operações, integrações e automações exigem administração do CGTI.");

    const content = structuredClone(parsed.data) as ProcessBundleV2Resource;
    content.metadata.updatedAt = new Date().toISOString();
    content.metadata.status = "DRAFT";
    if (content.kind === "ProcessDefinition") {
      content.spec.processVersionId = version.id;
      content.spec.bindingSetVersionId = bindingSet.id;
      const current = stored.content as any;
      content.spec.releaseId = current.spec.releaseId;
      await this.assertResolvableDefinitionUnits(content);
    }
    if (content.kind === "ProcessRelease") {
      const definition = bindingSet.resources.find((resource) => resource.kind === "ProcessDefinition")?.content as any;
      content.spec.processVersionId = version.id;
      content.spec.bindingSetVersionId = bindingSet.id;
      content.spec.releaseId = definition?.spec?.releaseId ?? content.spec.releaseId;
    }
    const prepared = await this.prepareAuthoredBundle(version, new Map([[stored.path, content]]), actor.name);
    this.assertValidAuthoredBundle(prepared.validation);
    const technicalChange = content.kind === "SoftwareCatalog";
    await this.prisma.$transaction(async (tx) => {
      const serialized = Buffer.from(`${JSON.stringify(content, null, 2)}\n`, "utf8");
      await tx.bundleResource.update({ where: { id: stored.id }, data: { semanticKey: content.metadata.key, resourceVersion: content.metadata.version, visibility: content.metadata.visibility, content: asJson(content), contentHash: sha256(serialized) } });
      await tx.bundleArtifactFile.update({ where: { bindingSetVersionId_path: { bindingSetVersionId: bindingSet.id, path: stored.path } }, data: { visibility: content.metadata.visibility, content: Uint8Array.from(serialized), contentHash: sha256(serialized) } });
      await tx.bindingSetVersion.update({ where: { id: bindingSet.id }, data: { contentHash: sha256(prepared.bundle), bundleContent: Uint8Array.from(prepared.bundle), status: technicalChange ? "PENDING" : bindingSet.status, reviewedBy: technicalChange ? null : undefined, reviewedAt: technicalChange ? null : undefined } });
      await tx.processVersion.update({ where: { id: version.id }, data: { bundleHash: sha256(prepared.bundle), audits: { create: { actorId: actor.id, actorName: actor.name, action: "CONTRACT_RESOURCE_UPDATED", details: asJson({ kind: content.kind, previousKey: resourceKey, resourceKey: content.metadata.key, path: stored.path, reason, validationIssueCount: prepared.validation.issues.length }) } } } });
      if (technicalChange && content.kind === "SoftwareCatalog") {
        await tx.technicalBindingApproval.deleteMany({ where: { bindingSetVersionId: bindingSet.id } });
        if (content.spec.operations.length) await tx.technicalBindingApproval.createMany({ data: content.spec.operations.map((operation) => ({ bindingSetVersionId: bindingSet.id, semanticKey: operation.key, status: "PENDING" })) });
      }
      if (content.kind === "ProcessDefinition") await this.projectDefinitionToProcess(tx, version.processId, content);
    }, { isolationLevel: "Serializable" });
    return { resource: content, validation: { valid: prepared.validation.valid, issues: prepared.validation.issues, coverage: prepared.validation.coverage }, bundleHash: sha256(prepared.bundle) };
  }

  async updateResponsibilities(processId: string, versionId: string, input: { ownerUnitId: string; participantUnitIds: string[]; reason: string }, headers?: Record<string, string | undefined>) {
    const version = await this.editableAuthoringVersion(processId, versionId, headers);
    if (version.process.ownerUnitId !== input.ownerUnitId && !isCgti(headers)) throw new ForbiddenException("Somente administradores da plataforma podem transferir a responsabilidade para outra unidade.");
    const unitIds = [...new Set([input.ownerUnitId, ...(input.participantUnitIds ?? [])])];
    const references = await this.prisma.organizationUnitReference.findMany({ where: { sourceSystem: "PROCESS_BUNDLE_V2", unitId: { in: unitIds }, unit: { active: true } }, include: { unit: true } });
    const referenceByUnitId = new Map(references.map((item) => [item.unitId, item.reference]));
    const missing = unitIds.filter((unitId) => !referenceByUnitId.has(unitId));
    if (missing.length) throw new BadRequestException("Todas as unidades escolhidas precisam possuir referência institucional canônica.");
    const definition = version.activeBindingSet!.resources.find((resource) => resource.kind === "ProcessDefinition");
    if (!definition) throw new NotFoundException("Definição canônica do processo não encontrada.");
    const content = structuredClone(definition.content) as Extract<ProcessBundleV2Resource, { kind: "ProcessDefinition" }>;
    content.spec.ownerUnitRef = referenceByUnitId.get(input.ownerUnitId)!;
    content.spec.participantUnitRefs = unitIds.filter((unitId) => unitId !== input.ownerUnitId).map((unitId) => referenceByUnitId.get(unitId)!);
    return this.updateContractResource(processId, versionId, definition.semanticKey, { content, reason: input.reason }, headers);
  }

  async updateBpmnFromUi(processId: string, versionId: string, bpmnXml: string, issues: Array<{ severity: string; message: string }>, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const version = await this.editableAuthoringVersion(processId, versionId, headers);
    const bindingSet = version.activeBindingSet!;
    const prepared = await this.prepareAuthoredBundle(version, new Map(), actor.name, bpmnXml);
    this.assertValidAuthoredBundle(prepared.validation);
    const bpmnContent = Buffer.from(bpmnXml, "utf8");
    const contentHash = sha256(bpmnContent);
    await this.prisma.$transaction(async (tx) => {
      const fileUpdate = await tx.bundleArtifactFile.updateMany({ where: { bindingSetVersionId: bindingSet.id, path: "process/process.bpmn" }, data: { content: Uint8Array.from(bpmnContent), contentHash } });
      if (fileUpdate.count !== 1) throw new ConflictException("O artefato BPMN canônico não foi encontrado no conjunto de vínculos.");
      await tx.bindingSetVersion.update({ where: { id: bindingSet.id }, data: { contentHash: sha256(prepared.bundle), bundleContent: Uint8Array.from(prepared.bundle) } });
      await tx.processVersion.update({ where: { id: version.id }, data: { bpmnXml, contentHash, bundleHash: sha256(prepared.bundle), audits: { create: { actorId: actor.id, actorName: actor.name, action: "BPMN_SAVED", details: asJson({ issueCount: issues.length, contentHash, xmlChars: bpmnXml.length, bundleValidationIssueCount: prepared.validation.issues.length }) } } } });
    }, { isolationLevel: "Serializable" });
    return { savedAt: new Date().toISOString(), contentHash, issues, bundleValidation: { valid: prepared.validation.valid, issues: prepared.validation.issues, coverage: prepared.validation.coverage } };
  }

  async updateProcessMetadataFromUi(processId: string, versionId: string, input: { title: string; description: string; category: string; audience: string; visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED"; ownerUnitId: string; perspective: "AS_IS" | "TO_BE" }, headers?: Record<string, string | undefined>) {
    const version = await this.editableAuthoringVersion(processId, versionId, headers);
    const definition = version.activeBindingSet!.resources.find((resource) => resource.kind === "ProcessDefinition");
    if (!definition) throw new NotFoundException("Definição canônica do processo não encontrada.");
    const ownerReference = await this.prisma.organizationUnitReference.findFirst({ where: { sourceSystem: "PROCESS_BUNDLE_V2", unitId: input.ownerUnitId, unit: { active: true } } });
    if (!ownerReference) throw new BadRequestException("A unidade responsável precisa possuir referência institucional canônica.");
    if (version.process.ownerUnitId !== input.ownerUnitId && !isCgti(headers)) throw new ForbiddenException("Somente administradores da plataforma podem transferir a responsabilidade para outra unidade.");
    const content = structuredClone(definition.content) as Extract<ProcessBundleV2Resource, { kind: "ProcessDefinition" }>;
    content.metadata.title = input.title;
    content.metadata.description = input.description;
    content.metadata.visibility = input.visibility === "INTERNAL" ? "INSTITUTIONAL" : input.visibility;
    content.metadata.labels = { ...content.metadata.labels, category: input.category, audience: input.audience };
    content.spec.perspective = input.perspective;
    content.spec.ownerUnitRef = ownerReference.reference;
    await this.updateContractResource(processId, versionId, definition.semanticKey, { content, reason: "Atualização cadastral pela interface" }, headers);
  }

  private async editableAuthoringVersion(processId: string, versionId: string, headers?: Record<string, string | undefined>): Promise<AuthoringVersion> {
    const version = await this.prisma.processVersion.findFirst({ where: { id: versionId, processId }, include: { process: { include: { ownerUnit: true, participantUnits: { include: { unit: true } } } }, activeBindingSet: { include: { resources: true, files: true, approvals: true } } } });
    if (!version || version.contractVersion !== "v2" || !version.activeBindingSet) throw new NotFoundException("Versão v2 editável não encontrada.");
    if (version.immutableAt || !["DRAFT", "CHANGES_REQUESTED"].includes(version.status)) throw new ConflictException("Crie uma nova versão em rascunho para alterar o contrato.");
    await this.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers);
    return version;
  }

  private async canEditAuthoringVersion(version: AuthoringVersion, headers?: Record<string, string | undefined>) {
    if (version.immutableAt || !["DRAFT", "CHANGES_REQUESTED"].includes(version.status)) return false;
    try { await this.assertUnitCapability(version.process.ownerUnitId, "PROCESS_EDIT", headers); return true; }
    catch (error) { if (error instanceof ForbiddenException) return false; throw error; }
  }

  private async prepareAuthoredBundle(version: AuthoringVersion, replacements: Map<string, ProcessBundleV2Resource>, actorName: string, bpmnXml = version.bpmnXml) {
    const bindingSet = version.activeBindingSet!;
    const resources = bindingSet.resources.map((stored) => replacements.get(stored.path) ?? stored.content as unknown as ProcessBundleV2Resource);
    const definition = byKind(resources, "ProcessDefinition");
    if (!definition) throw new BadRequestException("ProcessDefinition ausente.");
    const resourceContentByPath = new Map(bindingSet.resources.map((stored) => {
      const content = replacements.get(stored.path) ?? stored.content;
      return [stored.path, Buffer.from(`${JSON.stringify(content, null, 2)}\n`, "utf8")];
    }));
    const bundle = await buildProcessBundleV2({
      profile: definition.spec.profile,
      processDefinitionKey: definition.metadata.key,
      processVersionId: version.id,
      bindingSetVersionId: bindingSet.id,
      releaseId: definition.spec.releaseId,
      createdAt: new Date().toISOString(),
      createdBy: actorName,
      files: bindingSet.files.map((file) => ({ path: file.path, mediaType: file.mediaType, visibility: file.visibility as "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED", content: file.path === "process/process.bpmn" ? bpmnXml : resourceContentByPath.get(file.path) ?? Buffer.from(file.content) })),
    });
    return { bundle, validation: await validateProcessBundleV2(bundle) };
  }

  private assertValidAuthoredBundle(validation: Awaited<ReturnType<typeof validateProcessBundleV2>>) {
    if (validation.valid) return;
    const issues = validation.issues.filter((issue) => issue.severity === "error");
    throw new BadRequestException({
      message: "A alteração não foi salva porque deixaria o contrato inconsistente. Corrija as referências indicadas e tente novamente.",
      issues,
    });
  }

  private async assertResolvableDefinitionUnits(definition: Extract<ProcessBundleV2Resource, { kind: "ProcessDefinition" }>) {
    const refs = [...new Set([definition.spec.ownerUnitRef, ...definition.spec.participantUnitRefs])];
    const mappings = await this.prisma.organizationUnitReference.count({ where: { sourceSystem: "PROCESS_BUNDLE_V2", reference: { in: refs }, unit: { active: true } } });
    if (mappings !== refs.length) throw new BadRequestException("Responsável e participantes devem estar vinculados a unidades institucionais oficiais.");
  }

  private async projectDefinitionToProcess(tx: Prisma.TransactionClient, processId: string, definition: Extract<ProcessBundleV2Resource, { kind: "ProcessDefinition" }>) {
    const refs = [...new Set([definition.spec.ownerUnitRef, ...definition.spec.participantUnitRefs])];
    const mappings = await tx.organizationUnitReference.findMany({ where: { sourceSystem: "PROCESS_BUNDLE_V2", reference: { in: refs }, unit: { active: true } }, include: { unit: true } });
    const byReference = new Map(mappings.map((mapping) => [mapping.reference, mapping.unit]));
    const owner = byReference.get(definition.spec.ownerUnitRef);
    if (!owner) throw new BadRequestException("Unidade responsável não reconciliada.");
    await tx.process.update({ where: { id: processId }, data: { title: definition.metadata.title, description: definition.metadata.description ?? "Processo institucional.", category: definition.metadata.labels.category ?? "Processo institucional", audience: definition.metadata.labels.audience ?? (definition.spec.audienceRefs.join(", ") || "Público institucional"), visibility: definition.metadata.visibility === "PUBLIC" ? "PUBLIC" : definition.metadata.visibility === "RESTRICTED" ? "RESTRICTED" : "INTERNAL", ownerUnitId: owner.id } });
    await tx.processUnit.deleteMany({ where: { processId } });
    await tx.processUnit.createMany({ data: refs.map((reference) => ({ processId, unitId: byReference.get(reference)!.id, role: reference === definition.spec.ownerUnitRef ? "Responsável pelo processo" : "Participante" })), skipDuplicates: true });
  }

  async checkGitDrift(versionId: string, input: { sourceArtifactKey: string; observedHash: string }, headers?: Record<string, string | undefined>) {
    const actor = identity(headers);
    const link = await this.prisma.gitEvidenceLink.findFirst({
      where: { processVersionId: versionId, sourceArtifactKey: input.sourceArtifactKey },
      include: { processVersion: { include: { process: true } } },
    });
    if (!link) throw new NotFoundException("Vínculo Git não encontrado.");
    await this.assertUnitCapability(link.processVersion.process.ownerUnitId, "SOURCE_EVIDENCE_CHECK", headers);
    const previousHash = link.observedHash;
    const drift = Boolean(previousHash && previousHash !== input.observedHash);
    await this.prisma.$transaction(async (tx) => {
      await tx.gitEvidenceLink.update({ where: { id: link.id }, data: { observedHash: input.observedHash } });
      await tx.auditEvent.create({ data: { processVersionId: versionId, actorId: actor.id, actorName: actor.name, action: drift ? "SOURCE_DRIFT_DETECTED" : "SOURCE_EVIDENCE_CHECKED", details: asJson({ sourceArtifactKey: input.sourceArtifactKey, previousHash, observedHash: input.observedHash }) } });
      if (drift) await tx.webhookOutboxEvent.create({ data: { type: "process.source-drift.detected", payload: asJson({ processVersionId: versionId, processId: link.processVersion.processId, sourceArtifactKey: input.sourceArtifactKey, repository: link.repository, commit: link.commit, path: link.path, previousHash, observedHash: input.observedHash, detectedAt: new Date().toISOString() }) } });
    });
    return { sourceArtifactKey: input.sourceArtifactKey, previousHash, observedHash: input.observedHash, drift, repository: link.repository, commit: link.commit, path: link.path };
  }

  async projection(locator: string, audience: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED", headers?: Record<string, string | undefined>) {
    const process = await this.prisma.process.findFirst({ where: { OR: [{ id: locator }, { slug: locator }], archivedAt: null }, include: { versions: { orderBy: { revision: "desc" }, include: {
      activeBindingSet: { include: { resources: true, approvals: true } },
      bindingSets: { orderBy: { revision: "desc" }, include: { approvals: true } },
      releases: { orderBy: { publishedAt: "desc" }, include: { bindingSetVersion: { include: { resources: true, approvals: true } } } },
    } }, ownerUnit: true } });
    if (!process) throw new NotFoundException("Processo não encontrado.");
    if (audience === "TECHNICAL") await this.assertUnitCapability(process.ownerUnitId, "PROCESS_VIEW_TECHNICAL", headers);
    if (audience === "RESTRICTED") {
      if (!hasAnyRole(headers, ["UNIT_ADMIN", "INSTITUTIONAL_CURATOR", "CGTI_ADMIN", "PLATFORM_ADMIN"])) throw new ForbiddenException("A projeção restrita exige administração da unidade ou curadoria institucional.");
      await this.assertUnitCapability(process.ownerUnitId, "PROCESS_VIEW_RESTRICTED", headers);
    }
    const releaseAudience = audience === "PUBLIC" || audience === "INSTITUTIONAL";
    const version = releaseAudience ? process.versions.find((item) => item.status === "PUBLISHED" && item.contractVersion === "v2") : process.versions.find((item) => item.contractVersion === "v2");
    if (!version) throw new NotFoundException(releaseAudience ? "O processo não possui release v2 publicado." : "O processo não possui versão v2.");
    const release = version.releases[0];
    const bindingSet = releaseAudience ? release?.bindingSetVersion : version.activeBindingSet;
    if (!bindingSet) throw new NotFoundException("A composição de vínculos desta versão não foi encontrada.");
    const resources = bindingSet.resources.map((item) => item.content as unknown as ProcessBundleV2Resource);
    if (audience === "PUBLIC") {
      let publicDocument;
      try { publicDocument = createPublicProcessProjection(resources); }
      catch { throw new NotFoundException("Projeção pública não definida."); }
      return { process: { id: process.id, slug: process.slug, title: process.title, description: process.description, ownerUnit: process.ownerUnit }, version: { id: version.id, revision: version.revision, releaseId: release?.id }, projection: publicDocument.projection };
    }
    const visibleResources = filterResourcesForAudience(resources, audience);
    const technicalAudience = audience === "TECHNICAL" || audience === "RESTRICTED";
    return {
      process: { id: process.id, slug: process.slug, title: process.title, description: process.description, ownerUnit: process.ownerUnit },
      version: { id: version.id, revision: version.revision, profile: version.conformanceProfile, status: version.status, bindingSetVersionId: bindingSet.id, bindingStatus: bindingSet.status, releaseId: release?.id },
      bpmnXml: version.bpmnXml,
      resources: visibleResources,
      bindingApprovals: technicalAudience ? bindingSet.approvals : [],
      bindingSets: technicalAudience ? version.bindingSets.map((item) => ({ id: item.id, revision: item.revision, status: item.status, createdAt: item.createdAt, reviewedAt: item.reviewedAt, reviewNote: item.reviewNote, approvals: item.approvals })) : [],
      capabilities: { canReviewTechnicalBindings: technicalAudience && isCgti(headers) },
    };
  }

  async activity(locator: string, semanticId: string, headers?: Record<string, string | undefined>) {
    const projection = await this.projection(locator, "TECHNICAL", headers) as { resources: ProcessBundleV2Resource[]; bindingApprovals: Array<{ semanticKey: string; status: string }> };
    const element = byKind(projection.resources, "ElementBindingCatalog")?.spec.elements.find((item) => item.semanticId === semanticId);
    const trace = byKind(projection.resources, "OperationalTraceabilityCatalog")?.spec.activities.find((item) => item.activityRef === semanticId);
    if (!element || !trace) throw new NotFoundException("Atividade não encontrada.");
    const software = byKind(projection.resources, "SoftwareCatalog");
    const forms = byKind(projection.resources, "FormCatalog");
    const data = byKind(projection.resources, "DataAssetCatalog");
    const access = byKind(projection.resources, "AccessCatalog");
    const automation = byKind(projection.resources, "AutomationCatalog");
    const provenance = byKind(projection.resources, "ProvenanceCatalog");
    const operationKeys = new Set(trace.completionActions.flatMap((action) => action.operationRefs));
    const formKeys = new Set(trace.completionActions.flatMap((action) => action.formRefs));
    return { element, trace,
      entryPoints: software?.spec.entryPoints.filter((item) => trace.interactionPointRefs.includes(item.key)) ?? [],
      operations: software?.spec.operations.filter((item) => operationKeys.has(item.key)).map((item) => ({ ...item, approval: projection.bindingApprovals.find((approval) => approval.semanticKey === item.key)?.status ?? "NOT_REQUIRED" })) ?? [],
      forms: forms?.spec.forms.filter((item) => formKeys.has(item.key)) ?? [], dataAssets: data?.spec.assets.filter((item) => [...trace.inputRefs, ...trace.outputRefs].includes(item.key)) ?? [],
      policies: access?.spec.policies.filter((item) => trace.completionActions.some((action) => action.policyRefs.includes(item.key))) ?? [], timingPolicies: automation?.spec.timingPolicies.filter((item) => trace.timingPolicyRefs.includes(item.key)) ?? [],
      evidence: provenance?.spec.evidence.filter((item) => trace.evidenceRefs.includes(item.key) || item.validatesRefs.includes(trace.activityRef)) ?? [],
      divergences: provenance?.spec.evidence.filter((item) => Boolean(item.discrepancy) && (trace.evidenceRefs.includes(item.key) || item.validatesRefs.includes(trace.activityRef))) ?? [],
    };
  }

  async accessMatrix(locator: string, headers?: Record<string, string | undefined>) {
    const projection = await this.projection(locator, "TECHNICAL", headers) as { resources: ProcessBundleV2Resource[] };
    const access = byKind(projection.resources, "AccessCatalog");
    const traces = byKind(projection.resources, "OperationalTraceabilityCatalog");
    if (!access || !traces) return [];
    return access.spec.grants.flatMap((grant) => grant.subjectRefs.flatMap((subjectRef) => grant.actionRefs.map((actionRef) => ({ subjectRef, actionRef, activityRefs: traces.spec.activities.filter((activity) => activity.completionActions.some((action) => action.key === actionRef)).map((activity) => activity.activityRef), policyRefs: grant.policyRefs, resourceRefs: grant.resourceRefs }))));
  }

  private async assertUnitCapability(unitId: string, capability: string, headers?: Record<string, string | undefined>) {
    return this.authorization.assertUnitCapability(unitId, capability, headers);
  }
}
