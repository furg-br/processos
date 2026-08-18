import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateProcessBundleV1ToV2 } from "./migrate.js";
import { validateProcessBundleV2 } from "./validate.js";

describe("migração ProcessBundle v1 para v2", () => {
  it("migra o fixture RSC sem ocultar perdas de definição técnica", async () => {
    const input = await readFile(resolve(import.meta.dirname, "../../../artifacts/rsc-as-is/rsc-as-is.process-bundle.zip"));
    const migrated = await migrateProcessBundleV1ToV2(input, "teste de migração");
    const report = await validateProcessBundleV2(migrated.bundle);

    expect(report.valid).toBe(true);
    expect(report.manifest?.profile).toBe("DOCUMENTARY");
    expect(report.coverage.bpmnActivities).toBe(18);
    expect(report.coverage.boundActivities).toBe(18);
    expect(migrated.warnings.some((warning) => warning.code === "SOFTWARE_DEFINITION_MISSING")).toBe(true);
  });
});
