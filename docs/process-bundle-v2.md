# Especificação do ProcessBundle v2

Status: contrato implementado, versão `2.0`, API `processos.furg.br/v2`.

Este documento é normativo para a estrutura portável. Os JSON Schemas em `packages/contracts/schemas/v2` são a forma validável do contrato e os tipos Zod são a implementação de referência. O formato não depende do banco, da interface, de um agente de IA ou de um fornecedor SaaS.

## Invariante operacional

Uma atividade implementável precisa permitir a navegação:

```text
processo → atividade semântica → modo de execução → ator/unidade
         → ponto de entrada → ação de conclusão → operação
         → políticas e precondições → efeitos → dados/documentos → evidência
```

O nome BPMN explica o trabalho institucional. `semanticId` dá identidade estável ao trabalho. O botão reconhecido pelo usuário é uma `completionAction`; a rota, comando, job ou mensagem que a realiza é uma `operation`. Uma atividade pode ter várias ações e uma ação pode usar várias operações.

## Estrutura do ZIP

`manifest.json` declara cada arquivo, media type, visibilidade, tamanho e SHA-256. Os caminhos obrigatórios são:

```text
manifest.json
process/process.bpmn
process/process.json
bindings/elements.json
bindings/operational-traceability.json
```

Os demais recursos ficam em `process/`, `catalogs/`, `projections/`, `provenance/`, `releases/`, `data/` e `decisions/`. Arquivos não declarados, ausentes, adulterados, grandes demais ou com caminho inseguro invalidam o pacote.

## Recursos

| Kind | Responsabilidade canônica |
| --- | --- |
| `ProcessDefinition` | identidade, versão, release, perfil, unidade dona, participantes, taxonomias e BPMN |
| `PhaseCatalog` | agrupamento ordenado e tempos esperados por fase |
| `ElementBindingCatalog` | de-para entre ID gráfico BPMN e identidade semântica |
| `OperationalTraceabilityCatalog` | execução, atores, entrada, ações, regras, efeitos, dados, prazos e evidências |
| `InstitutionalContextCatalog` | unidades, vínculos, cargos e domínios institucionais |
| `DataAssetCatalog` | conceitos, ativos, documentos, arquivos e schemas |
| `FormCatalog` | formulário versionado, campos, acesso por campo, regras e ações |
| `SoftwareCatalog` | sistemas, módulos, telas/pontos de entrada e operações |
| `AccessCatalog` | atores, perfis, grupos, concessões e políticas |
| `AutomationCatalog` | prazos, calendários, jobs, integração e infraestrutura |
| `DecisionCatalog` | regras declarativas, narrativas ou DMN opcional |
| `StateCatalog` | máquinas e transições de estado observadas |
| `CommunicationCatalog` | notificações, destinatários e templates |
| `ProjectionCatalog` | projeções públicas, institucionais e técnicas |
| `ProvenanceCatalog` | fontes, evidências, confiança e divergências |
| `ProcessRelease` | identidade da publicação e vínculo com versão e binding set |
| `ProcessObservationEvent` | envelope CloudEvents reservado para observação futura de instâncias, sem execução no v2 |

## Perfis de conformidade

| Perfil | Garantia |
| --- | --- |
| `DOCUMENTARY` | BPMN, identidades e lacunas explicitamente classificadas |
| `ANALYZABLE` | fases, contexto, projeções e evidência para análise consistente |
| `IMPLEMENTABLE` | todos os catálogos operacionais; toda atividade tem mapeamento completo e ação de conclusão |
| `EXECUTABLE` | reservado a consumidores externos; a plataforma FURG não executa workflow |

Catálogos obrigatórios podem estar vazios quando o conceito realmente não se aplica. Ausência e “vazio confirmado” têm significados diferentes.

Expressões portáveis declaram sua linguagem. O núcleo aceita `CEL`, `JSON_LOGIC`, `FEEL` e `NARRATIVE`; ele valida e transporta essas expressões, mas não as executa. DMN permanece um artefato opcional e referenciado.

