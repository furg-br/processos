#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then echo "Uso: $0 /caminho/kit-offline" >&2; exit 2; fi
kit_dir=$1
(
  cd "$kit_dir"
  sha256sum --check processos-furg-images.tar.sha256
)
docker image load --input "$kit_dir/processos-furg-images.tar"
pnpm install --offline --frozen-lockfile --store-dir "$kit_dir/pnpm-store"
echo "Imagens e dependências locais instaladas. Revise .env e execute: docker compose up -d --no-build"
