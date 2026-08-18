import { randomUUID } from "node:crypto";
import { extractBpmnOutline } from "@furg/processos-bpmn";
import { processBundleMetadataSchema, type ProcessBundleMetadata } from "@furg/processos-contracts";
import JSZip from "jszip";
import { buildProcessBundleV2 } from "./build.js";

export type MigrationWarning = { code: string; message: string; path?: string };
export type MigrationResult = { bundle: Buffer; warnings: MigrationWarning[] };

const envelopeMetadata = (key: string, title: string, version: string, visibility: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED", now: string) => ({
  id: randomUUID(), key, version, visibility, status: "DRAFT" as const, title, createdAt: now, updatedAt: now, labels: {},
});

export async function migrateProcessBundleV1ToV2(input: Buffer | Uint8Array, createdBy = "process-bundle-migrator"): Promise<MigrationResult> {
  const zip = await JSZip.loadAsync(input);
  const metadataEntry = zip.file("metadata.json");
  const bpmnEntry = zip.file("process.bpmn");
  if (!metadataEntry || !bpmnEntry) throw new Error("ProcessBundle v1 exige metadata.json e process.bpmn.");
  const metadata = processBundleMetadataSchema.parse(JSON.parse(await metadataEntry.async("string"))) as ProcessBundleMetadata;
  const bpmnXml = await bpmnEntry.async("string");
  const now = new Date().toISOString();
  const processKey = `processo.${metadata.process.slug.replaceAll("-", ".")}`;
  const processVersionId = randomUUID();
  const bindingSetVersionId = randomUUID();
  const releaseId = randomUUID();
  const warnings: MigrationWarning[] = [];
  const outline = extractBpmnOutline(bpmnXml);
  const metadataByElement = new Map(metadata.elements.map((element) => [element.bpmnElementId, element]));
  const elements = outline.map((element) => ({
    bpmnElementId: element.id,
    semanticId: `${processKey}.${element.id.toLowerCase().replaceAll(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}`,
    elementType: element.type,
    label: element.name,
    visibility: metadata.process.visibility === "PUBLIC" ? "PUBLIC" as const : "INSTITUTIONAL" as const,
  }));
  const semanticByBpmn = new Map(elements.map((element) => [element.bpmnElementId, element.semanticId]));
  const activities = metadata.elements.map((element) => {
    const semanticId = semanticByBpmn.get(element.bpmnElementId);
    if (!semanticId) warnings.push({ code: "ELEMENT_NOT_FOUND", path: element.bpmnElementId, message: "Binding v1 sem elemento correspondente no BPMN." });
    if (element.softwareBindings.length > 0) warnings.push({ code: "SOFTWARE_DEFINITION_MISSING", path: element.bpmnElementId, message: "O v1 contém UUIDs de operações, mas não suas definições portáveis." });
    return {
      activityRef: semanticId ?? `${processKey}.nao.resolvido.${element.bpmnElementId.toLowerCase()}`,
      executionMode: element.softwareBindings.length > 0 ? "HYBRID" as const : "HUMAN_EXTERNAL" as const,
      actorRefs: element.role ? [`papel.${element.role.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}`] : [],
      organizationUnitRefs: [],
      interactionPointRefs: [],
      completionActions: [],
      inputRefs: [], outputRefs: [], timingPolicyRefs: [], evidenceRefs: [],
      externalProcedure: element.softwareBindings.length === 0 ? { location: "Não informado no ProcessBundle v1" } : undefined,
      mappingStatus: "PARTIAL" as "COMPLETE" | "PARTIAL" | "NOT_APPLICABLE" | "UNKNOWN",
      gapReason: "Migração automática do v1 requer curadoria de aplicações, ações, operações e efeitos.",
    };
  });
  for (const element of outline.filter((item) => !metadataByElement.has(item.id) && ["task", "userTask", "serviceTask", "manualTask", "businessRuleTask", "callActivity", "subProcess"].includes(item.type))) {
    activities.push({
      activityRef: semanticByBpmn.get(element.id)!, executionMode: "HUMAN_EXTERNAL", actorRefs: [], organizationUnitRefs: [], interactionPointRefs: [], completionActions: [], inputRefs: [], outputRefs: [], timingPolicyRefs: [], evidenceRefs: [], externalProcedure: { location: "Não informado no ProcessBundle v1" }, mappingStatus: "UNKNOWN", gapReason: "Atividade sem metadados no bundle v1.",
    });
  }

  const visibility = metadata.process.visibility === "PUBLIC" ? "PUBLIC" as const : "INSTITUTIONAL" as const;
  const processResource = { apiVersion: "processos.furg.br/v2", kind: "ProcessDefinition", metadata: envelopeMetadata(processKey, metadata.process.title, String(metadata.version.revision), visibility, now), spec: { definitionId: metadata.process.id, processVersionId, bindingSetVersionId, releaseId, profile: "DOCUMENTARY", perspective: metadata.version.perspective, ownerUnitRef: `unidade.${metadata.process.ownerUnit.acronym.toLowerCase()}`, participantUnitRefs: metadata.process.participantUnits.map((unit) => `unidade.${unit.acronym.toLowerCase()}`), taxonomyRefs: [], audienceRefs: [], bpmnPath: "process/process.bpmn", normativeBasisRefs: [] } };
  const elementResource = { apiVersion: "processos.furg.br/v2", kind: "ElementBindingCatalog", metadata: envelopeMetadata(`${processKey}.elementos`, "Identidades semânticas", "1", "INSTITUTIONAL", now), spec: { elements } };
  const traceResource = { apiVersion: "processos.furg.br/v2", kind: "OperationalTraceabilityCatalog", metadata: envelopeMetadata(`${processKey}.rastreabilidade`, "Rastreabilidade operacional", "1", "INSTITUTIONAL", now), spec: { activities } };

  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const bundle = await buildProcessBundleV2({
    profile: "DOCUMENTARY",
    processDefinitionKey: processKey,
    processVersionId,
    bindingSetVersionId,
    releaseId,
    createdAt: now,
    createdBy,
    files: [
      { path: "process/process.bpmn", content: bpmnXml, mediaType: "application/xml", visibility },
      { path: "process/process.json", content: json(processResource), mediaType: "application/json", visibility },
      { path: "bindings/elements.json", content: json(elementResource), mediaType: "application/json", visibility: "INSTITUTIONAL" },
      { path: "bindings/operational-traceability.json", content: json(traceResource), mediaType: "application/json", visibility: "INSTITUTIONAL" },
    ],
  });
  return { bundle, warnings };
}
