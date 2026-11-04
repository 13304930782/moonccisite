#!/usr/bin/env bash
# Keep translated data. Once backend starts, never restore a locale-unaware backend.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
umask 077
backup=${1:?Pass verified backup directory}
case "$backup" in /www/backup/mooncci-bilingual.*) ;; *) exit 2 ;; esac
test "$(readlink -f "$backup")" = "$backup"
node=/opt/mooncci-node-v24.20.0/bin/node
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then exec 9>/www/backup/mooncci-deploy.lock; flock -w 120 9; fi
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
if [ -f "$backup/BACKEND_STARTED" ] || [ -f "$backup/SUCCESS" ]; then
  # New writes may already exist. Keep matching code/runtime/assets/ops and recover processes only.
  pm restart mooncci-api mooncci-worker
  printf 'Manual recovery required: bilingual backend has started; all compatible files and translated data retained. No old frontend/SSR/ops restored. Backup: %s\n' "$backup" >&2
  exit 3
fi
pm stop mooncci-api mooncci-worker
"$node" "$backup/verify-bilingual-release.cjs" restore "$backup"
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
pm restart mooncci-api mooncci-worker
printf 'Rollback restored pre-start scoped files and Nginx; additive schema and historical SQL retained.\n'
