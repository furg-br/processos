-- O cadastro institucional é a autoridade. Bundles apenas referenciam unidades
-- por chaves portáveis, reconciliadas por esta tabela.
CREATE TABLE "OrganizationUnitReference" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationUnitReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationUnitReference_sourceSystem_reference_key"
  ON "OrganizationUnitReference"("sourceSystem", "reference");
CREATE INDEX "OrganizationUnitReference_unitId_idx"
  ON "OrganizationUnitReference"("unitId");
ALTER TABLE "OrganizationUnitReference"
  ADD CONSTRAINT "OrganizationUnitReference_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "OrganizationUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
