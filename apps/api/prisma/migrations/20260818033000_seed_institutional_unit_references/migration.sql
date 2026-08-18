-- Referências portáveis iniciais para unidades já existentes no cadastro institucional.
-- O vínculo é resolvido pelo externalId; nenhuma unidade é criada pelo contrato de processo.
INSERT INTO "OrganizationUnitReference" ("id", "unitId", "sourceSystem", "reference", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'PROCESS_BUNDLE_V2', mapping."reference", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "OrganizationUnit"
JOIN (VALUES
  ('FURG-PROITI', 'unidade.proiti'),
  ('FURG-CGTI', 'unidade.cgti'),
  ('FURG-PROPLAD', 'unidade.proplad'),
  ('FURG-PROGEP', 'unidade.progep'),
  ('FURG-CRSC', 'unidade.comissao.rsc')
) AS mapping("externalId", "reference") ON mapping."externalId" = "OrganizationUnit"."externalId"
ON CONFLICT ("sourceSystem", "reference") DO UPDATE
SET "unitId" = EXCLUDED."unitId", "updatedAt" = CURRENT_TIMESTAMP;
