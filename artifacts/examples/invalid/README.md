# Exemplos inválidos

`hash-adulterado.process-bundle-v2.zip` altera o BPMN sem atualizar tamanho e SHA-256. O validador deve emitir `SIZE_MISMATCH` e `HASH_MISMATCH`. O arquivo existe para testes negativos; não deve ser importado.
