# Planejamento fechado — ProcessBundle v2

Status: **implementação concluída; definição de pronto satisfeita**  
Escopo: contrato, plataforma, governança, migração e piloto  
Referência principal: `artifacts/rsc-as-is`

## 1. Objetivo

Evoluir o Catálogo Institucional de Processos da FURG e o ProcessBundle para uma segunda versão capaz de representar, validar e publicar de forma aberta e rastreável:

- processos BPMN;
- fases e visões tabulares;
- dados e documentos;
- formulários e suas regras;
- decisões e regras de negócio;
- sistemas, módulos, telas e pontos de entrada;
- ações apresentadas ao usuário;
- operações técnicas;
- estados e efeitos produzidos;
- perfis, grupos, vínculos e políticas de acesso;
- prazos, calendários, automações e infraestrutura;
- projeções públicas, institucionais, técnicas e restritas;
- versões, releases, Git, proveniência, evidências e divergências.

O resultado deverá melhorar simultaneamente:

1. a compreensão do processo pelo usuário final;
2. a governança institucional e a documentação das unidades;
3. a análise de impacto e a engenharia reversa pelo CGTI;
4. o contexto estruturado fornecido a agentes de IA;
5. a futura conexão entre processos documentados e instâncias reais.

## 2. Formulação da futura meta

> Projetar e implementar o ProcessBundle v2 e a evolução correspondente do Catálogo Institucional de Processos da FURG, tornando processos, dados, formulários, decisões, prazos, sistemas, operações, acesso, projeções públicas e evidências representáveis por contratos abertos, versionados e validáveis, com operação integral open source on-premises, importação governada e compatibilidade com agentes externos, sem transformar a plataforma em motor de workflow.

Esta meta somente deve ser ativada depois da conclusão da Fase 0.

## 3. Decisões arquiteturais fechadas

### 3.1 Produto

A plataforma será um **catálogo semântico governado e um grafo de rastreabilidade**. Ela não será apenas um editor BPMN e não será, no v2, um BPMS.

### 3.2 Fonte canônica

- O BPMN XML será a fonte canônica do fluxo e da disposição gráfica.
- Recursos JSON tipados e versionados serão a fonte canônica das relações que não pertencem ao BPMN.
- As visões BPMN, tabular, pública, técnica e para agentes serão projeções dessas fontes.
- Nenhuma informação será mantida manualmente em duas fontes canônicas concorrentes.

### 3.3 Abertura e implantação

- A operação completa deverá ser possível on-premises e sem acesso à internet.
- Nenhum SaaS fará parte do caminho crítico.
- Nenhum formato proprietário será fonte canônica.
- Todos os dados deverão ser exportáveis sem perda.
- Componentes externos serão acessados por adaptadores substituíveis.
- O contrato não mencionará fornecedor de IA.
- A plataforma poderá funcionar integralmente sem agente de IA.

### 3.4 Padrões adotados

| Domínio | Base adotada |
| --- | --- |
| Fluxo | BPMN 2.0.2 |
| Decisões formais | DMN 1.5, opcional por recurso |
| Dados | JSON Schema 2020-12 |
| APIs HTTP | OpenAPI 3.1 e 3.2 |
| Mensageria | AsyncAPI 3.x |
| Envelope de eventos | CloudEvents 1.0 |
| Durações | ISO 8601 |
| Fuso horário | IANA Time Zone Database |
| Autorização | sujeito–ação–recurso–contexto, compatível conceitualmente com AuthZEN |
| Eventos de processo | contrato próprio compatível com evolução para OCEL |
| SBOM | SPDX ou CycloneDX |

CMMN, ArchiMate e Serverless Workflow poderão ser referenciados ou suportados por adaptadores futuros, mas não serão dependências obrigatórias do núcleo v2.

### 3.5 Agentes externos

Agentes serão consumidores e produtores não confiáveis de artefatos. A integração ocorrerá por:

- download e upload do ProcessBundle;
- API HTTP documentada por OpenAPI;
- schemas e validador CLI;
- servidor MCP on-premises opcional.

