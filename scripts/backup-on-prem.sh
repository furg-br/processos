#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: DATABASE_URL=... $0 /caminho/backup" >&2
  exit 2
fi
: "${DATABASE_URL:?DATABASE_URL é obrigatória}"

backup_dir=$1
case "$backup_dir" in ""|"/"|"."|"..") echo "Diretório de backup inseguro." >&2; exit 2;; esac
mkdir -p "$backup_dir"

pg_dump --dbname="$DATABASE_URL" --format=custom --file="$backup_dir/postgres.dump"
(
  cd "$backup_dir"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
echo "Backup criado em $backup_dir"
