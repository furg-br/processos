import { z } from "zod";
import { conformanceProfileSchema, semanticKeySchema, visibilityV2Schema } from "./base.js";

export const bundleFileSchema = z.object({
  path: z.string().min(1).max(512).refine((path) => !path.startsWith("/") && !path.includes("..") && !path.includes("\\"), {
    message: "O caminho deve ser relativo e não pode escapar do bundle.",
  }),
  mediaType: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  visibility: visibilityV2Schema,
  required: z.boolean().default(true),
});

export const processBundleV2ManifestSchema = z.object({
  format: z.literal("furg.process-bundle"),
  version: z.literal("2.0"),
  contractVersion: z.literal("processos.furg.br/v2"),
  profile: conformanceProfileSchema,
  processDefinitionKey: semanticKeySchema,
  processVersionId: z.string().uuid(),
  bindingSetVersionId: z.string().uuid(),
  releaseId: z.string().uuid(),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1),
  files: z.array(bundleFileSchema).min(4).max(500),
}).superRefine((manifest, context) => {
  const paths = new Set<string>();
  for (const [index, file] of manifest.files.entries()) {
    if (paths.has(file.path)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["files", index, "path"], message: "Arquivo duplicado no manifesto." });
    }
    paths.add(file.path);
  }
  for (const required of ["process/process.bpmn", "process/process.json", "bindings/elements.json", "bindings/operational-traceability.json"]) {
    if (!paths.has(required)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: `Arquivo obrigatório ausente: ${required}.` });
    }
  }
});

export type ProcessBundleV2Manifest = z.infer<typeof processBundleV2ManifestSchema>;
export type BundleFile = z.infer<typeof bundleFileSchema>;
