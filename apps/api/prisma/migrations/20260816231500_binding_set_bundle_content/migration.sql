ALTER TABLE "BindingSetVersion" ADD COLUMN "bundleContent" BYTEA;

UPDATE "BindingSetVersion" AS binding
SET "bundleContent" = job."content"
FROM "BundleImportJob" AS job
WHERE job."processVersionId" = binding."processVersionId"
  AND job."status" = 'APPLIED'
  AND job."validationReport" #>> '{manifest,bindingSetVersionId}' = binding."id";
