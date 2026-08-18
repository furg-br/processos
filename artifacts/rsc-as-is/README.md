# Experimento de mapeamento reverso - RSC do SRH

## Conclusão

O experimento confirma que a ferramenta atual já consegue representar bem o fluxo humano e sistêmico principal, os papéis por atividade, as operações de software associadas e os contratos de dados. Ela ainda não é uma especificação estrutural suficiente para geração autônoma de uma aplicação equivalente.

O ponto central é a diferença entre **guardar informação sobre uma relação** e **governar essa relação como contrato verificável**. O `ProcessBundle v1` guarda o BPMN, papéis, referências a operações e JSON Schemas. Formulários, grupos/perfis de acesso, pré-condições, transições de estado e evidências no código ainda não são entidades de primeira classe.

Assim, o uso recomendado hoje é:

- base de análise e documentação para reuniões;
- contexto estruturado para agentes implementarem sob revisão humana;
- mecanismo de rastreabilidade entre processo, dados e capacidades do sistema;
- comparação futura entre AS-IS e TO-BE.

Ainda não é seguro tratá-lo como fonte única para gerar código, banco e autorização sem uma camada contratual adicional.

## Artefatos

| Arquivo | Finalidade |
| --- | --- |
| `rsc-as-is.process-bundle.zip` | Pacote importável no Catálogo de Processos |
| `process.bpmn` | Fluxo AS-IS com raias de servidor, sistema, comissão e SEI/PROGEP |
| `preview.png` / `preview.html` | Prévia estática e visualização navegável do BPMN |
| `metadata.json` | Metadados `furg.process/v1`, vínculos com dados e operações |
| `manifest.json` | Manifesto `furg.process-bundle` v1 |
| `schemas/*.schema.json` | Contratos conceituais de pedido, item/evidência, diligência, Parecer e dossiê/SEI |
| `software-catalog.json` | 17 operações técnicas com scripts, grupos, formulários, condições e efeitos |
| `application-map.json` | Mapa ampliado aplicação-operação-formulário-acesso-estado-evidência |
| `build-bundle.mjs` | Gera e valida os arquivos canônicos e o ZIP de forma reprodutível |

O ZIP contém também `software-catalog.json` e `application-map.json`. O importador atual preserva o pacote principal, mas ignora esses dois arquivos adicionais.

## Cobertura do piloto

- cinco estados do pedido e suas transições;
- seis estados relevantes de análise dos itens;
- quatro estados técnicos do envio ao SEI;
- jornada do rascunho ao Parecer terminal;
- diligência seletiva, resposta e expiração automática;
- geração e congelamento do dossiê;
- envio explícito e idempotente ao SEI, inclusive falha parcial e retomada;
- 17 operações de interface, domínio ou processamento automático;
- 11 contratos de formulário;
- cinco contratos de dados;
- dois grupos de acesso, um perfil configurado e regras de escopo por registro.

Os 55 critérios normativos não foram transformados em 55 atividades. Eles são um catálogo parametrizado consumido por uma mesma atividade de inclusão/análise de item. Essa separação é deliberada: critério é regra/dado de referência, não etapa do processo.

## O que o ProcessBundle v1 representa hoje

| Dimensão | Situação | Avaliação |
| --- | --- | --- |
| Fluxo, eventos, decisões e raias | BPMN canônico | Forte |
| Papel por atividade | `elementMetadata.role` | Bom, mas texto livre |
| Unidade por atividade | Campo existente no contrato | Parcial; não há edição completa na interface |
| Operação por atividade | UUID + tipo de vínculo | Parcial; depende de catálogo pré-existente |
| Dados de entrada e saída | JSON Schema + direção | Bom para estrutura de dados |
| Formulário e comportamento de campos | Não existe entidade própria | Ausente |
| Perfil, grupo, permissão e escopo | Não existe contrato próprio | Ausente |
| Estado, pré/pós-condições e invariantes | Podem aparecer no BPMN ou em texto | Fraco como contrato executável |
| Evidência no código e cobertura | Proveniência apenas no nível do pacote | Ausente por elemento/operação |
| Detecção de divergência entre documentos e código | Não implementada | Ausente |
| Relações entre processos | Modelo no banco | Parcial; importação e edição visual incompletas |