## Identidade, versão e visibilidade

- IDs BPMN pertencem à representação gráfica; chaves semânticas pertencem ao conceito institucional.
- `processVersionId`, `bindingSetVersionId` e `releaseId` são independentes.
- mudanças apenas em rotas, telas, handlers, operações, infraestrutura de jobs, integrações ou proveniência geram um novo `BindingSetVersion`. Mudanças no significado do processo, atores, ações, efeitos, dados, formulários, políticas de acesso, decisões, prazos, agenda do cron ou projeções exigem novo `ProcessVersion`. Recursos mistos são normalizados antes da comparação: por exemplo, trocar o executor de um job é técnico; trocar sua agenda altera o processo.
- um binding set pendente não substitui o binding ativo. Após aprovação do CGTI, uma versão já publicada recebe uma nova release que compõe a mesma versão de processo com o novo binding set.
- commit, tag e PR são evidências; nunca substituem a versão do processo.
- uma publicação cria snapshot imutável e reproduzível; alterações exigem fork.
- o ZIP canônico de cada binding set é preservado byte a byte; a exportação de uma release retorna esse conteúdo e seu SHA-256 deve coincidir com `contentHash`.
- vínculos técnicos ficam pendentes até aprovação do CGTI.
- visibilidades são `PUBLIC`, `INSTITUTIONAL`, `TECHNICAL` e `RESTRICTED`.
- `createPublicProcessProjection` produz outro documento e remove fisicamente IDs internos, operações, rotas, políticas, jobs e evidências restritas.

## Importação governada

1. upload para quarentena;
2. limites, paths, hashes, schemas, metamodelo BPMN e referências cruzadas;
3. relatório de cobertura, conflito e diff sem mutação;
4. reconciliação de `ownerUnitRef` e `participantUnitRefs` com o cadastro institucional, sem seleção implícita;
5. aplicação integral em transação;
6. vínculos técnicos pendentes de aprovação do CGTI;
7. auditoria da importação e da decisão.

O `InstitutionalContextCatalog` declara as unidades que dão significado ao pacote, mas não tem autoridade para criar unidades nem assumir sua identidade na plataforma. A correspondência usa referências institucionais aprovadas (`OrganizationUnitReference`) ligadas ao `externalId` da unidade oficial. Referências ausentes ou ambíguas bloqueiam a aplicação até decisão explícita de um administrador da plataforma. Essa separação permite que o cadastro local seja futuramente sincronizado por uma API institucional sem acoplar a importação à disponibilidade dessa API.

## CLI independente

```powershell
pnpm --filter @furg/processos-bundle build
node packages/process-bundle/dist/cli.js validate caminho/processo-v2.zip
node packages/process-bundle/dist/cli.js migrate-v1 caminho/v1.zip caminho/v2.zip
```

O migrador gera perfil `DOCUMENTARY` e relata perdas. UUIDs de operação do v1 não são promovidos a definições portáveis por inferência.

## Fixtures oficiais

- `artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip`: engenharia reversa, perfil `IMPLEMENTABLE`.
- `artifacts/examples/emprestimo-biblioteca/emprestimo-biblioteca.process-bundle-v2.zip`: processo público, presencial e manual, perfil `ANALYZABLE`.
- `artifacts/rsc-as-is/rsc-migrated-v1-to-v2.zip`: resultado documental do migrador.

O RSC comprova software, formulários, dados, acesso, decisões, estados, cron, integração e divergências. O empréstimo comprova que um processo sem aplicação nem automação não precisa ser deformado para caber no contrato.

## Reserva de interoperabilidade com instâncias

`process-observation-event.schema.json` define um envelope CloudEvents 1.0 para uma evolução futura. Ele correlaciona `processReleaseId`, `externalInstanceId`, atividade ou marco semântico, objetos relacionados, prazo corrente e ações potencialmente disponíveis. O schema é apenas um contrato de observação: o v2 não recebe, persiste nem executa instâncias, e o sistema de origem continua sendo autoridade de estado e autorização dinâmica.
