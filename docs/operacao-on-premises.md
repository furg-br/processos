# Operação on-premises

A aplicação não depende de SaaS em runtime. PostgreSQL, API, frontend, schemas, CLI e fixtures sintéticas podem operar em rede interna. Agentes externos apenas consomem ou produzem pacotes exportados conforme o contrato aberto.

## Implantação

- fixe imagens por versão e digest;
- espelhe dependências e o tarball versionado do DS-FURG internamente;
- use `pnpm install --offline --frozen-lockfile` após popular o store;
- execute `prisma migrate deploy` antes da API;
- publique por proxy TLS institucional;
- configure OIDC/SAML e desative `AUTH_MODE=development`.

O Compose e os Dockerfiles já fixam tag e digest de PostgreSQL, Node e Nginx. A atualização de qualquer imagem exige revisão do digest, SBOM e teste de restauração. Em produção, configure o mesmo provedor OIDC genérico nos dois lados:

- API: `AUTH_MODE=oidc`, `SSO_ISSUER`, `SSO_JWKS_URL`, `SSO_CLIENT_ID`;
- web: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI` e `VITE_OIDC_SCOPE`.

O cliente usa Authorization Code + PKCE e guarda a sessão em `sessionStorage`. Os claims institucionais esperados são `furg_roles` e, preferencialmente, `furg_process_unit_ids`. Este segundo claim deve conter somente unidades que a identidade pode administrar na plataforma de processos; `furg_unit_ids` é aceito como fallback de compatibilidade e não deve ser preenchido apenas com vínculos funcionais genéricos. O middleware verifica assinatura, issuer, audience e expiração antes de substituir qualquer header de identidade recebido.

Para uma rede sem internet, execute `scripts/prepare-offline-kit.sh /destino/kit` em uma estação conectada. O roteiro baixa o store fechado pelo lockfile, constrói as duas imagens da aplicação, salva todas as imagens com checksum e não inclui segredos. Transfira o repositório e o kit; na rede isolada, execute `scripts/install-offline-kit.sh /origem/kit`, revise `.env` e suba com `docker compose up -d --no-build`.

## Backup e restauração

### Responsabilidade de cada mecanismo

- migrations Prisma versionam tabelas, índices, constraints e transformações de esquema;
- o bootstrap ou seed cria somente dados iniciais deliberadamente descartáveis;
- ProcessBundle v2 transporta processos selecionados entre instalações;
- o snapshot PostgreSQL transporta o estado integral de uma instalação.

O comando `pnpm db:seed` não é uma restauração. Ele apaga dados das tabelas gerenciadas pelo seed e recria o acervo demonstrativo. Nunca o execute para recuperar um ambiente com trabalho que precise ser preservado.

### Snapshot integral

O roteiro `scripts/db-snapshot.mjs` usa `pg_dump` e `pg_restore` da imagem PostgreSQL fixada no Compose. Assim, a máquina operadora não precisa instalar as ferramentas cliente do PostgreSQL.

Crie o snapshot a partir da raiz do repositório:

```powershell
pnpm db:snapshot:create -- C:\Backups\processos-furg-2026-08-18
```

Em Linux, o mesmo comando aceita um caminho POSIX:

```bash
pnpm db:snapshot:create -- /srv/backups/processos-furg-2026-08-18
```

O diretório de destino não pode existir. Essa regra evita sobrescrever silenciosamente um backup anterior. Se nenhum caminho for informado, o roteiro usa `snapshots/processos-<data-hora>`; essa pasta é ignorada pelo Git.

O snapshot contém somente:

| Arquivo | Finalidade |
| --- | --- |
| `postgres.dump` | dump lógico completo no formato custom do PostgreSQL |
| `SHA256SUMS` | hash SHA-256 do dump |
| `manifest.json` | versão da aplicação, commit, PostgreSQL, migration e contagens |
| `INSTRUCOES.txt` | lembrete de validação e restauração |

O manifesto registra se o repositório tinha alterações locais. Um snapshot gerado com `gitDirty: true` é restaurável, mas a reprodução do código exige transportar ou versionar as alterações correspondentes.

Valide o snapshot antes e depois da transferência:

```powershell
pnpm db:snapshot:inspect -- C:\Backups\processos-furg-2026-08-18
```

O comando recalcula o SHA-256 e rejeita arquivos ausentes, alterados ou em formato desconhecido.

### Restaurar em outro computador

1. obtenha o repositório e, preferencialmente, faça checkout do commit indicado no `manifest.json`;
2. recrie o `.env` sem copiar segredos por canais inseguros;
3. instale as dependências ou carregue o kit offline;
4. coloque o diretório do snapshot em armazenamento local;
5. inicie somente o PostgreSQL;
6. inspecione e restaure o snapshot;
7. inicie API e interface após a validação.

Exemplo:

```powershell
docker compose up -d postgres
pnpm db:snapshot:inspect -- C:\Backups\processos-furg-2026-08-18
pnpm db:snapshot:restore -- C:\Backups\processos-furg-2026-08-18 --confirm-replace=processos
docker compose up -d api web
docker compose ps
```

A restauração do banco principal é intencionalmente destrutiva. O roteiro:

1. valida o manifesto e o checksum antes de alterar o destino;
2. exige `--confirm-replace=processos`;
3. inicia o serviço PostgreSQL;
4. para API e interface para impedir novas conexões;
5. remove e recria somente o banco `processos`;
6. executa `pg_restore` com erro imediato;
7. compara processos, versões, recursos, auditoria e última migration com o manifesto;
8. mantém API e interface paradas para inspeção explícita.

O snapshot não transporta `.env`, senhas de papéis PostgreSQL, configuração do provedor OIDC, certificados, imagens Docker nem segredos de webhooks. Esses itens pertencem à configuração segura do ambiente.

### Testar a restauração sem substituir o banco principal

Use um banco terminado em `_restore_test`:

```powershell
pnpm db:snapshot:restore -- C:\Backups\processos-furg-2026-08-18 `
  --target-database=processos_restore_test `
  --confirm-replace=processos_restore_test
