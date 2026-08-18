# Política de licenças

O código deste repositório é distribuído sob MIT. Dependências de runtime e build devem usar licenças aprovadas pela FURG e compatíveis com distribuição e operação on-premises.

Categorias aceitas por padrão: MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, CC0-1.0, 0BSD e Unicode-DFS. LGPL/MPL exigem revisão de modo de vínculo e distribuição. GPL/AGPL, licenças source-available, open-core com restrição funcional, cláusulas de não competição e licenças sem SPDX exigem decisão arquitetural e jurídica explícita antes da inclusão.

Cada release executa `pnpm sbom` e arquiva `artifacts/sbom.cdx.json`. A revisão compara o SBOM com o anterior, investiga componentes sem licença conhecida e bloqueia dependência que imponha serviço externo obrigatório ou restrinja instalação institucional.

O tarball do DS-FURG é dependência local versionada. Sua licença e origem devem ser verificadas na atualização do arquivo em `vendor/`.
