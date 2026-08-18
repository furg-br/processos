#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: RESTORE_ADMIN_URL=... RESTORE_TEST_DATABASE=processos_restore_test RESTORE_TEST_URL=... $0 /caminho/backup" >&2
  exit 2
fi
: "${RESTORE_ADMIN_URL:?RESTORE_ADMIN_URL é obrigatória}"
: "${RESTORE_TEST_DATABASE:?RESTORE_TEST_DATABASE é obrigatório}"
: "${RESTORE_TEST_URL:?RESTORE_TEST_URL é obrigatória}"

case "$RESTORE_TEST_DATABASE" in *_restore_test) ;; *) echo "O banco de destino deve terminar em _restore_test." >&2; exit 2;; esac

backup_dir=$1
test -f "$backup_dir/postgres.dump"
test -f "$backup_dir/SHA256SUMS"
(
  cd "$backup_dir"
  sha256sum --check SHA256SUMS
)

# O nome do banco é validado acima antes das operações destrutivas deste roteiro.
dropdb --dbname="$RESTORE_ADMIN_URL" --if-exists "$RESTORE_TEST_DATABASE"
createdb --maintenance-db="$RESTORE_ADMIN_URL" "$RESTORE_TEST_DATABASE"
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_TEST_URL" "$backup_dir/postgres.dump"
psql "$RESTORE_TEST_URL" --set=ON_ERROR_STOP=1 --command='SELECT count(*) AS releases_restaurados FROM "ProcessRelease";'
echo "Restauração validada. O banco de teste foi preservado para inspeção e remoção controlada."
