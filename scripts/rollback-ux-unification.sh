#!/usr/bin/env bash
# Run in a child shell. Restore the previous entry while retaining hashed assets.
set -Eeuo pipefail
backup=${1:?Pass the backup directory printed by deploy.sh}
web=${MOONCCI_WEB_ROOT:-/www/wwwroot/mooncci.site}
backup_root=${MOONCCI_BACKUP_ROOT:-/www/backup}
backup=$(realpath -e -- "$backup")
backup_root=$(realpath -e -- "$backup_root")
case "$backup" in "$backup_root"/mooncci-offline.*) ;; *) printf 'Unexpected backup directory\n' >&2; exit 1 ;; esac
test -s "$backup/index.html"
test -s "$web/index.html"
exec 9>"$backup_root/mooncci-deploy.lock"
flock -w 120 9
cp -p "$web/index.html" "$backup/index-before-rollback-$(date +%Y%m%d%H%M%S).html"
install -m 644 "$backup/index.html" "$web/.index-rollback.tmp"
mv -f "$web/.index-rollback.tmp" "$web/index.html"
cmp "$backup/index.html" "$web/index.html"
printf 'PASS: previous frontend entry restored. No PM2 restart or database changes.\n'
