import { z } from "zod";

export const visibilitySchema = z.enum(["PUBLIC", "INTERNAL", "RESTRICTED"]);
export const perspectiveSchema = z.enum(["AS_IS", "TO_BE"]);
export const versionStatusSchema = z.enum([
  "DRAFT",
  "UNIT_REVIEW",
  "CURATOR_REVIEW",
  "PUBLISHED",
  "CHANGES_REQUESTED",
  "SUPERSEDED",
  "ARCHIVED",
]);
export const relationTypeSchema = z.enum([
  "DECOMPOSES",
  "CALLS",
  "PRECEDES",
  "EXCHANGES_INFORMATION",
  "RELATED_TO",
]);
export const softwareBindingKindSchema = z.enum([
  "SUPPORTS",
  "AUTOMATES",
  "INVOKES",
  "STARTS",
  "RECEIVES",
]);
export const dataDirectionSchema = z.enum(["INPUT", "OUTPUT"]);

export type Visibility = z.infer<typeof visibilitySchema>;
export type Perspective = z.infer<typeof perspectiveSchema>;
export type VersionStatus = z.infer<typeof versionStatusSchema>;
export type RelationType = z.infer<typeof relationTypeSchema>;
export type SoftwareBindingKind = z.infer<typeof softwareBindingKindSchema>;
export type DataDirection = z.infer<typeof dataDirectionSchema>;

export const organizationUnitSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(),
  acronym: z.string(),
  name: z.string(),
  parentId: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

export const processRelationSchema = z.object({
  id: z.string().uuid(),
  sourceProcessId: z.string().uuid(),
  targetProcessId: z.string().uuid(),
  type: relationTypeSchema,
  label: z.string().nullable().optional(),
});

export const processVersionSummarySchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  perspective: perspectiveSchema,
  status: versionStatusSchema,
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().optional(),
});

export const processSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  audience: z.string(),
  visibility: visibilitySchema,
  ownerUnit: z.object({ id: z.string().uuid().optional(), acronym: z.string(), name: z.string() }),
  participantUnits: z.array(z.object({ acronym: z.string(), name: z.string() })),
  currentVersion: processVersionSummarySchema.nullable(),
  updatedAt: z.string().datetime(),
});

export const bpmnOutlineElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  parentId: z.string().nullable().optional(),
  incoming: z.array(z.string()).default([]),
  outgoing: z.array(z.string()).default([]),
});

export const elementMetadataSchema = z.object({
  bpmnElementId: z.string(),
  role: z.string().nullable().optional(),
  organizationUnitId: z.string().uuid().nullable().optional(),
  workDuration: z.string().nullable().optional(),
  waitDuration: z.string().nullable().optional(),
  softwareBindings: z.array(z.object({
    operationId: z.string().uuid(),
    kind: softwareBindingKindSchema,
  })).default([]),
  dataBindings: z.array(z.object({
    informationSchemaId: z.string().uuid(),
    direction: dataDirectionSchema,
  })).default([]),
});

export const processDetailSchema = processSummarySchema.extend({
  bpmnXml: z.string(),
  processSla: z.string().nullable().optional(),
  continuous: z.boolean(),
  versions: z.array(processVersionSummarySchema),
  relations: z.array(processRelationSchema),
  outline: z.array(bpmnOutlineElementSchema),
  elementMetadata: z.array(elementMetadataSchema),
});

export const createProcessInputSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().min(10).max(500),
  category: z.string().trim().min(2).max(120),
  audience: z.string().trim().min(2).max(180),
  visibility: visibilitySchema,
  ownerUnitId: z.string().uuid(),
  bpmnXml: z.string().min(1),
  perspective: perspectiveSchema.default("AS_IS"),
});

export const updateProcessInputSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(500),
  category: z.string().trim().min(2).max(120),
  audience: z.string().trim().min(2).max(180),
  visibility: visibilitySchema,
  ownerUnitId: z.string().uuid(),
  perspective: perspectiveSchema,
});

export const informationSchemaVersionSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  name: z.string(),
  version: z.number().int().positive(),
  visibility: visibilitySchema,
  jsonSchema: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const softwareOperationSchema = z.object({
  id: z.string().uuid(),
  system: z.string(),
  module: z.string(),
  functionality: z.string(),
  operationId: z.string(),
  method: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  version: z.string(),
});

export const processBundleManifestSchema = z.object({
  format: z.literal("furg.process-bundle"),
  version: z.literal("1.0"),
  processId: z.string().uuid(),
  processVersionId: z.string().uuid(),
  exportedAt: z.string().datetime(),
  files: z.array(z.string()),
  contentHash: z.string(),
});

export const processBundleMetadataSchema = z.object({
  schemaVersion: z.literal("furg.process/v1"),
  process: processSummarySchema.omit({ currentVersion: true }),
  version: processVersionSummarySchema,
  outline: z.array(bpmnOutlineElementSchema),
  elements: z.array(elementMetadataSchema),
  relations: z.array(processRelationSchema),
  informationSchemas: z.array(informationSchemaVersionSchema),
  provenance: z.object({
    exportedBy: z.string(),
    exportedAt: z.string().datetime(),
    source: z.string(),
  }),
});

export type ProcessSummary = z.infer<typeof processSummarySchema>;
export type ProcessDetail = z.infer<typeof processDetailSchema>;
export type CreateProcessInput = z.input<typeof createProcessInputSchema>;
export type UpdateProcessInput = z.input<typeof updateProcessInputSchema>;
export type OrganizationUnit = z.infer<typeof organizationUnitSchema>;
export type ProcessRelation = z.infer<typeof processRelationSchema>;
export type BpmnOutlineElement = z.infer<typeof bpmnOutlineElementSchema>;
export type ElementMetadata = z.infer<typeof elementMetadataSchema>;
export type InformationSchemaVersion = z.infer<typeof informationSchemaVersionSchema>;
export type SoftwareOperation = z.infer<typeof softwareOperationSchema>;
export type ProcessBundleManifest = z.infer<typeof processBundleManifestSchema>;
export type ProcessBundleMetadata = z.infer<typeof processBundleMetadataSchema>;

export const statusLabels: Record<VersionStatus, string> = {
  DRAFT: "Rascunho",
  UNIT_REVIEW: "Revisão da unidade",
  CURATOR_REVIEW: "Revisão da curadoria",
  PUBLISHED: "Publicado",
  CHANGES_REQUESTED: "Ajustes solicitados",
  SUPERSEDED: "Substituído",
  ARCHIVED: "Arquivado",
};

export const relationLabels: Record<RelationType, string> = {
  DECOMPOSES: "decompõe",
  CALLS: "chama",
  PRECEDES: "precede",
  EXCHANGES_INFORMATION: "troca informação",
  RELATED_TO: "relaciona-se",
};