Agentes não poderão publicar processos, criar unidades institucionais, conceder acesso ou oficializar vínculos técnicos.

## 4. Invariável canônica: Rastreabilidade Operacional

Para toda atividade relevante, a plataforma deverá responder:

1. o que deve ser feito;
2. quem deve ou pode fazer;
3. onde é feito;
4. qual ação conclui ou encaminha o trabalho;
5. quais regras permitem ou impedem a ação;
6. o que muda depois da ação;
7. quais dados, documentos e formulários participam;
8. qual implementação e evidência sustentam o mapeamento.

A cadeia canônica será:

```text
Processo
  → Atividade
    → Ponto de interação
      → Ação da interface
        → Operação de software
          → Regra de acesso e pré-condições
            → Efeito, transição ou evento
              → Dados e documentos
                → Evidências
```

### 4.1 Modos de execução

Toda atividade deverá declarar um modo:

- `HUMAN_UI`: pessoa utilizando uma aplicação;
- `HUMAN_EXTERNAL`: pessoa atuando fora de uma aplicação;
- `AUTOMATED`: processamento automático;
- `HYBRID`: ação humana que inicia processamento automático;
- `INTEGRATION`: comunicação entre sistemas.

Ausência de vínculo não poderá ser silenciosa. Uma atividade sem sistema deverá declarar explicitamente seu local ou procedimento externo.

### 4.2 Aplicação e navegação

Uma atividade `HUMAN_UI` poderá se vincular a:

- sistema;
- módulo;
- aplicação ou funcionalidade;
- tela;
- caminho de menu;
- ponto de entrada estável;
- formulário;
- ações de interface.

URLs por ambiente não serão canônicas. Um `entryPointRef` estável será resolvido para desenvolvimento, homologação ou produção.

### 4.3 Ações e operações

Uma ação que altere estado, escolha caminho ou dispare processamento será representada como `CompletionAction` ou `OutcomeAction`.

Devem permanecer distintos:

- nome de negócio;
- label apresentado na interface;
- identificador semântico estável;
- operação catalogada;
- endpoint, handler ou implementação atual;
- efeito de negócio.

Os vínculos serão muitos-para-muitos. Um botão poderá invocar várias operações, e uma operação poderá ser utilizada por várias telas.

### 4.4 Identidade semântica

Elementos relevantes terão identificadores semânticos estáveis, independentes dos IDs gráficos do modelador BPMN.

Exemplo:

```text
rsc.pedido.instruir
rsc.pedido.enviar-para-avaliacao
rsc.comissao.emitir-parecer
rsc.sei.enviar-dossie
```

O identificador deverá sobreviver a mudanças de posição, estilo, label e recriação gráfica controlada.

## 5. Perfis de conformidade

Todo bundle declarará um perfil:

| Perfil | Garantia |
| --- | --- |
| `DOCUMENTARY` | Processo compreensível e publicável; lacunas técnicas explícitas |
| `ANALYZABLE` | Fluxo, decisões, dados, relações e evidências verificáveis |
| `IMPLEMENTABLE` | Formulários, ações, operações, estados, acesso e regras suficientes para desenvolvimento assistido |
| `EXECUTABLE` | Reservado para evolução futura; fora do escopo inicial do v2 |

Uma plataforma ou agente não poderá inferir que um bundle documental contém informação suficiente para implementação.

## 6. Estrutura lógica do ProcessBundle v2

Estrutura inicial:

```text
manifest.json
process/
  process.bpmn
  process.json
  phases.json
bindings/
  elements.json
  operational-traceability.json
data/
  assets.json
  schemas/*.schema.json
forms/
  *.form.json
decisions/
  *.dmn
  rules.json
software/
  systems.json
  operations.json
  entry-points.json
  openapi/*
  asyncapi/*
access/
  actors.json
  profiles.json
  groups.json
  grants.json
  policies.json
automation/
  timing-policies.json
  jobs.json
  integrations.json
views/
  public.json
  internal.json
provenance/
  evidence.json
  source-artifacts.json
```