```

Nesse modo, API e interface não são interrompidas. Depois da inspeção, remova exclusivamente o banco de teste:

```powershell
docker compose exec -T postgres psql -U processos -d postgres `
  -v ON_ERROR_STOP=1 `
  -c "DROP DATABASE IF EXISTS processos_restore_test WITH (FORCE);"
```

### Política operacional

Para cada ciclo de backup:

1. pausar publicações/importações ou obter snapshot coordenado;
2. executar `pnpm db:snapshot:create`;
3. guardar configuração sem segredos e digests das imagens;
4. transferir o diretório completo, sem separar dump, manifesto e checksum;
5. registrar release, local de guarda, responsável e prazo de retenção.

Periodicamente:

1. restaurar em um banco terminado em `_restore_test`;
2. iniciar a mesma release;
3. verificar health check, releases e exportação de um v2 publicado;
4. validar o ZIP pela CLI e comparar seu `bundleHash`.

A existência de backup sem teste periódico de restauração não satisfaz o controle.

Os roteiros legados `scripts/backup-on-prem.sh` e `scripts/restore-test-on-prem.sh` permanecem disponíveis para ambientes Unix que já os automatizam. Para novas instalações, prefira `scripts/db-snapshot.mjs`, que adiciona manifesto, inspeção, confirmação destrutiva e validação de contagens.

O ciclo histórico de referência foi executado em 16 de agosto de 2026 antes da consolidação no PostgreSQL. O procedimento atual deve comprovar que a release, seus recursos e o ZIP persistido mantêm o mesmo SHA-256 após restauração isolada. Cada ambiente continua obrigado a repetir periodicamente esse controle com seus próprios volumes e política de retenção.

## Observabilidade e segurança

Registre imports aceitos/rejeitados, decisões CGTI, revisão/publicação, drift Git, falhas e latência. Não registre conteúdo restrito, documentos ou segredos.

A API expõe métricas Prometheus em `/api/v1/metrics` somente após autenticação fora do modo de desenvolvimento. O endpoint inclui métricas do processo Node, contagem e latência HTTP por rota/status; a implantação pode conectá-lo a Prometheus e Grafana locais.

Quando uma verificação Git detecta drift, a mesma transação grava um evento `process.source-drift.detected` no outbox. Configure `PROCESS_REVIEW_WEBHOOK_URL` e `PROCESS_REVIEW_WEBHOOK_SECRET`; um administrador CGTI pode chamar `POST /api/v1/governance/review-webhooks/dispatch`. A entrega usa `x-processos-signature-256` (HMAC-SHA-256), timeout de 10 segundos e retentativa exponencial, sem depender de GitHub ou GitLab.

- limite upload também no proxy;
- gere SBOM CycloneDX ou SPDX por release e aplique política de licenças;
- teste expiração e rotação de credenciais;
- teste teclado, reflow, contraste e leitor de tela nas visões BPMN, tabela, importação e projeção pública.
