import type { ProcessBundleV2Resource } from "@furg/processos-contracts";

export function createPublicProcessProjection(resources: ProcessBundleV2Resource[]) {
  const definition = resources.find((resource) => resource.kind === "ProcessDefinition");
  const catalog = resources.find((resource) => resource.kind === "ProjectionCatalog");
  if (!definition || definition.kind !== "ProcessDefinition") throw new Error("ProcessDefinition ausente.");
  if (!catalog || catalog.kind !== "ProjectionCatalog") throw new Error("ProjectionCatalog ausente.");
  const projection = catalog.spec.projections.find((item) => item.audience === "PUBLIC");
  if (!projection) throw new Error("Projeção pública ausente.");
  return {
    apiVersion: "processos.furg.br/public/v1" as const,
    process: { key: definition.metadata.key, title: definition.metadata.title, description: definition.metadata.description, version: definition.metadata.version },
    projection: {
      key: projection.key, title: projection.title, summary: projection.summary,
      phases: projection.phases.map((phase) => ({ key: phase.key, label: phase.label, description: phase.description, responsibleLabel: phase.responsibleLabel, expectedDurationLabel: phase.expectedDurationLabel, nextPhaseRefs: phase.nextPhaseRefs })),
    },
  };
}
