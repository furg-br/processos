#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: DATABASE_URL=... S3_ALIAS=... S3_BUCKET=... $0 /caminho/backup" >&2
  exit 2
fi
: "${DATABASE_URL:?DATABASE_URL é obrigatória}"
: "${S3_ALIAS:?S3_ALIAS configurado no cliente mc é obrigatório}"
: "${S3_BUCKET:?S3_BUCKET é obrigatório}"

backup_dir=$1
case "$backup_dir" in ""|"/"|"."|"..") echo "Diretório de backup inseguro." >&2; exit 2;; esac
mkdir -p "$backup_dir/objects"

pg_dump --dbname="$DATABASE_URL" --format=custom --file="$backup_dir/postgres.dump"
mc mirror --preserve "$S3_ALIAS/$S3_BUCKET" "$backup_dir/objects"
(
  cd "$backup_dir"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
echo "Backup criado em $backup_dir"
