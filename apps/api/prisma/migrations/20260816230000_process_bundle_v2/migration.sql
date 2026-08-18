CREATE TYPE "BundleImportStatus" AS ENUM ('QUARANTINED', 'VALIDATED', 'REJECTED', 'APPLIED');
CREATE TYPE "BindingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

ALTER TABLE "ProcessVersion"
  ADD COLUMN "contractVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "conformanceProfile" TEXT,
  ADD COLUMN "bindingSetVersionId" TEXT,
  ADD COLUMN "bundleHash" TEXT,
  ADD COLUMN "immutableAt" TIMESTAMP(3);

CREATE TABLE "BindingSetVersion" (
  "id" TEXT NOT NULL,
  "processVersionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "BindingApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "contentHash" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  CONSTRAINT "BindingSetVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BundleResource" (
  "id" TEXT NOT NULL,
  "bindingSetVersionId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "semanticKey" TEXT NOT NULL,
  "resourceVersion" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BundleResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcessRelease" (
  "id" TEXT NOT NULL,
  "processVersionId" TEXT NOT NULL,
  "bindingSetVersionId" TEXT NOT NULL,
  "bundleHash" TEXT NOT NULL,
  "immutableSnapshot" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveUntil" TIMESTAMP(3),
  CONSTRAINT "ProcessRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BundleArtifactFile" (
  "id" TEXT NOT NULL,
  "bindingSetVersionId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BundleArtifactFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BundleImportJob" (
  "id" TEXT NOT NULL,
  "status" "BundleImportStatus" NOT NULL DEFAULT 'QUARANTINED',
  "fileName" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "uploadedByName" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "manifest" JSONB,
  "validationReport" JSONB NOT NULL,
  "proposedProcessKey" TEXT,
  "requiresCgtiApproval" BOOLEAN NOT NULL DEFAULT false,
  "processVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "BundleImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TechnicalBindingApproval" (
  "id" TEXT NOT NULL,
  "bindingSetVersionId" TEXT NOT NULL,
  "semanticKey" TEXT NOT NULL,
  "status" "BindingApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TechnicalBindingApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitEvidenceLink" (
  "id" TEXT NOT NULL,
  "processVersionId" TEXT NOT NULL,
  "repository" TEXT NOT NULL,
  "commit" TEXT NOT NULL,
  "tag" TEXT,
  "pullRequest" TEXT,
  "path" TEXT,
  "sourceArtifactKey" TEXT NOT NULL,
  "observedHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitEvidenceLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DelegatedAdministration" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "principalId" TEXT NOT NULL,
  "capabilities" TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DelegatedAdministration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookOutboxEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "WebhookOutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcessVersion_bindingSetVersionId_key" ON "ProcessVersion"("bindingSetVersionId");
CREATE UNIQUE INDEX "BindingSetVersion_processVersionId_revision_key" ON "BindingSetVersion"("processVersionId", "revision");
CREATE INDEX "BindingSetVersion_processVersionId_status_idx" ON "BindingSetVersion"("processVersionId", "status");
CREATE UNIQUE INDEX "BundleResource_bindingSetVersionId_path_key" ON "BundleResource"("bindingSetVersionId", "path");
CREATE INDEX "BundleResource_semanticKey_resourceVersion_idx" ON "BundleResource"("semanticKey", "resourceVersion");
CREATE INDEX "BundleResource_bindingSetVersionId_kind_idx" ON "BundleResource"("bindingSetVersionId", "kind");
CREATE UNIQUE INDEX "ProcessRelease_processVersionId_bindingSetVersionId_key" ON "ProcessRelease"("processVersionId", "bindingSetVersionId");
CREATE UNIQUE INDEX "BundleArtifactFile_bindingSetVersionId_path_key" ON "BundleArtifactFile"("bindingSetVersionId", "path");
CREATE INDEX "ProcessRelease_publishedAt_idx" ON "ProcessRelease"("publishedAt");
CREATE INDEX "BundleImportJob_status_createdAt_idx" ON "BundleImportJob"("status", "createdAt");
CREATE UNIQUE INDEX "TechnicalBindingApproval_bindingSetVersionId_semanticKey_key" ON "TechnicalBindingApproval"("bindingSetVersionId", "semanticKey");
CREATE INDEX "TechnicalBindingApproval_status_idx" ON "TechnicalBindingApproval"("status");
CREATE INDEX "GitEvidenceLink_repository_commit_idx" ON "GitEvidenceLink"("repository", "commit");
CREATE UNIQUE INDEX "DelegatedAdministration_unitId_principalId_key" ON "DelegatedAdministration"("unitId", "principalId");
CREATE INDEX "WebhookOutboxEvent_status_nextAttempt_idx" ON "WebhookOutboxEvent"("status", "nextAttempt");

ALTER TABLE "BindingSetVersion" ADD CONSTRAINT "BindingSetVersion_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessVersion" ADD CONSTRAINT "ProcessVersion_bindingSetVersionId_fkey" FOREIGN KEY ("bindingSetVersionId") REFERENCES "BindingSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BundleResource" ADD CONSTRAINT "BundleResource_bindingSetVersionId_fkey" FOREIGN KEY ("bindingSetVersionId") REFERENCES "BindingSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessRelease" ADD CONSTRAINT "ProcessRelease_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessRelease" ADD CONSTRAINT "ProcessRelease_bindingSetVersionId_fkey" FOREIGN KEY ("bindingSetVersionId") REFERENCES "BindingSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BundleArtifactFile" ADD CONSTRAINT "BundleArtifactFile_bindingSetVersionId_fkey" FOREIGN KEY ("bindingSetVersionId") REFERENCES "BindingSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BundleImportJob" ADD CONSTRAINT "BundleImportJob_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TechnicalBindingApproval" ADD CONSTRAINT "TechnicalBindingApproval_bindingSetVersionId_fkey" FOREIGN KEY ("bindingSetVersionId") REFERENCES "BindingSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitEvidenceLink" ADD CONSTRAINT "GitEvidenceLink_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DelegatedAdministration" ADD CONSTRAINT "DelegatedAdministration_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrganizationUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
