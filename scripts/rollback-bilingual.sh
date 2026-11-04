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
pm stop mooncci-api mooncci-worker
"$node" "$backup/verify-bilingual-release.cjs" restore "$backup"
pm restart mooncci-api mooncci-worker
printf 'Rollback restored scoped files; database and historical SQL retained. After backend activation only presentation files are restored. Review matching Nginx and sitemap changes separately.\n'
