-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'INTERNAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "Perspective" AS ENUM ('AS_IS', 'TO_BE');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'UNIT_REVIEW', 'CURATOR_REVIEW', 'PUBLISHED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('DECOMPOSES', 'CALLS', 'PRECEDES', 'EXCHANGES_INFORMATION', 'RELATED_TO');

-- CreateEnum
CREATE TYPE "SoftwareBindingKind" AS ENUM ('SUPPORTS', 'AUTOMATES', 'INVOKES', 'STARTS', 'RECEIVES');

-- CreateEnum
CREATE TYPE "DataDirection" AS ENUM ('INPUT', 'OUTPUT');

-- CreateTable
CREATE TABLE "Taxonomy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Taxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationUnit" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "acronym" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNAL',
    "continuous" BOOLEAN NOT NULL DEFAULT false,
    "ownerUnitId" TEXT NOT NULL,
    "taxonomyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessUnit" (
    "processId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "ProcessUnit_pkey" PRIMARY KEY ("processId","unitId","role")
);

-- CreateTable
CREATE TABLE "ProcessVersion" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "perspective" "Perspective" NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "bpmnXml" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "processSla" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "unitApprovedAt" TIMESTAMP(3),
    "curatorApprovedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "ProcessVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessRelation" (
    "id" TEXT NOT NULL,
    "sourceProcessId" TEXT NOT NULL,
    "targetProcessId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "label" TEXT,
    "sourceElementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftwareSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "ownerUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftwareSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemModule" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "SystemModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Functionality" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Functionality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftwareOperation" (
    "id" TEXT NOT NULL,
    "functionalityId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "version" TEXT NOT NULL,
    "sourceHash" TEXT,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftwareOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementBinding" (
    "id" TEXT NOT NULL,
    "processVersionId" TEXT NOT NULL,
    "bpmnElementId" TEXT NOT NULL,
    "organizationUnitId" TEXT,
    "role" TEXT,
    "workDuration" TEXT,
    "waitDuration" TEXT,
    "operationId" TEXT,
    "kind" "SoftwareBindingKind",

    CONSTRAINT "ElementBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformationAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InformationAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformationSchemaVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNAL',
    "jsonSchema" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InformationSchemaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataBinding" (
    "id" TEXT NOT NULL,
    "processVersionId" TEXT NOT NULL,
    "bpmnElementId" TEXT,
    "informationSchemaId" TEXT NOT NULL,
    "direction" "DataDirection" NOT NULL,

    CONSTRAINT "DataBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "processVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "visibility" "Visibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditLease" (
    "id" TEXT NOT NULL,
    "processVersionId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "processVersionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Taxonomy_slug_key" ON "Taxonomy"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationUnit_externalId_key" ON "OrganizationUnit"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Process_slug_key" ON "Process"("slug");

-- CreateIndex
CREATE INDEX "Process_title_idx" ON "Process"("title");

-- CreateIndex
CREATE INDEX "Process_visibility_idx" ON "Process"("visibility");

-- CreateIndex
CREATE INDEX "ProcessVersion_processId_status_perspective_idx" ON "ProcessVersion"("processId", "status", "perspective");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessVersion_processId_revision_key" ON "ProcessVersion"("processId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessRelation_sourceProcessId_targetProcessId_type_key" ON "ProcessRelation"("sourceProcessId", "targetProcessId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SoftwareSystem_slug_key" ON "SoftwareSystem"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SystemModule_systemId_slug_key" ON "SystemModule"("systemId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Functionality_moduleId_slug_key" ON "Functionality"("moduleId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SoftwareOperation_functionalityId_operationId_version_key" ON "SoftwareOperation"("functionalityId", "operationId", "version");

-- CreateIndex
CREATE INDEX "ElementBinding_processVersionId_bpmnElementId_idx" ON "ElementBinding"("processVersionId", "bpmnElementId");

-- CreateIndex
CREATE UNIQUE INDEX "InformationAsset_slug_key" ON "InformationAsset"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "InformationSchemaVersion_assetId_version_key" ON "InformationSchemaVersion"("assetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DataBinding_processVersionId_bpmnElementId_informationSchem_key" ON "DataBinding"("processVersionId", "bpmnElementId", "informationSchemaId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "EditLease_token_key" ON "EditLease"("token");

-- CreateIndex
CREATE INDEX "EditLease_processVersionId_expiresAt_idx" ON "EditLease"("processVersionId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_processVersionId_createdAt_idx" ON "AuditEvent"("processVersionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Taxonomy" ADD CONSTRAINT "Taxonomy_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Taxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUnit" ADD CONSTRAINT "OrganizationUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrganizationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_ownerUnitId_fkey" FOREIGN KEY ("ownerUnitId") REFERENCES "OrganizationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_taxonomyId_fkey" FOREIGN KEY ("taxonomyId") REFERENCES "Taxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessUnit" ADD CONSTRAINT "ProcessUnit_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessUnit" ADD CONSTRAINT "ProcessUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrganizationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessVersion" ADD CONSTRAINT "ProcessVersion_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessRelation" ADD CONSTRAINT "ProcessRelation_sourceProcessId_fkey" FOREIGN KEY ("sourceProcessId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessRelation" ADD CONSTRAINT "ProcessRelation_targetProcessId_fkey" FOREIGN KEY ("targetProcessId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemModule" ADD CONSTRAINT "SystemModule_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "SoftwareSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Functionality" ADD CONSTRAINT "Functionality_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "SystemModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftwareOperation" ADD CONSTRAINT "SoftwareOperation_functionalityId_fkey" FOREIGN KEY ("functionalityId") REFERENCES "Functionality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementBinding" ADD CONSTRAINT "ElementBinding_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementBinding" ADD CONSTRAINT "ElementBinding_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "SoftwareOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationSchemaVersion" ADD CONSTRAINT "InformationSchemaVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "InformationAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataBinding" ADD CONSTRAINT "DataBinding_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataBinding" ADD CONSTRAINT "DataBinding_informationSchemaId_fkey" FOREIGN KEY ("informationSchemaId") REFERENCES "InformationSchemaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditLease" ADD CONSTRAINT "EditLease_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_processVersionId_fkey" FOREIGN KEY ("processVersionId") REFERENCES "ProcessVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
