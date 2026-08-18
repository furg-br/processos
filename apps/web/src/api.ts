import type { CreateProcessInput, OrganizationUnit, ProcessBundleV2Resource, ProcessDetail, ProcessRelation, ProcessSummary, SoftwareOperation, UpdateProcessInput } from "@furg/processos-contracts";
import { getAccessToken } from "./identity";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const demoHeaders = {
  "x-user-id": "00000000-0000-4000-8000-000000000001",
  "x-user-name": "Curadoria de demonstração",
  "x-platform-role": import.meta.env.VITE_DEMO_PLATFORM_ROLE ?? "UNIT_EDITOR",
  "x-unit-ids": import.meta.env.VITE_DEMO_UNIT_IDS ?? "",
  "content-type": "application/json",
};

export type ImportProcessResult = {
  kind: "bpmn" | "process-bundle" | "process-bundle-v2" | "binding-set-v2";
  processId: string;
  versionId?: string;
  revision?: number;
  warnings: Array<{ severity: string; code?: string; message: string }>;
};

export type BundleDryRunResult = {
  importId: string;
  status: "VALIDATED" | "REJECTED";
  valid: boolean;
  readyToApply: boolean;
  issues: Array<{ severity: "error" | "warning"; code: string; path?: string; message: string }>;
  coverage: { bpmnActivities: number; boundActivities: number; tracedActivities: number; completeMappings: number; operations: number; entryPoints: number; forms: number; dataAssets: number; evidence: number; publicPhases: number };
  manifest?: { profile: string; processDefinitionKey: string; processVersionId: string };
  requiresCgtiApproval: boolean;
  technicalBindingsWillBe: "PENDING_CGTI_APPROVAL" | "APPROVED";
  institutionalUnitMappings: Array<{
    reference: string;
    role: "OWNER" | "PARTICIPANT";
    bundleAcronym: string;
    bundleLabel: string;
    status: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS";
    resolvedUnit?: { id: string; externalId: string; acronym: string; name: string };
    candidates: Array<{ id: string; externalId: string; acronym: string; name: string }>;
  }>;
  diff: { createsNewProcess?: boolean; processId?: string; currentVersionId?: string; incomingVersionId?: string; sameContent?: boolean };
};

export type ProcessV2Projection = {
  process: { id: string; slug: string; title: string; description: string; ownerUnit: { acronym: string; name: string } };
  version: { id: string; revision: number; profile?: string; status?: string; bindingSetVersionId?: string; bindingStatus?: string; releaseId?: string };
  bpmnXml?: string;
  resources?: ProcessBundleV2Resource[];
  projection?: { title: string; summary: string; phases: Array<{ key: string; label: string; description: string; responsibleLabel: string; expectedDurationLabel?: string; nextPhaseRefs: string[] }> };
  bindingApprovals?: Array<{ semanticKey: string; status: string }>;
  bindingSets?: Array<{ id: string; revision: number; status: string; createdAt: string; reviewedAt?: string; reviewNote?: string; approvals: Array<{ semanticKey: string; status: string; note?: string }> }>;
  capabilities?: { canReviewTechnicalBindings: boolean };
};

export type DeleteDraftVersionResult = {
  deletedVersionId: string;
  deletedProcess: boolean;
  process?: ProcessDetail;
};

export type AuthoringState = {
  version: { id: string; revision: number; status: string; immutable: boolean; bindingSetVersionId: string };
  editable: boolean;
  resources: Array<{ path: string; kind: string; semanticKey: string; visibility: string; content: ProcessBundleV2Resource }>;
  responsibilities: {
    ownerUnit: OrganizationUnit;
    participantUnits: Array<OrganizationUnit & { role: string }>;
  };
  validation: {
    valid: boolean;
    issues: Array<{ severity: "error" | "warning"; code: string; path?: string; message: string }>;
    coverage: Record<string, number>;
  };
  capabilities: { canEdit: boolean; canEditTechnical: boolean };
};

export type RelationInput = {
  targetProcessId: string;
  type: "DECOMPOSES" | "CALLS" | "PRECEDES" | "EXCHANGES_INFORMATION" | "RELATED_TO";
  label?: string;
  sourceElementId?: string;
};

