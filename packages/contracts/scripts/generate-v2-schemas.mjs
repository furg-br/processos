import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  accessCatalogResourceSchema,
  automationCatalogResourceSchema,
  dataAssetCatalogResourceSchema,
  elementBindingCatalogResourceSchema,
  formCatalogResourceSchema,
  operationalTraceabilityResourceSchema,
  phaseCatalogResourceSchema,
  processBundleV2ManifestSchema,
  processDefinitionResourceSchema,
  processReleaseResourceSchema,
  projectionCatalogResourceSchema,
  provenanceCatalogResourceSchema,
  softwareCatalogResourceSchema,
  institutionalContextCatalogResourceSchema,
  decisionCatalogResourceSchema,
  stateCatalogResourceSchema,
  communicationCatalogResourceSchema,
  processObservationEventSchema,
} from "../dist/index.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "schemas/v2");
await mkdir(output, { recursive: true });

const schemas = {
  "manifest.schema.json": ["ProcessBundleV2Manifest", processBundleV2ManifestSchema],
  "process-definition.schema.json": ["ProcessDefinition", processDefinitionResourceSchema],
  "phase-catalog.schema.json": ["PhaseCatalog", phaseCatalogResourceSchema],
  "element-bindings.schema.json": ["ElementBindingCatalog", elementBindingCatalogResourceSchema],
  "operational-traceability.schema.json": ["OperationalTraceabilityCatalog", operationalTraceabilityResourceSchema],
  "data-assets.schema.json": ["DataAssetCatalog", dataAssetCatalogResourceSchema],
  "forms.schema.json": ["FormCatalog", formCatalogResourceSchema],
  "software.schema.json": ["SoftwareCatalog", softwareCatalogResourceSchema],
  "access.schema.json": ["AccessCatalog", accessCatalogResourceSchema],
  "automation.schema.json": ["AutomationCatalog", automationCatalogResourceSchema],
  "projections.schema.json": ["ProjectionCatalog", projectionCatalogResourceSchema],
  "provenance.schema.json": ["ProvenanceCatalog", provenanceCatalogResourceSchema],
  "release.schema.json": ["ProcessRelease", processReleaseResourceSchema],
  "institutional-context.schema.json": ["InstitutionalContextCatalog", institutionalContextCatalogResourceSchema],
  "decisions.schema.json": ["DecisionCatalog", decisionCatalogResourceSchema],
  "states.schema.json": ["StateCatalog", stateCatalogResourceSchema],
  "communications.schema.json": ["CommunicationCatalog", communicationCatalogResourceSchema],
  "process-observation-event.schema.json": ["ProcessObservationEvent", processObservationEventSchema],
};

for (const [file, [name, schema]] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, {
    name,
    target: "jsonSchema2019-09",
    $refStrategy: "root",
    errorMessages: true,
  });
  jsonSchema.$schema = "https://json-schema.org/draft/2020-12/schema";
  jsonSchema.$id = `https://processos.furg.br/schemas/v2/${file}`;
  await writeFile(resolve(output, file), `${JSON.stringify(jsonSchema, null, 2)}\n`, "utf8");
}

console.log(`Generated ${Object.keys(schemas).length} schemas in ${output}`);
