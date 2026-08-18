# Catálogo Institucional de Processos da FURG

Protótipo funcional de um repositório governado de processos BPMN 2.0. A aplicação cataloga processos, unidades, dados e operações de software; ela não executa instâncias de workflow nem substitui um BPMS.

## Contrato v2

O planejamento está em [Planejamento fechado - ProcessBundle v2](docs/planejamento-processbundle-v2.md) e a estrutura implementada em [Especificação do ProcessBundle v2](docs/process-bundle-v2.md). O formato possui schemas, CLI, migrador v1, threat model e fixtures sintéticas independentes.

Status: baseline `processos.furg.br/v2` validada. A definição de pronto, incluindo restauração operacional e consumo independente por ChatGPT 5.6 e Claude Sonnet 5, está documentada em [Relatório de conformidade v2](artifacts/v2-conformance-report.md).

## Estado atual

As seguintes funcionalidades estão disponíveis na interface:

- catálogo pesquisável, com filtros por visibilidade, sistema, módulo, unidade e vínculo, além de processos `AS-IS` e `TO-BE`;
- criação de processo em rascunho a partir de um diagrama BPMN inicial;
- edição dos dados cadastrais de rascunhos e versões devolvidas para ajustes;
- editor BPMN com `bpmn-js`, modo guiado ou avançado, validação, `bpmnlint` e tela cheia;
- bloqueio exclusivo de edição, renovado automaticamente durante a sessão;
- proteção contra navegação e fechamento da página quando há alterações não salvas;
- visualização geral, diagrama, representação textual acessível e histórico de versões;
- remoção de versões em rascunho pela aba Versões, com confirmação e proteção contra edição ativa;
- revisão governada completa na interface, com ações calculadas pelo backend conforme papel e unidade;
- importação de ProcessBundle ZIP ou BPMN/XML pela interface;
- quarentena, dry-run, hashes, referências cruzadas e aprovação CGTI para vínculos técnicos v2;
- rastreabilidade com tabela, badges BPMN, painel de atividade, inventários, projeção pública e matriz perfil/grupo;
- rota pública independente em `/publico/processos/{uuid-ou-slug}`, alimentada somente pela projeção pública sanitizada;
- versões v2 reproduzíveis, releases imutáveis, administração delegável e evidência Git;
- exportação autenticada de versões legadas em `ProcessBundle v1` e preservação byte a byte do ZIP canônico v2;
- páginas navegáveis e compartilháveis para catálogo, mapa, dados, software e processos;
- leitura de contratos JSON Schema e de operações de software catalogadas.

A API também implementa comparação entre versões, importação OpenAPI 3.x e criação de versões de JSON Schema. Essas operações ainda não possuem todos os controles correspondentes na interface; podem ser exploradas pela documentação OpenAPI.

### O que ainda é demonstrativo

- o mapa em React Flow usa as relações dos quatro processos de demonstração; ainda não há interface para criar vínculos entre processos;
- os botões **Criar nova versão** em Dados e **Importar OpenAPI** em Software ainda não abrem formulários;
- se a API não responder, o frontend apresenta dados de demonstração. Esse modo não persiste alterações.

## Arquitetura

```text
apps/web                 React, Vite, DS-FURG, bpmn-js e React Flow
apps/api                 NestJS, Prisma, governança e ProcessBundle
packages/contracts       contratos JSON/TypeScript compartilhados
packages/bpmn-extension  extensão FURG, outline, lint e diff BPMN
```

O BPMN XML é a fonte canônica do diagrama. Recursos semânticos versionados complementam o BPMN sem duplicá-lo. O ProcessBundle v2 preserva esses recursos e arquivos auxiliares com tamanho, visibilidade e SHA-256 no manifesto.

### Fonte canônica dos processos

Processos cadastrados não são carregados de arquivos do repositório. O PostgreSQL é a fonte canônica para versões, BPMN, recursos semânticos, relações, auditoria e identidades de publicação. A interface sempre consulta a API.

Arquivos ProcessBundle são formatos de transporte. Eles entram pela importação e saem pela exportação, mas não permanecem como uma segunda fonte editável no projeto. Testes automatizados usam exclusivamente dados sintéticos construídos em memória por `@furg/processos-bundle/testing`.

Para obter um ZIP a partir de uma versão persistida:

```powershell
pnpm bundle:export -- <processId> <versionId> <arquivo.zip>
```

