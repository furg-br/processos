import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessInputSchema, processBundleManifestSchema, statusLabels, updateProcessInputSchema } from "./index";

describe("contratos públicos", () => {
  it("mantém rótulos em português para todo estado", () => {
    expect(Object.keys(statusLabels)).toHaveLength(7);
    expect(statusLabels.PUBLISHED).toBe("Publicado");
  });

  it("rejeita versão desconhecida de ProcessBundle", () => {
    expect(processBundleManifestSchema.safeParse({ format: "furg.process-bundle", version: "2.0" }).success).toBe(false);
  });

  it("aplica AS-IS como perspectiva inicial de um novo processo", () => {
    const parsed = createProcessInputSchema.parse({
      title: "Aquisição de material",
      description: "Organiza a aquisição de material permanente.",
      category: "Compras",
      audience: "Unidades administrativas",
      visibility: "INTERNAL",
      ownerUnitId: "00000000-0000-4000-8000-000000000001",
      bpmnXml: "<definitions />",
    });
    expect(parsed.perspective).toBe("AS_IS");
  });

  it("valida os dados cadastrais editáveis do processo", () => {
    expect(updateProcessInputSchema.safeParse({
      title: "Aquisição de material",
      description: "Organiza a aquisição de material permanente.",
      category: "Compras",
      audience: "Unidades administrativas",
      visibility: "INTERNAL",
      ownerUnitId: "00000000-0000-4000-8000-000000000001",
      perspective: "TO_BE",
    }).success).toBe(true);
  });

  it("publica JSON Schema consumível sem depender do runtime Zod", async () => {
    const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
    const schema = JSON.parse(await readFile(resolve(packageRoot, "schemas/v2/process-definition.schema.json"), "utf8"));
    const fixture = JSON.parse(await readFile(resolve(packageRoot, "../../artifacts/rsc-as-is/v2/process/process.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(fixture), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });
});