export type SoftwareFunctionality = { id: string; name: string; module: { id: string; name: string; system: { id: string; name: string } } };
export type SoftwareOperationInput = { functionalityId: string; operationId: string; method?: string; path?: string; version: string; deprecated?: boolean };
export type CatalogSoftwareOperation = SoftwareOperation & { functionalityId: string; deprecated: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...demoHeaders, ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    const message = typeof body.message === "string" ? body.message : "A operação não pôde ser concluída.";
    const details = Array.isArray(body.issues)
      ? body.issues.slice(0, 3).map((issue: { message?: string; path?: string }) => `${issue.message ?? "Inconsistência encontrada"}${issue.path ? ` (${issue.path})` : ""}`).join(" ")
      : "";
    throw new Error(details ? `${message} ${details}` : message);
  }
  return response.json() as Promise<T>;
}

export async function listProcesses(): Promise<ProcessSummary[]> {
  return request<ProcessSummary[]>("/processes");
}

export async function listProcessRelations(): Promise<ProcessRelation[]> {
  return request<ProcessRelation[]>("/processes/relations/catalog");
}

export async function getProcess(locator: string): Promise<ProcessDetail> {
  return request<ProcessDetail>(`/processes/${encodeURIComponent(locator)}`);
}

export async function listOrganizations(): Promise<OrganizationUnit[]> {
  return request<OrganizationUnit[]>("/catalog/organizations");
}

export async function createProcess(input: CreateProcessInput): Promise<{ id: string; slug: string; title: string }> {
  return request<{ id: string; slug: string; title: string }>("/processes", { method: "POST", body: JSON.stringify(input) });
}

export async function importProcess(input: {
  fileName: string;
  contentBase64: string;
  title?: string;
  slug?: string;
  ownerUnitId?: string;
}): Promise<ImportProcessResult> {
  return request<ImportProcessResult>("/processes/import", { method: "POST", body: JSON.stringify(input) });
}

export async function dryRunProcessBundle(input: { fileName: string; contentBase64: string }): Promise<BundleDryRunResult> {
  return request<BundleDryRunResult>("/process-bundles/imports/dry-run", { method: "POST", body: JSON.stringify(input) });
}

export async function applyProcessBundle(importId: string, unitMappings: Array<{ reference: string; unitId: string; role: "OWNER" | "PARTICIPANT" }>): Promise<ImportProcessResult> {
  return request<ImportProcessResult>(`/process-bundles/imports/${importId}/apply`, { method: "POST", body: JSON.stringify({ unitMappings }) });
}

export async function getProcessV2Projection(locator: string, audience: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" = "TECHNICAL") {
  return request<ProcessV2Projection>(`/processes/${encodeURIComponent(locator)}/projection?audience=${audience}`);
}

export async function getProcessV2Activity(locator: string, semanticId: string) {
  return request<any>(`/processes/${encodeURIComponent(locator)}/activities/${encodeURIComponent(semanticId)}`);
}

export async function getProcessAccessMatrix(locator: string) {
  return request<Array<{ subjectRef: string; actionRef: string; activityRefs: string[]; policyRefs: string[]; resourceRefs: string[] }>>(`/processes/${encodeURIComponent(locator)}/access-matrix`);
}

export async function reviewTechnicalBindings(processId: string, versionId: string, input: { bindingSetVersionId: string; semanticKeys: string[]; decision: "APPROVED" | "REJECTED"; note?: string }) {
  return request<{ reviewed: number; pending: number; rejected: number; releaseId?: string }>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/technical-bindings/review`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateProcessMetadata(processId: string, versionId: string, input: UpdateProcessInput): Promise<ProcessDetail> {
  return request<ProcessDetail>(`/processes/${processId}/versions/${versionId}/metadata`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function getAuthoringState(processId: string, versionId: string) {
  return request<AuthoringState>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/authoring`);
}