Em outro ambiente, informe `PROCESSOS_API_URL`. Quando houver autenticação OIDC, informe o token em `PROCESSOS_ACCESS_TOKEN`. Corrigir um ZIP exportado não altera a base. A alteração deve ser realizada pela interface ou API em uma versão editável e o ZIP deve ser exportado novamente.

## Instalação local recomendada

### Requisitos

- Node.js 22;
- pnpm 10.33, ativado pelo Corepack;
- Docker Desktop, Docker Engine com Compose ou Podman compatível;
- PowerShell para executar os exemplos abaixo.

O frontend usa o pacote local `@furg/design-system` 0.5.0. Se `vendor/furg-design-system-0.5.0.tgz` não existir ou precisar ser atualizado, o projeto canônico do DS-FURG também deve estar disponível. O caminho padrão é `C:\Projetos\design-system-furg`; outro local pode ser informado em `FURG_DESIGN_SYSTEM_PATH`.

### 1. Preparar ambiente e dependências

Na raiz do monorepo:

```powershell
corepack enable
Copy-Item .env.example .env
```

Se for necessário gerar o pacote do design system:

```powershell
$env:FURG_DESIGN_SYSTEM_PATH = "C:\Projetos\design-system-furg"
pnpm vendor:design-system
Remove-Item Env:FURG_DESIGN_SYSTEM_PATH
```

Instale as dependências:

```powershell
pnpm install
```

### 2. Iniciar PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

Por padrão, o projeto cria um PostgreSQL isolado com:

| Configuração | Valor local |
| --- | --- |
| Host | `localhost` |
| Porta | `55434` |
| Banco | `processos` |
| Usuário | `processos` |
| Senha | `processos` |
| Schema | `public` |

A porta `55434` evita conflito com instalações antigas do PostgreSQL que normalmente usam `5432`. A configuração correspondente já está em `.env.example`.

### 3. Criar a estrutura do banco

```powershell
pnpm db:generate
pnpm db:migrate
```

Para preencher uma instalação vazia com quatro processos, unidades, relações, uma operação de software e um contrato de dados demonstrativos:

```powershell
pnpm db:seed
```

> **Atenção:** `pnpm db:seed` apaga os registros existentes dessas tabelas antes de recriar os dados demonstrativos. Execute-o apenas na configuração inicial ou quando quiser reinicializar deliberadamente o ambiente. Não o execute depois de cadastrar trabalho que deseja preservar.

Os comandos `pnpm dev` e `pnpm db:*` carregam automaticamente o `.env` da raiz. Não é necessário colocar a senha no comando nem exportar `DATABASE_URL` para a sessão do PowerShell.

### 4. Iniciar a aplicação

```powershell
pnpm dev
```

Endereços locais:

| Serviço | Endereço |
| --- | --- |
| Interface | `http://localhost:5173` |
| API | `http://localhost:3000/api/v1` |
| OpenAPI/Swagger | `http://localhost:3000/api/v1/docs` |
| Verificação da API | `http://localhost:3000/api/v1/health` |

O terminal que executa `pnpm dev` permanece aberto e mostra os logs do Vite e da API NestJS.

## Primeiro uso

### Criar um processo do zero

1. Abra **Catálogo** e selecione **Novo processo**.
2. Preencha nome, categoria, resumo, público atendido, unidade responsável, cenário e visibilidade.
3. Selecione **Criar e abrir diagrama**. O processo é criado como rascunho com o fluxo inicial `Início → Descrever a atividade → Resultado entregue`.
4. Na visão **Diagrama**, selecione **Editar diagrama** ou **Obter bloqueio e editar**.
5. Use a paleta lateral para inserir eventos, atividades, gateways e conexões. Um duplo clique permite renomear elementos.
6. Selecione **Salvar rascunho** e aguarde a confirmação **Alterações salvas**.

O salvamento valida o XML e atualiza a revisão em edição no PostgreSQL. Ele não cria automaticamente uma nova revisão. Cada salvamento gera um evento de auditoria `BPMN_SAVED` com hash, tamanho do XML e quantidade de apontamentos encontrados.

O editor não possui salvamento automático. Enquanto houver mudanças locais, a aplicação bloqueia a troca de aba interna e pede confirmação antes de fechar ou sair da página. Use **Tela cheia** para diagramas extensos; **Sair da tela cheia** ou `Esc` retorna à página sem descartar o conteúdo mantido pelo editor.