Cada recurso possuirá:

- `apiVersion`;
- `kind`;
- `metadata.id` imutável;
- `metadata.key` legível e estável;
- versão;
- classificação de visibilidade;
- `spec` tipado;
- hashes e dependências quando aplicável.

O manifesto terá hash por arquivo, lista fechada de entradas e versão explícita do contrato.

## 7. Modelo de dados e formulários

Serão entidades distintas:

- conceito institucional;
- ativo de informação;
- schema lógico;
- formulário;
- documento ou arquivo;
- armazenamento físico;
- uso do dado por uma atividade.

JSON Schema representará dados e validações estruturais. O formulário terá contrato próprio com dialeto de interface declarado, contendo:

- layout;
- componentes;
- campos editáveis, derivados e somente leitura;
- visibilidade e obrigatoriedade condicionais;
- uploads;
- ações e botões;
- audiência e políticas de campo.

Código JavaScript arbitrário não será aceito em bundles importados.

## 8. Prazos, calendários e automação

Eventos temporais pertencentes ao fluxo serão representados com elementos BPMN adequados.

Regras complementares utilizarão `TimingPolicy`:

- tipo: prazo legal, duração esperada ou SLA interno;
- duração ISO 8601;
- calendário e dias úteis;
- fuso horário;
- gatilho inicial;
- condições de pausa e retomada;
- alertas;
- texto público;
- fundamento normativo.

Crons e jobs serão `AutomationJob`, separados do prazo de negócio, contendo:

- agenda e fuso;
- executor e ambiente;
- unidade responsável;
- operação relacionada;
- idempotência e trava de concorrência;
- retentativas;
- monitoramento;
- requisitos de configuração;
- referências a segredos, nunca valores de segredos.

## 9. Acesso

O modelo canônico será:

```text
sujeito + ação + recurso + contexto → decisão
```

Perfis e Grupos de Acesso do CASCA serão adaptados para esse modelo:

```text
Perfil → Grupo de Acesso → Permissão → Operação → Atividade
```

Serão representadas quatro camadas:

1. capacidade concedida;
2. validade da ação no estado atual;
3. escopo sobre registros;
4. política sobre campos e documentos.

A interface deverá permitir navegar do perfil às aplicações, ações, operações, atividades, formulários e restrições correspondentes, explicando o caminho da autorização.

## 10. Projeções e visibilidade

Serão suportadas as classificações:

- pública;
- institucional;
- técnica;
- restrita.

A visão pública será uma projeção curada vinculada aos IDs internos. Ela poderá agregar várias atividades em uma fase pública e terá texto e prazos próprios.

Ocultar elementos do BPMN interno não será considerado uma projeção pública segura. Bundles exportados para agentes deverão remover fisicamente conteúdo fora do escopo autorizado.

## 11. Proveniência, evidência e divergência

Cada afirmação relevante poderá declarar:

- origem: aplicação, runtime, código, banco, teste, norma, roteiro ou entrevista;
- referência: repositório, commit, arquivo, linha, documento ou evento;
- situação: `OBSERVED`, `IMPLEMENTED`, `DOCUMENTED`, `INFERRED`, `VALIDATED` ou `CONTESTED`;
- confiança;
- responsável pela validação;
- data de verificação;
- divergências conhecidas.

Uma inferência não poderá ser apresentada como regra validada.

## 12. Versionamento e releases

O modelo será separado em:

```text
ProcessDefinition
  └── ProcessVersion

BindingSet
  └── BindingSetVersion

ProcessRelease
  └── ProcessVersion + BindingSetVersion + projeções publicadas

SourceArtifactRef
  └── repositório + commit/tag/PR + caminhos + evidência
```

- `ProcessDefinition` mantém identidade e ciclo de vida.
- `ProcessVersion` contém o significado documental e de negócio.
- `BindingSetVersion` contém vínculos técnicos que podem evoluir separadamente.
- `ProcessRelease` é uma composição publicada e imutável.
- Commit Git é evidência, não identidade da versão do processo.

