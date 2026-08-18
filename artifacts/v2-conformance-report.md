# Relatório de conformidade - ProcessBundle v2

Data da verificação local: 16 de agosto de 2026  
Baseline: `processos.furg.br/v2`  
Resultado: **definição de pronto integralmente aprovada**

## Evidência funcional

| Necessidade | Evidência implementada | Situação |
| --- | --- | --- |
| Dados e documentos | `DataAssetCatalog`, JSON Schema 2020-12 validado por AJV, inventário na interface | Aprovada localmente |
| Formulários | `FormCatalog`, campos, regras, acesso por campo, ações e painel da atividade | Aprovada localmente |
| Agrupamento | sistemas, módulos, unidades, vínculos, cargos e domínios como recursos; facetas no catálogo | Aprovada localmente |
| Prazos | durações ISO 8601, calendário e timezone IANA, políticas, fases e eventos BPMN | Aprovada localmente |
| Cron e infraestrutura | jobs, gatilho, operação, runtime, secrets, dependências, retentativa e observabilidade | Aprovada localmente |
| Regras e decisões | regras narrativas/declarativas, CEL, JSON Logic, FEEL e DMN opcional, sem execução pelo catálogo | Aprovada localmente |
| Visões BPMN e tabela | BPMN canônico, badges de vínculos, tabela operacional derivada e drawer por atividade | Aprovada localmente |
| Perfis e grupos | sujeitos, perfis, grupos, grants e políticas navegáveis até atividades, ações e operações | Aprovada localmente |
| Visão pública | documento sanitizado separado e rota `/publico/processos/{locator}` sem autenticação | Aprovada localmente |
| Administração por unidade | capacidades por unidade, delegação explícita e autorização no backend | Aprovada localmente |
| Revisão governada | ações disponíveis calculadas pelo backend por papel/unidade; parecer obrigatório para devolução e arquivamento | Aprovada localmente |
| Importação por usuários | quarentena, dry-run, relatório, limites e aplicação transacional | Aprovada localmente |
| Vínculo com sistemas | novo binding set fica pendente e somente CGTI pode aprová-lo | Aprovada localmente |
| Versão e Git | ProcessVersion, BindingSetVersion e ProcessRelease independentes; commit/tag/PR são evidência; drift gera outbox | Aprovada localmente |
| Preparação para v3 | `ProcessObservationEvent` compatível com CloudEvents, sem motor de workflow | Aprovada localmente |

## Fixtures e cobertura

| Fixture | Perfil | Atividades | Mapeamentos completos | Software | Resultado |
| --- | --- | ---: | ---: | --- | --- |
| RSC-PCCTAE AS-IS | IMPLEMENTABLE | 18 | 18 | 2 pontos de entrada, 17 operações | válido, zero issues |
| Empréstimo presencial da biblioteca | ANALYZABLE | 3 | 3 | não se aplica | válido, zero issues |

O segundo fixture comprova que processos manuais não precisam receber aplicações, rotas ou operações fictícias. O RSC comprova o caminho canônico atividade → ponto de entrada → ação visível → operação → política/efeito/dado/evidência.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| TypeScript em todos os workspaces | passou |
| Contratos | 5 testes passaram |
| Extensão e análise BPMN | 3 testes passaram |
| Validador/migrador/projeção | 7 testes passaram |
| API, inicialização, autorização, identidade, webhook e governança | 30 testes passaram |
| Interface e acessibilidade automatizada | 21 testes passaram |
| Build de produção de todos os pacotes | passou |
| Prisma schema, migrações e publicação real do RSC | passaram |
| Compose expandido | válido; conexão interna corrigida para `postgres:5432` |
| Build e inicialização das imagens API/web | passaram; migrações e runtime sem download de pacotes |
| Health checks e proxy Nginx | passaram; API saudável e frontend HTTP 200 |
| Smoke test no navegador | passou; RSC exibiu governança, tabela com 18 atividades, aplicações, ações e prazos; sem erros no console |
| Exportação autenticada pelo proxy | passou; ZIP do RSC preservou SHA-256 `77d238b4f9a709afc34e09cb5a5f194b8ef5688ab90e5563199a423ea13b072e` |
| Isolamento OIDC em imagem de produção | passou; health e projeção pública responderam 200, rota protegida com tentativa de bypass por query respondeu 503 sem provedor configurado |
| Sintaxe dos quatro roteiros operacionais | passou em `bash -n` |
| Backup PostgreSQL e objetos | passou; checksums verificados |
| Restauração isolada e reexportação | passou; release, ZIP e objeto preservaram o mesmo SHA-256 |
| SBOM | CycloneDX 1.6, 660 componentes |
| Benchmark local do validador RSC | 25 iterações, p95 22,74 ms; referência, não SLA |
| Consumo por agentes externos | passou; duas ferramentas distintas, respostas estruturalmente válidas e 6/6 referências obrigatórias em ambas |

Arquivos de evidência:

- `artifacts/rsc-as-is/rsc-as-is.process-bundle-v2.zip`
- `artifacts/examples/emprestimo-biblioteca/emprestimo-biblioteca.process-bundle-v2.zip`
- `artifacts/v2-validation-benchmark.json`
- `artifacts/sbom.cdx.json`
- `artifacts/operational-validation/restore-report.json`
- `artifacts/agent-pilot-results/`
- `experiments/agent-consumption/`

## Gate externo concluído

Em 16 de agosto de 2026, o fixture RSC foi consumido em duas conversas externas independentes, sem entrega do diretório `reviewer-only` e sem correção manual das respostas:

| Ferramenta/modelo informado | `agent.id` declarado | Schema | Referências | Cobertura |
| --- | --- | --- | ---: | ---: |
| ChatGPT 5.6, esforço alto | `agent-b` | válido | 6/6 | 100% |
| Claude Sonnet 5, esforço alto | `agent-b-rsc-bundle-reader` | válido | 6/6 | 100% |

O avaliador confirmou `passed: true` e `distinctAgents: true`. Os arquivos brutos, seus SHA-256, os modelos informados e o relatório estão preservados em `artifacts/agent-pilot-results`. Com esse gate, a baseline `processos.furg.br/v2` satisfaz integralmente a definição de pronto registrada no planejamento.
