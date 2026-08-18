-- Todos os dados de processo permanecem no PostgreSQL. Anexos deixam de
-- depender de uma chave externa de armazenamento.
ALTER TABLE "Attachment" DROP COLUMN "objectKey";
ALTER TABLE "Attachment" ADD COLUMN "content" BYTEA NOT NULL;
