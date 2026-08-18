import { describe, expect, it } from "vitest";
import { validateProcessBundleV2 } from "./validate.js";
import { createPublicProcessProjection } from "./public-projection.js";
import { buildSyntheticProcessBundleV2 } from "./testing.js";

describe("projeção pública", () => {
  it("remove fisicamente referências e recursos internos", async () => {
    const bundle = await buildSyntheticProcessBundleV2();
    const report = await validateProcessBundleV2(bundle);
    const output = createPublicProcessProjection(report.resources);
    const serialized = JSON.stringify(output);

    expect(output.projection.phases).toHaveLength(1);
    expect(serialized).not.toContain("internalElementRefs");
    expect(serialized).not.toContain("politica.teste");
    expect(serialized).not.toContain("job.teste");
  });
});
