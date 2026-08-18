import { describe, expect, it } from "vitest";
import { migrateProcessBundleV1ToV2 } from "./migrate.js";
import { buildSyntheticProcessBundleV1 } from "./testing.js";
import { validateProcessBundleV2 } from "./validate.js";

describe("migração ProcessBundle v1 para v2", () => {
  it("migra um fixture sintético sem ocultar perdas de definição técnica", async () => {
    const input = await buildSyntheticProcessBundleV1();
    const migrated = await migrateProcessBundleV1ToV2(input, "teste de migração");
    const report = await validateProcessBundleV2(migrated.bundle);

    expect(report.valid).toBe(true);
    expect(report.manifest?.profile).toBe("DOCUMENTARY");
    expect(report.coverage.bpmnActivities).toBe(2);
    expect(report.coverage.boundActivities).toBe(2);
    expect(migrated.warnings.some((warning) => warning.code === "SOFTWARE_DEFINITION_MISSING")).toBe(true);
  });
});
