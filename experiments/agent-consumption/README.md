# Piloto de consumo por agentes

Este roteiro mede se agentes distintos conseguem usar o mesmo ProcessBundle sem integração proprietária. Ele não autoriza publicação nem geração autônoma de código.

1. execute `pnpm agent-pilot:prepare` para gerar duas pastas isoladas em `artifacts/agent-pilot-kit`;
2. entregue `agent-a` e `agent-b` separadamente; nunca entregue `reviewer-only` aos participantes;
3. salve cada resposta JSON sem corrigir manualmente;
4. execute `node experiments/agent-consumption/evaluate.mjs resposta-a.json resposta-b.json relatorio.json`;
5. registre modelo/ferramenta, data, prompt efetivo e relatório no protocolo institucional.

O gate exige dois `agent.id` distintos, respostas estruturalmente válidas e acerto dos vínculos aplicação → ação → operação. O avaliador não chama qualquer fornecedor e pode rodar offline. Resultados não são versionados como evidência validada até revisão humana.