O bloqueio de edição dura cinco minutos e é renovado a cada dois minutos enquanto a sessão está ativa. Outra pessoa pode visualizar o processo, mas não editar a mesma versão simultaneamente.

### Corrigir os dados cadastrais

Em um processo com situação **Rascunho** ou **Ajustes solicitados**, selecione **Editar dados**. É possível alterar:

- nome e resumo;
- categoria e público atendido;
- unidade responsável;
- cenário atual ou futuro;
- visibilidade pública, interna ou restrita.

A URL canônica usa o UUID estável do processo e um trecho legível derivado do nome atual. Por isso, renomear o processo não quebra links antigos.

### Consultar um processo

Cada processo possui cinco visões:

- **Visão geral:** escopo, responsabilidade, participantes e encadeamentos registrados;
- **Diagrama:** visualização ou edição do BPMN;
- **Rastreabilidade:** tabela operacional, BPMN vinculado, prévia pública, dados/formulários e perfis/grupos;
- **Visão textual:** lista acessível dos eventos, atividades e decisões do XML;
- **Versões:** revisões e situações registradas.

As rotas podem ser copiadas e abertas diretamente, inclusive após recarregar a página:

```text
/catalogo
/mapa
/dados
/software
/processos/{uuid}/{nome-legivel}
/processos/{uuid}/{nome-legivel}/diagrama
/processos/{uuid}/{nome-legivel}/operacao
/processos/{uuid}/{nome-legivel}/estrutura
/processos/{uuid}/{nome-legivel}/versoes
```

Slugs antigos continuam aceitos como aliases e são redirecionados para a URL canônica atual.

### Remover uma versão em rascunho

Na aba **Versões**, selecione **Remover** ao lado de uma versão com situação **Rascunho** e confirme a operação. Versões em revisão, publicadas, substituídas ou arquivadas não podem ser removidas.

Se houver um bloqueio de edição ativo, encerre a edição antes de excluir. Quando o rascunho for a única versão, a confirmação informa que o cadastro do processo também será removido, evitando que permaneça um processo sem versão no catálogo. A remoção é definitiva; exporte o pacote antes se precisar preservar uma cópia.

### Revisar e publicar

Depois de salvar e encerrar a edição, use o painel **Ações disponíveis para você**. O servidor devolve somente as transições permitidas para o papel, a unidade e a situação corrente; a interface não presume autorização. A versão governada mais recente permanece no espaço interno, enquanto a última versão publicada continua sendo a fonte da projeção pública.

O fluxo de governança implementado na API é:

```text
DRAFT → UNIT_REVIEW → CURATOR_REVIEW → PUBLISHED
             ↘              ↘
              CHANGES_REQUESTED
```

Enviar, aprovar pela unidade, aprovar pela curadoria, solicitar ajustes e arquivar estão disponíveis no mesmo painel quando autorizados. Solicitar ajustes e arquivar exigem uma justificativa, preservada na auditoria. Cada avanço valida o BPMN; versões v2 também exigem vínculos técnicos aprovados pelo CGTI e um pacote integralmente válido.

## Importar e exportar

### Importar pela interface

No Catálogo, selecione **Importar processo**. São aceitos arquivos de até 15 MB:

- `.zip` no formato ProcessBundle v2;
- `.bpmn` ou `.xml` contendo BPMN 2.0.

Um BPMN puro exige um nome e uma unidade responsável, porque o XML não contém todos os campos do catálogo. O processo é criado como rascunho interno; complete os demais campos depois em **Editar dados**.

Um ProcessBundle v2 é validado primeiro em quarentena. A tela apresenta cobertura, conflitos e vínculos técnicos pendentes; somente depois a pessoa confirma a aplicação transacional. Pacotes incompletos não alteram parcialmente o catálogo. O endpoint legado continua aceitando v1 para migração controlada.

Ao terminar, a interface abre o processo importado.

### Exportar

Abra um processo e selecione **Exportar pacote**. Versões v2 preservam os arquivos, hashes e identidades necessários para reproduzir o release; versões legadas continuam sendo exportadas como v1.

## Persistência e segurança dos dados

Os diagramas, cadastros, revisões, pacotes, arquivos e eventos de auditoria ficam no banco indicado por `DATABASE_URL`. Na configuração recomendada, os dados sobrevivem a reinícios porque o Compose usa o volume `postgres-data`.