export async function updateContractResource(processId: string, versionId: string, resourceKey: string, content: ProcessBundleV2Resource, reason: string) {
  return request<{ resource: ProcessBundleV2Resource; validation: AuthoringState["validation"]; bundleHash: string }>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/contract-resources/${encodeURIComponent(resourceKey)}`, { method: "PATCH", body: JSON.stringify({ content, reason }) });
}

export async function updateResponsibilities(processId: string, versionId: string, input: { ownerUnitId: string; participantUnitIds: string[]; reason: string }) {
  return request<{ resource: ProcessBundleV2Resource; validation: AuthoringState["validation"]; bundleHash: string }>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/responsibilities`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function forkProcessVersion(processId: string, versionId: string) {
  return request<{ processId: string; versionId: string; revision: number; bindingSetVersionId: string; releaseId: string }>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/fork-v2`, { method: "POST" });
}

export async function createProcessRelation(processId: string, versionId: string, input: RelationInput) {
  return request<ProcessDetail>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/relations`, { method: "POST", body: JSON.stringify(input) });
}

export async function updateProcessRelation(processId: string, versionId: string, relationId: string, input: Omit<RelationInput, "targetProcessId">) {
  return request<ProcessDetail>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/relations/${encodeURIComponent(relationId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteProcessRelation(processId: string, versionId: string, relationId: string) {
  return request<ProcessDetail>(`/processes/${encodeURIComponent(processId)}/versions/${encodeURIComponent(versionId)}/relations/${encodeURIComponent(relationId)}`, { method: "DELETE" });
}

export async function listOperations(): Promise<CatalogSoftwareOperation[]> {
  const data = await request<any[]>("/catalog/software/operations");
  return data.map((item) => ({
    id: item.id, system: item.functionality.module.system.name, module: item.functionality.module.name,
    functionality: item.functionality.name, functionalityId: item.functionalityId, operationId: item.operationId, method: item.method, path: item.path, version: item.version, deprecated: Boolean(item.deprecated),
  }));
}

export async function listSchemas() {
  const data = await request<any[]>("/catalog/information-schemas");
  return data.map((item) => ({ ...item, name: item.asset.name, createdAt: item.createdAt }));
}

export async function createInformationSchema(input: { assetId?: string; name: string; slug: string; description: string; kind: string; visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED"; jsonSchema: Record<string, unknown> }) {
  return request<any>("/catalog/information-schemas", { method: "POST", body: JSON.stringify(input) });
}

export async function listSoftwareFunctionalities() {
  return request<SoftwareFunctionality[]>("/catalog/software/functionalities");
}

export async function importOpenApi(functionalityId: string, document: string) {
  return request<{ imported: number; title?: string; version: string }>("/catalog/software/openapi/import", { method: "POST", body: JSON.stringify({ functionalityId, document }) });
}

export async function createSoftwareOperation(input: SoftwareOperationInput) {
  return request<any>("/catalog/software/operations", { method: "POST", body: JSON.stringify(input) });
}

export async function updateSoftwareOperation(id: string, input: SoftwareOperationInput) {
  return request<any>(`/catalog/software/operations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteSoftwareOperation(id: string) {
  return request<{ deleted: boolean }>(`/catalog/software/operations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function acquireLease(processId: string, versionId: string) {
  return request<{ token: string; expiresAt: string }>(`/processes/${processId}/versions/${versionId}/lease`, { method: "POST" });
}

export async function renewLease(token: string) {
  return request<{ token: string; expiresAt: string }>(`/processes/leases/${token}`, { method: "PATCH" });
}

export async function releaseLease(token: string) {
  return request<{ released: boolean }>(`/processes/leases/${token}`, { method: "DELETE", keepalive: true });
}

export async function saveBpmn(processId: string, versionId: string, bpmnXml: string, leaseToken: string) {
  return request<{ savedAt: string; issues: Array<{ severity: string; message: string }> }>(`/processes/${processId}/versions/${versionId}/bpmn`, {
    method: "PATCH", body: JSON.stringify({ bpmnXml, leaseToken }),
  });
}

export async function transition(processId: string, versionId: string, action: string, note?: string) {
  return request(`/processes/${processId}/versions/${versionId}/transitions`, { method: "POST", body: JSON.stringify({ action, note }) });
}

export async function deleteDraftVersion(processId: string, versionId: string) {
  return request<DeleteDraftVersionResult>(`/processes/${processId}/versions/${versionId}`, { method: "DELETE" });
}

export async function downloadProcessBundle(processId: string, versionId: string) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${baseUrl}/processes/${processId}/versions/${versionId}/export`, {
    headers: { ...demoHeaders, ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(typeof body.message === "string" ? body.message : "O pacote não pôde ser exportado.");
  }
  return response.blob();
}