## Limitações observadas no importador atual

1. O pacote referencia operações por UUID, mas não existe um arquivo canônico do `ProcessBundle v1` para defini-las. Se as 17 operações não estiverem previamente cadastradas, o processo é importado com avisos e os vínculos de software são descartados.
2. A interface ainda não permite editar vínculos de elemento com operação, contrato de dados, papel ou unidade.
3. Os `participantUnits` do pacote não são recriados durante a importação; apenas a unidade proprietária é resolvida.
4. As relações presentes em `metadata.relations` não são persistidas pelo importador.
5. `application-map.json` e `software-catalog.json` são extensões experimentais e atualmente são ignorados.
6. O hash e a lista completa de arquivos do manifesto não são verificados na importação.

Por isso, o ZIP é importável, mas produzirá avisos de operações não resolvidas até que o catálogo de software seja preparado.

## Divergências encontradas no próprio RSC

### Envio ao SEI

O comportamento efetivo é: o Parecer encerra o pedido no CASCA, o dossiê é congelado e a comissão usa depois **Acompanhar envio ao SEI**. O código, o teste Cypress e `IMPLEMENTACAO_DEFINITIVA.md` concordam.

`ROTEIRO_HOMOLOGACAO.md` ainda possui passos que falam em envio automático depois do Parecer. O próprio roteiro, em outro trecho, afirma que somente a operação de acompanhamento inicia o envio. O mapa adotou o comportamento do código e registrou a divergência em `application-map.json`.

### Duas rotas para enviar à avaliação

Existe a operação nativa `enviar_para_avaliacao.php`, porém `alterar.php` também chama `RhRscPedido::enviarParaAnalise()` quando recebe `acao=enviar_pedido`. Essa duplicidade rompe a relação desejada de uma ação de processo para uma operação técnica inequívoca.

### Exclusão do rascunho principal

`apagar.php` e `RhRscPedido::removerRascunho()` existem, mas a migration inicial não concede a operação principal **Apagar** aos grupos RSC. A permissão efetiva deve ser confirmada no banco do ambiente. O mapa não assume que essa capacidade está acessível.

## Evolução mínima recomendada da ferramenta

Antes de usar o catálogo como base estrutural para geração ampla por agentes, o próximo contrato deveria acrescentar:

1. **Definição portável de operações** no bundle, não apenas UUID: sistema, módulo, funcionalidade, adaptador (`CASCA_SCRIPT`, `HTTP`, `DOMAIN_METHOD`, `JOB`), entrada, saída, idempotência e coordenadas técnicas.
2. **Formulários como entidade de primeira classe**, vinculados a operações, com JSON Schema, UI Schema, campos derivados, condições de visibilidade/obrigatoriedade e componentes institucionais.
3. **Autorização formal**, distinguindo ator de processo, perfil, grupo de acesso, permissão, escopo de registro e checagem no servidor.
4. **Máquina de estados e invariantes**, com pré-condições e pós-condições verificáveis para cada operação.
5. **Rastreabilidade de origem**, incluindo arquivo, símbolo, migration e teste que sustentam cada vínculo.
6. **Validador de cobertura e deriva**, capaz de apontar atividade sem operação, operação sem atividade, formulário sem permissão, estado inalcançável e divergência entre documentação e código.

Com esses seis pontos, a ferramenta deixa de ser apenas um catálogo enriquecido e passa a funcionar como uma arquitetura comportamental versionada, adequada para orientar agentes com muito menos ambiguidade.

## Reprodução e validação

Na raiz deste repositório:

```powershell
node artifacts/rsc-as-is/build-bundle.mjs
```

O script:

- valida o BPMN com as regras do pacote `@furg/processos-bpmn`;
- extrai a visão textual do BPMN;
- valida `metadata.json` e `manifest.json` contra os contratos atuais;
- incorpora os cinco JSON Schemas;
- gera `rsc-as-is.process-bundle.zip`.

O XML também foi carregado com `bpmn-moddle` sem avisos. Não houve teste de importação contra a API e o PostgreSQL neste levantamento porque o Docker Desktop não estava disponível.