Parar os serviços preserva os dados:

```powershell
docker compose stop
```

Remover apenas os contêineres também preserva os volumes:

```powershell
docker compose down
```

O comando abaixo apaga definitivamente o banco local; use somente para reinicializar todo o ambiente:

```powershell
docker compose down -v
```

Para proteger um processo específico antes de mudanças maiores, use **Exportar pacote**. Em ambientes reais, mantenha também uma rotina de backup e restauração testada do PostgreSQL.

### Criar e restaurar um snapshot completo

Migrations alteram a estrutura do banco e não substituem backup. Para transportar todo o estado da plataforma, incluindo processos, versões, BPMNs, recursos v2 e auditoria, gere um snapshot lógico do PostgreSQL:

```powershell
pnpm db:snapshot:create -- C:\Backups\processos-furg
```

Se o diretório for omitido, o comando cria uma pasta datada dentro de `snapshots/`. O diretório gerado contém:

- `postgres.dump`, no formato custom do PostgreSQL;
- `SHA256SUMS`, usado para detectar corrupção ou alteração;
- `manifest.json`, com commit, versão do PostgreSQL, última migration e contagens de controle;
- `INSTRUCOES.txt`, com o comando mínimo de restauração.

Antes de transferir ou restaurar, valide o pacote:

```powershell
pnpm db:snapshot:inspect -- C:\Backups\processos-furg
```

No computador de destino, use a mesma revisão do repositório indicada no manifesto, inicie o PostgreSQL e restaure:

```powershell
docker compose up -d postgres
pnpm db:snapshot:restore -- C:\Backups\processos-furg --confirm-replace=processos
docker compose up -d api web
```

A confirmação precisa reproduzir exatamente o nome do banco. A restauração remove e recria o banco `processos`, valida o checksum, confere a última migration e compara as contagens registradas no manifesto. A API e a interface permanecem paradas após a restauração para permitir inspeção antes da inicialização.

Para testar sem tocar no banco principal, restaure em um banco cujo nome termine em `_restore_test`:

```powershell
pnpm db:snapshot:restore -- C:\Backups\processos-furg `
  --target-database=processos_restore_test `
  --confirm-replace=processos_restore_test
```

O snapshot não contém variáveis de ambiente, senhas, imagens Docker nem o repositório. Transfira esses itens separadamente e nunca inclua o `.env` em um pacote público. O procedimento operacional detalhado está em [docs/operacao-on-premises.md](docs/operacao-on-premises.md).

## Usar outro PostgreSQL

Edite `DATABASE_URL` no `.env` da raiz:

```dotenv
DATABASE_URL="postgresql://usuario:senha@localhost:5432/processos?schema=public"
```

O banco e o usuário precisam existir, e a senha deve ser a senha real reconhecida pelo PostgreSQL. Senhas armazenadas de forma cifrada ou codificada por outra aplicação não podem ser usadas diretamente pelo Prisma.

Se usuário ou senha contiverem caracteres reservados de URL, codifique somente esses componentes. Não codifique `localhost`, a porta ou o nome do banco. Depois, execute:

```powershell
pnpm db:generate
pnpm db:migrate
```

## Executar tudo em contêineres

Prepare o pacote do design system, se necessário, e construa a pilha:

```powershell
pnpm vendor:design-system
docker compose up --build -d
docker compose ps
```

O contêiner da API executa `prisma migrate deploy` antes de iniciar. Para disponibilizar as unidades e o acervo inicial de demonstração em uma instalação vazia, execute uma vez:

```powershell
docker compose exec api pnpm --filter @furg/processos-api prisma:seed
```

Lembre-se de que esse seed apaga dados existentes. A interface fica em `http://localhost:8080` e a API permanece em `http://localhost:3000/api/v1`.

Para acompanhar os logs:

```powershell
docker compose logs -f api web
```

Em produção, forneça credenciais por variáveis ou pelo gerenciador institucional de segredos, publique a aplicação atrás de TLS e substitua os valores de desenvolvimento.

## Variáveis principais