Mudança apenas técnica poderá gerar novo binding. Mudança comportamental deverá gerar nova versão do processo. Futuras instâncias serão fixadas a um release.

## 13. Importação e governança

Fluxo obrigatório:

```text
Upload
  → quarentena
  → validação estrutural
  → validação BPMN e semântica
  → verificação de integridade
  → resolução de referências
  → relatório de cobertura e conflitos
  → dry-run e diff
  → rascunho
  → revisão da unidade
  → curadoria
  → aprovação técnica do CGTI
  → publicação
```

Regras:

- importação nunca sobrescreve versão publicada;
- nenhuma unidade, sistema, perfil ou grupo é criado automaticamente a partir do pacote;
- toda mutação ocorre em transação;
- arquivos, quantidade de entradas e tamanho descompactado possuem limites;
- conteúdo executável é rejeitado;
- Markdown e XML são sanitizados;
- referências não resolvidas são erros ou avisos explícitos conforme o perfil;
- vínculos técnicos somente se tornam oficiais após aprovação do CGTI.

Papéis de governança:

- Editor da unidade;
- Aprovador da unidade;
- Curador institucional;
- Vinculador técnico do CGTI;
- Administrador da plataforma;
- Revisor de segurança ou privacidade.

## 14. Visões obrigatórias da interface

### 14.1 Processo

- visão geral;
- BPMN;
- tabela simplificada;
- fases públicas;
- dados e formulários;
- sistemas e pontos de interação;
- acesso;
- regras, prazos e automações;
- evidências e divergências;
- versões e releases.

### 14.2 Atividade

Ao selecionar uma atividade, a interface deverá mostrar, conforme autorização:

- responsável;
- modo de execução;
- onde realizar;
- caminho de menu e ponto de entrada;
- ações disponíveis;
- formulários;
- pré-condições;
- efeitos e próximas possibilidades;
- dados e documentos;
- perfis e restrições;
- operação e implementação técnica;
- evidências.

### 14.3 Tabela

Visão interna:

```text
fase | atividade | responsável | onde | ação | entrada | resultado | prazo | próxima etapa
```

Visão pública:

```text
fase | o que acontece | responsável institucional | tempo esperado | próxima fase
```

As tabelas serão projeções calculadas, não cadastros duplicados.

## 15. Fases de execução

### Fase 0 — Portão de validação

Entregas:

- revisar o RSC com unidade, conhecedor operacional e CGTI;
- corrigir o modelo para exibir aplicação, tela, ações e transições;
- classificar todas as lacunas e divergências;
- testar BPMN, tabela, visão pública e visão técnica;
- executar experimento comparando agentes com e sem ProcessBundle;
- mapear pelo menos um segundo processo com características diferentes;
- registrar decisão de prosseguir ou revisar o escopo.

Critérios de saída:

- nenhuma lacuna silenciosa;
- visão tabular compreensível sem leitura do BPMN;
- visão pública sem informação interna;
- vínculos úteis para unidade e CGTI;
- ganho observável para agentes;
- segundo processo representável sem reconstrução do modelo.

### Fase 1 — Especificação do contrato

Entregas:

- vocabulário e schemas oficiais;
- estrutura do bundle;
- IDs semânticos;
- perfis de conformidade;
- regras de compatibilidade;
- RSC convertido em fixture v2;
- especificação de migração v1 → v2;
- threat model do bundle.

Critério de saída: contrato revisado sem dependência do banco ou da interface atual.

### Fase 2 — Kit aberto de conformidade

Entregas:

- validador CLI;
- validação BPMN por metamodelo;
- validação de schemas e referências;
- verificação de hashes;
- relatórios de cobertura e visibilidade;
- exemplos válidos e inválidos;
- testes de round-trip;
- migrador v1 → v2 com relatório de perdas.

Critério de saída: terceiros conseguem validar um bundle sem executar a plataforma.

### Fase 3 — Persistência e releases

Entregas:

