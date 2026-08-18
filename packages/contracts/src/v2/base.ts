import { z } from "zod";

export const processBundleV2ApiVersion = "processos.furg.br/v2" as const;

export const semanticKeySchema = z.string()
  .min(3)
  .max(200)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Use uma chave semântica estável em minúsculas.");

export const visibilityV2Schema = z.enum(["PUBLIC", "INSTITUTIONAL", "TECHNICAL", "RESTRICTED"]);
export const conformanceProfileSchema = z.enum(["DOCUMENTARY", "ANALYZABLE", "IMPLEMENTABLE", "EXECUTABLE"]);
export const executionModeSchema = z.enum(["HUMAN_UI", "HUMAN_EXTERNAL", "AUTOMATED", "HYBRID", "INTEGRATION"]);
export const evidenceStatusSchema = z.enum(["OBSERVED", "IMPLEMENTED", "DOCUMENTED", "INFERRED", "VALIDATED", "CONTESTED"]);
export const lifecycleStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "SUPERSEDED", "ARCHIVED"]);

export const localizedTextSchema = z.object({
  ptBR: z.string().min(1),
  en: z.string().min(1).optional(),
});

export const resourceMetadataSchema = z.object({
  id: z.string().uuid(),
  key: semanticKeySchema,
  version: z.string().min(1),
  visibility: visibilityV2Schema,
  status: lifecycleStatusSchema.default("DRAFT"),
  title: z.string().min(1).max(240),
  description: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  labels: z.record(z.string()).default({}),
});

export const resourceRefSchema = z.object({
  kind: z.string().min(1),
  key: semanticKeySchema,
  version: z.string().min(1).optional(),
});

export const sourceLocationSchema = z.object({
  repository: z.string().min(1).optional(),
  commit: z.string().min(7).optional(),
  tag: z.string().optional(),
  pullRequest: z.string().optional(),
  path: z.string().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  url: z.string().url().optional(),
}).refine((value) => Boolean(value.repository || value.path || value.url), {
  message: "Informe repositório, caminho ou URL da evidência.",
});

export const resourceEnvelopeBaseSchema = z.object({
  apiVersion: z.literal(processBundleV2ApiVersion),
  kind: z.string().min(1),
  metadata: resourceMetadataSchema,
});

export type VisibilityV2 = z.infer<typeof visibilityV2Schema>;
export type ConformanceProfile = z.infer<typeof conformanceProfileSchema>;
export type ExecutionMode = z.infer<typeof executionModeSchema>;
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type ResourceMetadata = z.infer<typeof resourceMetadataSchema>;
export type ResourceRef = z.infer<typeof resourceRefSchema>;
