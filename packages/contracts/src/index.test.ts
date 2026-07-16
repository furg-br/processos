import { describe, expect, it } from "vitest";
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
});