- novo modelo versionado;
- migrações de banco;
- releases imutáveis;
- versionamento de metadados e relações;
- binding técnico independente;
- proveniência e vigência;
- API correspondente.

Critério de saída: uma versão histórica é integralmente reproduzível.

### Fase 4 — Importação segura

Entregas:

- quarentena;
- dry-run;
- diff;
- validações transacionais;
- limites e sanitização;
- resolução governada de referências;
- relatório de conflitos;
- auditoria.

Critério de saída: pacotes hostis ou incompletos não causam publicação nem mutação parcial.

### Fase 5 — Rastreabilidade operacional

Entregas:

- sistemas, módulos, telas e entry points;
- ações de interface;
- operações e efeitos;
- estados e pré-condições;
- badges BPMN;
- painel da atividade;
- tabela simplificada;
- navegação cruzada.

Critério de saída: o RSC responde “o que, quem, onde, como, sob quais regras e o que acontece depois”.

### Fase 6 — Dados, formulários, decisões, tempo e automação

Entregas:

- inventário de informação;
- forms e UI dialect;
- políticas de campo;
- DMN opcional;
- regras declarativas;
- timing policies;
- jobs, integrações, notificações e templates;
- requisitos de infraestrutura.

Critério de saída: atividades possuem entradas, resultados, formulários e regras suficientes para seu perfil de conformidade.

### Fase 7 — Acesso, projeção pública e governança

Entregas:

- modelo canônico de autorização;
- adaptador CASCA;
- visão por perfil e grupo;
- projeção pública curada;
- administração delegada por unidade;
- aprovação técnica exclusiva do CGTI;
- interface completa de revisão.

Critério de saída: conteúdo e ações respeitam simultaneamente visibilidade, estado, escopo e política de campo.

### Fase 8 — Git, drift e evidências

Entregas:

- SourceArtifactRef;
- vínculos com commit, tag, PR e caminhos;
- comparação entre release e implementação;
- solicitação de revisão por webhook;
- relatório de drift;
- evidências navegáveis.

Critério de saída: alteração de código pode ser relacionada ao processo sem transformar commit em versão do processo.

### Fase 9 — Hardening e piloto

Entregas:

- licença do projeto definida;
- SBOM e política de licenças;
- imagens fixadas por versão e digest;
- autenticação institucional;
- autorização de produção;
- backup e restauração testados;
- observabilidade local;
- testes de segurança, desempenho e acessibilidade;
- instalação documentada sem internet;
- piloto completo com RSC e segundo processo;
- teste com pelo menos dois agentes externos.

Critério de saída: definição de pronto do v2 integralmente satisfeita.

## 16. Preparação para o v3

O v2 reservará, sem executar processos:

- `processReleaseId`;
- `externalInstanceId`;
- IDs semânticos de atividade e marco;
- contrato de eventos;
- objetos relacionados;
- prazos correntes;
- operações potencialmente disponíveis.

No v3, o sistema de origem continuará sendo autoridade da instância e da autorização. A plataforma receberá uma projeção ou eventos; não inferirá o estado lendo diretamente tabelas legadas.

A disponibilidade real de uma ação será consultada no sistema de origem. O catálogo v2 indicará capacidade e regras conhecidas, não autorização dinâmica definitiva.

## 17. Fora do escopo do v2

- executar BPMN;
- substituir sistemas institucionais;
- tornar-se IAM;
- criar linguagem proprietária de decisões;
- ser uma suíte completa de arquitetura empresarial;
- gerar aplicações autonomamente;
- depender de um agente ou fornecedor de IA;
- mineração de processos em produção;
- colaboração simultânea no editor;
- execução distribuída de agentes.

## 18. Riscos e controles

