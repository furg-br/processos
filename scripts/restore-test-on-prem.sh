#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Uso: RESTORE_ADMIN_URL=... RESTORE_TEST_DATABASE=processos_restore_test RESTORE_TEST_URL=... S3_TEST_TARGET=alias/processos-restore-test-data $0 /caminho/backup" >&2
  exit 2
fi
: "${RESTORE_ADMIN_URL:?RESTORE_ADMIN_URL é obrigatória}"
: "${RESTORE_TEST_DATABASE:?RESTORE_TEST_DATABASE é obrigatório}"
: "${RESTORE_TEST_URL:?RESTORE_TEST_URL é obrigatória}"
: "${S3_TEST_TARGET:?S3_TEST_TARGET (alias/bucket exclusivo de teste) é obrigatório}"

case "$RESTORE_TEST_DATABASE" in *_restore_test) ;; *) echo "O banco de destino deve terminar em _restore_test." >&2; exit 2;; esac
case "$S3_TEST_TARGET" in */restore-test-*|*/*-restore-test|*/*-restore-test-*) ;; *) echo "O bucket S3 deve usar nome DNS e conter o marcador -restore-test." >&2; exit 2;; esac

backup_dir=$1
test -f "$backup_dir/postgres.dump"
test -f "$backup_dir/SHA256SUMS"
(
  cd "$backup_dir"
  sha256sum --check SHA256SUMS
)

# O alvo é validado acima antes das únicas operações destrutivas deste roteiro.
dropdb --dbname="$RESTORE_ADMIN_URL" --if-exists "$RESTORE_TEST_DATABASE"
createdb --maintenance-db="$RESTORE_ADMIN_URL" "$RESTORE_TEST_DATABASE"
pg_restore --exit-on-error --no-owner --dbname="$RESTORE_TEST_URL" "$backup_dir/postgres.dump"
mc mirror --overwrite "$backup_dir/objects" "$S3_TEST_TARGET"
psql "$RESTORE_TEST_URL" --set=ON_ERROR_STOP=1 --command='SELECT count(*) AS releases_restaurados FROM "ProcessRelease";'
echo "Restauração validada. Banco e bucket de teste foram preservados para inspeção e remoção controlada."
