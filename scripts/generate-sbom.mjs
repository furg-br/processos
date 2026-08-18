import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = parse(await readFile(resolve(root, "pnpm-lock.yaml"), "utf8"));
const components = [];
for (const [locator, descriptor] of Object.entries(lock.packages ?? {})) {
  const clean = locator.replace(/\(.+$/, "");
  const separator = clean.lastIndexOf("@");
  if (separator <= 0) continue;
  const name = clean.slice(0, separator);
  const version = clean.slice(separator + 1);
  if (!name || !version || version.startsWith("file:") || version.startsWith("link:")) continue;
  const component = { type: "library", "bom-ref": `pkg:npm/${name.replace("@", "%40").replace("/", "%2F")}@${version}`, name, version, purl: `pkg:npm/${name.replace("@", "%40").replace("/", "%2F")}@${version}` };
  const integrity = descriptor?.resolution?.integrity;
  if (typeof integrity === "string" && integrity.startsWith("sha512-")) component.hashes = [{ alg: "SHA-512", content: integrity.slice(7) }];
  components.push(component);
}
components.sort((left, right) => left.purl.localeCompare(right.purl));
const document = {
  bomFormat: "CycloneDX", specVersion: "1.6", serialNumber: `urn:uuid:${crypto.randomUUID()}`, version: 1,
  metadata: { timestamp: new Date().toISOString(), component: { type: "application", name: "catalogo-processos-furg", version: "0.2.0", licenses: [{ license: { id: "MIT" } }] }, tools: { components: [{ type: "application", name: "processos-furg-sbom", version: "1" }] } },
  components,
};
const output = resolve(root, "artifacts/sbom.cdx.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`SBOM CycloneDX 1.6: ${components.length} componentes em ${output}`);
