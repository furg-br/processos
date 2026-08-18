import { createHash } from "node:crypto";
import type { ProcessBundleV2Manifest } from "@furg/processos-contracts";
import { processBundleV2ManifestSchema } from "@furg/processos-contracts";
import JSZip from "jszip";
import type { BuildBundleFile } from "./types.js";

const bytes = (content: string | Uint8Array) => typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
export const sha256 = (content: string | Uint8Array) => createHash("sha256").update(bytes(content)).digest("hex");

export type BuildBundleInput = Omit<ProcessBundleV2Manifest, "format" | "version" | "contractVersion" | "files"> & {
  files: BuildBundleFile[];
};

export async function buildProcessBundleV2(input: BuildBundleInput): Promise<Buffer> {
  const files = input.files.map((file) => ({
    path: file.path,
    mediaType: file.mediaType,
    sha256: sha256(file.content),
    size: bytes(file.content).byteLength,
    visibility: file.visibility,
    required: file.required ?? true,
  }));
  const manifest = processBundleV2ManifestSchema.parse({
    format: "furg.process-bundle",
    version: "2.0",
    contractVersion: "processos.furg.br/v2",
    profile: input.profile,
    processDefinitionKey: input.processDefinitionKey,
    processVersionId: input.processVersionId,
    bindingSetVersionId: input.bindingSetVersionId,
    releaseId: input.releaseId,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    files,
  });

  const zip = new JSZip();
  zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of input.files) zip.file(file.path, file.content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}
