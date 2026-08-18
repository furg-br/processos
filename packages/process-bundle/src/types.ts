import type { ProcessBundleV2Manifest, ProcessBundleV2Resource } from "@furg/processos-contracts";

export type BundleValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  elementId?: string;
};

export type BundleCoverage = {
  bpmnActivities: number;
  boundActivities: number;
  tracedActivities: number;
  completeMappings: number;
  operations: number;
  entryPoints: number;
  forms: number;
  dataAssets: number;
  evidence: number;
  publicPhases: number;
  decisions: number;
  stateMachines: number;
  jobs: number;
  notifications: number;
  accessSubjects: number;
};

export type BundleValidationReport = {
  valid: boolean;
  manifest?: ProcessBundleV2Manifest;
  resources: ProcessBundleV2Resource[];
  issues: BundleValidationIssue[];
  coverage: BundleCoverage;
};

export type BundleLimits = {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxFileBytes: number;
  maxEntries: number;
};

export const defaultBundleLimits: BundleLimits = {
  maxCompressedBytes: 15 * 1024 * 1024,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxEntries: 500,
};

export type BuildBundleFile = {
  path: string;
  content: string | Uint8Array;
  mediaType: string;
  visibility: "PUBLIC" | "INSTITUTIONAL" | "TECHNICAL" | "RESTRICTED";
  required?: boolean;
};
