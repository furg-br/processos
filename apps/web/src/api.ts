import type { CreateProcessInput, OrganizationUnit, ProcessDetail, ProcessSummary, SoftwareOperation, UpdateProcessInput } from "@furg/processos-contracts";
import { demoDetails, demoOperations, demoProcesses, demoSchemas } from "./demo-data";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const demoHeaders = { "x-user-id": "00000000-0000-4000-8000-000000000001", "x-user-name": "Curadoria de demonstração", "content-type": "application/json" };

export type ImportProcessResult = {
  kind: "bpmn" | "process-bundle";
  processId: string;
  versionId?: string;
  revision?: number;
  warnings: Array<{ severity: string; code?: string; message: string }>;
};

export type DeleteDraftVersionResult = {
  deletedVersionId: string;
  deletedProcess: boolean;
  process?: ProcessDetail;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...demoHeaders, ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(typeof body.message === "string" ? body.message : "A operação não pôde ser concluída.");
  }
  return response.json() as Promise<T>;
}

export async function listProcesses(): Promise<{ data: ProcessSummary[]; offline: boolean }> {
  try { return { data: await request<ProcessSummary[]>("/processes"), offline: false }; }
  catch { return { data: demoProcesses, offline: true }; }
}

export async function getProcess(locator: string, allowDemoFallback = false): Promise<ProcessDetail> {
  try { return await request<ProcessDetail>(`/processes/${encodeURIComponent(locator)}`); }
  catch (error) {
    const fallback = allowDemoFallback
      ? Object.values(demoDetails).find((process) => process.id === locator || process.slug === locator)
      : undefined;
    if (fallback) return fallback;
    throw error;
  }
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

export async function updateProcessMetadata(processId: string, versionId: string, input: UpdateProcessInput): Promise<ProcessDetail> {
  return request<ProcessDetail>(`/processes/${processId}/versions/${versionId}/metadata`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function listOperations(): Promise<SoftwareOperation[]> {
  try {
    const data = await request<any[]>("/catalog/software/operations");
    return data.map((item) => ({
      id: item.id, system: item.functionality.module.system.name, module: item.functionality.module.name,
      functionality: item.functionality.name, operationId: item.operationId, method: item.method, path: item.path, version: item.version,
    }));
  } catch { return demoOperations; }
}

export async function listSchemas() {
  try {
    const data = await request<any[]>("/catalog/information-schemas");
    return data.map((item) => ({ ...item, name: item.asset.name, createdAt: item.createdAt }));
  } catch { return demoSchemas; }
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

export async function transition(processId: string, versionId: string, action: string) {
  return request(`/processes/${processId}/versions/${versionId}/transitions`, { method: "POST", body: JSON.stringify({ action }) });
}

export async function deleteDraftVersion(processId: string, versionId: string) {
  return request<DeleteDraftVersionResult>(`/processes/${processId}/versions/${versionId}`, { method: "DELETE" });
}

export function bundleUrl(processId: string, versionId: string) {
  return `${baseUrl}/processes/${processId}/versions/${versionId}/export`;
}
