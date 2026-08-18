#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then echo "Uso: $0 /caminho/kit-offline" >&2; exit 2; fi
kit_dir=$1
case "$kit_dir" in ""|"/"|"."|"..") echo "Diretório de kit inseguro." >&2; exit 2;; esac
mkdir -p "$kit_dir/pnpm-store"

pnpm fetch --frozen-lockfile --store-dir "$kit_dir/pnpm-store"
docker compose build api web
docker pull postgres:17.10-alpine3.23@sha256:8189a1f6e40904781fc9e2612687877791d21679866db58b1de996b31fc312e4
docker pull minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
docker image save --output "$kit_dir/processos-furg-images.tar" \
  processos-furg-api:v2 processos-furg-web:v2 \
  postgres:17.10-alpine3.23@sha256:8189a1f6e40904781fc9e2612687877791d21679866db58b1de996b31fc312e4 \
  minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
sha256sum "$kit_dir/processos-furg-images.tar" > "$kit_dir/processos-furg-images.tar.sha256"
echo "Kit offline criado em $kit_dir"