| Variável | Finalidade | Padrão local |
| --- | --- | --- |
| `DATABASE_URL` | conexão Prisma/PostgreSQL | banco `processos` em `localhost:55434` |
| `POSTGRES_PORT` | porta publicada pelo Compose | `55434` |
| `WEB_ORIGIN` | origem permitida pela API | `http://localhost:5173` |
| `API_PORT` | porta da API | `3000` |
| `AUTH_MODE` | adaptador de identidade | `development` |
| `VITE_API_URL` | API usada pelo frontend | `http://localhost:3000/api/v1` |
| `VITE_PUBLIC_SITE_URL` | endereço canônico público | `http://localhost:5173` |
| `VITE_PUBLIC_INDEXING` | permite indexação pública no build | `false` |

No modo `development`, a API aceita cabeçalhos demonstrativos. Em `AUTH_MODE=oidc`, o frontend usa Authorization Code + PKCE e a API valida JWT por JWKS, issuer e audience; os cabeçalhos recebidos do cliente são substituídos pelos claims verificados. Unidade e papel são avaliados em conjunto, e delegações explícitas continuam sob governança do CGTI.

## Navegação, compartilhamento e SEO

A aplicação atualiza título, descrição, URL canônica, Open Graph e dados estruturados conforme a página. Processos internos, restritos ou ainda não publicados recebem `noindex`.

Para uma futura publicação externa, configure antes do build:

```dotenv
VITE_PUBLIC_SITE_URL="https://processos.furg.br"
VITE_PUBLIC_INDEXING="true"
```

O Nginx do frontend encaminha acessos diretos às rotas para a aplicação. Para indexação ampla e prévias sociais consistentes em produção, ainda será necessário pré-renderizar as páginas públicas e gerar `sitemap.xml`.

## Logs e auditoria

No desenvolvimento local, os logs da API aparecem no terminal de `pnpm dev`. O salvamento de BPMN registra mensagens `BPMN_SAVED`; tentativas sem bloqueio válido registram `BPMN_SAVE_REJECTED`.

Em contêineres:

```powershell
docker compose logs --tail 200 api
docker compose logs -f api
```

As ações relevantes também geram registros de auditoria no PostgreSQL, como criação, alteração cadastral, salvamento, importação e transições de revisão. Quando outra revisão permanece, a remoção de um rascunho também é registrada nela; a exclusão de um processo composto apenas pelo rascunho permanece no log da API. Ainda não há uma tela administrativa para consultar essa trilha.

## Solução de problemas

### A interface mostra "Modo de demonstração"

O frontend não alcançou a API e carregou o fallback local. Confirme:

```powershell
docker compose ps
Test-NetConnection localhost -Port 3000
Invoke-RestMethod http://localhost:3000/api/v1/health
```

Confira também se `VITE_API_URL` corresponde ao endereço da API. Reinicie `pnpm dev` após alterar variáveis `VITE_*`.

### Prisma informa `DATABASE_URL` ausente

Crie `.env` na raiz a partir de `.env.example`. Use os scripts `pnpm db:*`, que carregam esse arquivo automaticamente.

### Prisma retorna `P1001`

O host ou a porta não está acessível. Na configuração padrão, confirme o PostgreSQL do Compose em `localhost:55434`:

```powershell
docker compose up -d postgres
Test-NetConnection localhost -Port 55434
```

### Prisma retorna `P1000`

O servidor respondeu, mas recusou as credenciais. Confirme usuário, senha e banco definidos em `DATABASE_URL`. Uma senha cifrada por outra aplicação não equivale à senha do papel no PostgreSQL.

### O diagrama reaparece em uma versão anterior

Antes de navegar, confirme a mensagem **Alterações salvas**. Se houver dúvida, não descarte a aba do editor: verifique os logs da API por `BPMN_SAVED`, recarregue o processo em outra aba e só então encerre a edição. A aplicação alerta ao tentar sair com alterações locais, mas não realiza salvamento automático.

## Qualidade

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Ou execute as verificações principais em sequência:

```powershell
pnpm check
```

O canvas mantém a atribuição obrigatória do bpmn.io. A visão textual oferece uma alternativa HTML semântica para consultar o fluxo sem depender apenas do diagrama visual.

## Limites desta versão

Não há execução de tarefas, telemetria, mineração de processos, geração de código, edição simultânea ou salvamento automático. A gestão visual de relações, a tela de consulta da trilha de auditoria, a edição de contratos de dados e a importação OpenAPI pela interface permanecem como próximas evoluções. Flowable, DMN e ArchiMate devem ser avaliados somente depois da validação do catálogo e de sua governança.
