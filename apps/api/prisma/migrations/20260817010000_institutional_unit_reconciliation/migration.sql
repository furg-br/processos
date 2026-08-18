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

-- Base mínima para o piloto RSC. No ambiente institucional estes registros
-- poderão ser mantidos por sincronização de uma API, preservando externalId.
INSERT INTO "OrganizationUnit" ("id", "externalId", "acronym", "name", "active", "createdAt", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000005', 'FURG-PROGEP', 'PROGEP', 'Pró-Reitoria de Gestão e Desenvolvimento de Pessoas', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("externalId") DO UPDATE SET
  "acronym" = EXCLUDED."acronym", "name" = EXCLUDED."name", "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "OrganizationUnit" ("id", "externalId", "acronym", "name", "parentId", "active", "createdAt", "updatedAt")
SELECT '10000000-0000-4000-8000-000000000006', 'FURG-CRSC', 'CRSC', 'Comissão RSC-PCCTAE', progep."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "OrganizationUnit" progep WHERE progep."externalId" = 'FURG-PROGEP'
ON CONFLICT ("externalId") DO UPDATE SET
  "acronym" = EXCLUDED."acronym", "name" = EXCLUDED."name", "parentId" = EXCLUDED."parentId", "active" = true, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "OrganizationUnitReference" ("id", "unitId", "sourceSystem", "reference", "createdAt", "updatedAt")
SELECT '11000000-0000-4000-8000-000000000001', "id", 'PROCESS_BUNDLE_V2', 'unidade.progep', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "OrganizationUnit" WHERE "externalId" = 'FURG-PROGEP'
ON CONFLICT ("sourceSystem", "reference") DO UPDATE SET "unitId" = EXCLUDED."unitId", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "OrganizationUnitReference" ("id", "unitId", "sourceSystem", "reference", "createdAt", "updatedAt")
SELECT '11000000-0000-4000-8000-000000000002', "id", 'PROCESS_BUNDLE_V2', 'unidade.comissao.rsc', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "OrganizationUnit" WHERE "externalId" = 'FURG-CRSC'
ON CONFLICT ("sourceSystem", "reference") DO UPDATE SET "unitId" = EXCLUDED."unitId", "updatedAt" = CURRENT_TIMESTAMP;

-- Repara somente o piloto conhecido que recebeu a unidade genérica por seleção
-- implícita. A alteração fica vinculada à versão mais recente em AuditEvent.
WITH target AS (
  SELECT p."id", p."ownerUnitId" AS "oldOwnerUnitId"
  FROM "Process" p
  JOIN "OrganizationUnit" old_unit ON old_unit."id" = p."ownerUnitId"
  WHERE (p."id" = '1865d536-40ee-47b0-8bf8-35ba7cc1e0f3'
    OR p."slug" = 'reconhecimento-de-saberes-e-competencias-rsc-pcctae')
    AND old_unit."externalId" = 'FURG-UNIDADE'
), repaired AS (
  UPDATE "Process" p
  SET "ownerUnitId" = progep."id", "updatedAt" = CURRENT_TIMESTAMP
  FROM target t, "OrganizationUnit" progep
  WHERE p."id" = t."id" AND progep."externalId" = 'FURG-PROGEP'
  RETURNING p."id", t."oldOwnerUnitId", p."ownerUnitId" AS "newOwnerUnitId"
)
INSERT INTO "AuditEvent" ("id", "processVersionId", "actorId", "actorName", "action", "details", "createdAt")
SELECT '12000000-0000-4000-8000-000000000001', version."id", 'migration:institutional-unit-reconciliation',
  'Migração de reconciliação institucional', 'INSTITUTIONAL_UNIT_MAPPING_CORRECTED',
  jsonb_build_object('oldOwnerUnitId', repaired."oldOwnerUnitId", 'newOwnerUnitId', repaired."newOwnerUnitId", 'ownerUnitRef', 'unidade.progep', 'participantUnitRefs', jsonb_build_array('unidade.progep', 'unidade.comissao.rsc')),
  CURRENT_TIMESTAMP
FROM repaired
JOIN LATERAL (
  SELECT pv."id" FROM "ProcessVersion" pv WHERE pv."processId" = repaired."id" ORDER BY pv."revision" DESC LIMIT 1
) version ON true
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "ProcessUnit" pu
USING "Process" p, "OrganizationUnit" generic
WHERE pu."processId" = p."id" AND pu."unitId" = generic."id"
  AND generic."externalId" = 'FURG-UNIDADE'
  AND (p."id" = '1865d536-40ee-47b0-8bf8-35ba7cc1e0f3'
    OR p."slug" = 'reconhecimento-de-saberes-e-competencias-rsc-pcctae');

INSERT INTO "ProcessUnit" ("processId", "unitId", "role")
SELECT p."id", unit."id", mapping."role"
FROM "Process" p
CROSS JOIN (VALUES
  ('FURG-PROGEP', 'Responsável pelo processo'),
  ('FURG-CRSC', 'Participante')
) AS mapping("externalId", "role")
JOIN "OrganizationUnit" unit ON unit."externalId" = mapping."externalId"
WHERE p."id" = '1865d536-40ee-47b0-8bf8-35ba7cc1e0f3'
  OR p."slug" = 'reconhecimento-de-saberes-e-competencias-rsc-pcctae'
ON CONFLICT ("processId", "unitId", "role") DO NOTHING;
