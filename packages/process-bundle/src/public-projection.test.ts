import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProcessBundleV2 } from "./validate.js";
import { createPublicProcessProjection } from "./public-projection.js";

describe("projeção pública", () => {
  it("remove fisicamente referências e recursos internos do RSC", async () => {
    const bundle = await readFile(resolve(import.meta.dirname, "../../../artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip"));
    const report = await validateProcessBundleV2(bundle);
    const output = createPublicProcessProjection(report.resources);
    const serialized = JSON.stringify(output);

    expect(output.projection.phases).toHaveLength(7);
    expect(serialized).not.toContain("internalElementRefs");
    expect(serialized).not.toContain("processar_envio_sei.php");
    expect(serialized).not.toContain("politica.rsc");
    expect(serialized).not.toContain("job.rsc");
  });
});