| Risco | Controle |
| --- | --- |
| Modelo excessivamente adaptado ao RSC | validar segundo processo antes do contrato final |
| BPMN usado como ontologia universal | recursos tipados complementares |
| IDs quebrados por edição gráfica | identidade semântica independente |
| Split-brain entre XML e JSON | uma fonte canônica por conceito e validação cruzada |
| Visão pública vazar detalhes internos | projeção curada e exportação com remoção física |
| Agente tratar inferência como regra | proveniência, situação e confiança obrigatórias |
| Importação modificar catálogos oficiais | quarentena, dry-run e aprovação do CGTI |
| Perfis CASCA limitarem o modelo futuro | autorização canônica com adaptador legado |
| Escopo crescer para BPMS/IAM/EA | não objetivos explícitos e gates por fase |
| Dependência de produto open core | padrões abertos, adaptadores e verificação de licença |
| Migração perder relações v1 | migrador com relatório de perdas e round-trip |
| Formato aberto, mas sem implementação independente | CLI, schemas e suíte de conformidade publicados |

## 19. Definição de pronto do v2

O v2 estará concluído quando:

1. ProcessBundle v2 possuir schemas, documentação, exemplos e validador independentes;
2. bundles v1 forem migráveis com relatório explícito de perdas;
3. conteúdo histórico for reproduzível por release;
4. IDs semânticos sobreviverem a alterações gráficas;
5. RSC e segundo processo atenderem aos perfis declarados;
6. atividades interativas mostrarem aplicação, ponto de entrada, ação, regras e efeitos;
7. tabelas interna e pública forem derivadas sem duplicação manual;
8. visão pública não contiver conteúdo restrito;
9. perfil e grupo forem navegáveis até ações, operações e atividades;
10. importações forem validadas em quarentena e não causarem mutação parcial;
11. vínculos técnicos exigirem aprovação do CGTI;
12. evidências e divergências forem entidades de primeira classe;
13. Git estiver ligado como evidência, não como identidade de versão;
14. operação integral funcionar on-premises sem SaaS;
15. backup, restauração, segurança, acessibilidade e auditoria estiverem verificados;
16. pelo menos dois agentes distintos conseguirem consumir o mesmo contrato sem integração proprietária;
17. nenhuma funcionalidade de execução de workflow tiver sido introduzida implicitamente.

## 20. Ordem de trabalho e política de mudança

- Executar as fases na ordem indicada; especificação antecede banco e interface.
- Entregar fatias verticais verificáveis usando o RSC como fixture permanente.
- Não realizar migração destrutiva do v1 antes do round-trip e do relatório de perdas.
- Toda alteração incompatível no contrato exige nova versão major ou regra formal de migração.
- Novas entidades entram no núcleo somente quando necessárias para ao menos dois casos ou exigidas por uma invariável canônica.
- Decisões arquiteturais novas devem ser registradas antes da implementação correspondente.

Este documento constitui o planejamento fechado. Mudanças decorrentes da Fase 0 devem ser registradas como revisão explícita do plano, com justificativa e impacto, antes da ativação da meta v2.

## 21. Fechamento da execução v2

Em 16 de agosto de 2026, as fases 0 a 9 foram implementadas e verificadas. A evidência consolidada está em `artifacts/v2-conformance-report.md`. O contrato, a aplicação e a documentação deixam de ser uma proposta e passam a constituir a baseline validada `2.0`.

O gate de restauração foi executado em ambiente isolado local: PostgreSQL e objetos foram restaurados, a release RSC foi reexportada e o ZIP canônico manteve o mesmo SHA-256. A evidência está em `artifacts/operational-validation/restore-report.json`.

O gate de interoperabilidade foi executado com duas ferramentas externas distintas, ChatGPT 5.6 e Claude Sonnet 5, sem acesso ao gabarito e sem correção manual. As duas respostas foram estruturalmente válidas, identificaram 6/6 referências obrigatórias e obtiveram 100% de cobertura no avaliador offline. Respostas brutas, hashes, metadados e relatório estão em `artifacts/agent-pilot-results`.

Com o contrato aberto, fixtures independentes, validação, operação on-premises, restauração, segurança, acessibilidade e consumo externo comprovados, os 17 itens da definição de pronto estão satisfeitos. Evoluções posteriores devem ser tratadas como manutenção compatível da v2 ou como escopo explícito da v3.
