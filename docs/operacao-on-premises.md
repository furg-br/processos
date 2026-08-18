# Operação on-premises

A aplicação não depende de SaaS em runtime. PostgreSQL, armazenamento S3 compatível, API, frontend, schemas, CLI e fixtures podem operar em rede interna. Agentes externos apenas consomem ou produzem arquivos conforme o contrato aberto.

## Implantação

- fixe imagens por versão e digest;
- espelhe dependências e o tarball versionado do DS-FURG internamente;
- use `pnpm install --offline --frozen-lockfile` após popular o store;
- execute `prisma migrate deploy` antes da API;
- publique por proxy TLS institucional;
- configure OIDC/SAML e desative `AUTH_MODE=development`.

O Compose e os Dockerfiles já fixam tag e digest de PostgreSQL, MinIO, Node e Nginx. A atualização de qualquer imagem exige revisão do digest, SBOM e teste de restauração. Em produção, configure o mesmo provedor OIDC genérico nos dois lados:

- API: `AUTH_MODE=oidc`, `SSO_ISSUER`, `SSO_JWKS_URL`, `SSO_CLIENT_ID`;
- web: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI` e `VITE_OIDC_SCOPE`.

O cliente usa Authorization Code + PKCE e guarda a sessão em `sessionStorage`. Os claims institucionais esperados são `furg_roles` e, preferencialmente, `furg_process_unit_ids`. Este segundo claim deve conter somente unidades que a identidade pode administrar na plataforma de processos; `furg_unit_ids` é aceito como fallback de compatibilidade e não deve ser preenchido apenas com vínculos funcionais genéricos. O middleware verifica assinatura, issuer, audience e expiração antes de substituir qualquer header de identidade recebido.

Para uma rede sem internet, execute `scripts/prepare-offline-kit.sh /destino/kit` em uma estação conectada. O roteiro baixa o store fechado pelo lockfile, constrói as duas imagens da aplicação, salva todas as imagens com checksum e não inclui segredos. Transfira o repositório e o kit; na rede isolada, execute `scripts/install-offline-kit.sh /origem/kit`, revise `.env` e suba com `docker compose up -d --no-build`.

## Backup e restauração

Backup consistente:

1. pausar publicações/importações ou obter snapshot coordenado;
2. executar `pg_dump --format=custom`;
3. copiar o bucket de objetos com versões;
4. guardar configuração sem segredos e digests das imagens;
5. registrar release e checksums.

Restauração verificável:

1. restaurar com `pg_restore` em banco vazio;
2. restaurar objetos;
3. iniciar a mesma release;
4. verificar health check, releases e exportação de um v2 publicado;
5. validar o ZIP pela CLI e comparar seu `bundleHash`.

A existência de backup sem teste periódico de restauração não satisfaz o controle.

Os roteiros `scripts/backup-on-prem.sh` e `scripts/restore-test-on-prem.sh` tornam o procedimento repetível. O segundo exige banco terminado em `_restore_test` e bucket S3 com o marcador DNS válido `-restore-test`, recusa alvos sem essas marcas e preserva o ambiente restaurado para inspeção. Ele não deve apontar para produção.

O ciclo de referência foi executado em 16 de agosto de 2026 com PostgreSQL e MinIO ativos. A release RSC, o ZIP persistido no banco e a cópia no armazenamento de objetos mantiveram o mesmo SHA-256 após restauração isolada. O relatório está em `artifacts/operational-validation/restore-report.json`. Cada ambiente produtivo continua obrigado a repetir periodicamente esse controle com seus próprios volumes, chaves e política de retenção.

## Observabilidade e segurança

Registre imports aceitos/rejeitados, decisões CGTI, revisão/publicação, drift Git, falhas e latência. Não registre conteúdo restrito, documentos ou segredos.

A API expõe métricas Prometheus em `/api/v1/metrics` somente após autenticação fora do modo de desenvolvimento. O endpoint inclui métricas do processo Node, contagem e latência HTTP por rota/status; a implantação pode conectá-lo a Prometheus e Grafana locais.

Quando uma verificação Git detecta drift, a mesma transação grava um evento `process.source-drift.detected` no outbox. Configure `PROCESS_REVIEW_WEBHOOK_URL` e `PROCESS_REVIEW_WEBHOOK_SECRET`; um administrador CGTI pode chamar `POST /api/v1/governance/review-webhooks/dispatch`. A entrega usa `x-processos-signature-256` (HMAC-SHA-256), timeout de 10 segundos e retentativa exponencial, sem depender de GitHub ou GitLab.

- limite upload também no proxy;
- gere SBOM CycloneDX ou SPDX por release e aplique política de licenças;
- teste expiração e rotação de credenciais;
- teste teclado, reflow, contraste e leitor de tela nas visões BPMN, tabela, importação e projeção pública.
