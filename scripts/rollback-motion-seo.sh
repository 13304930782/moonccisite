#!/usr/bin/env bash
# Restore only this release's files; never remove the additive likes table or data.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
umask 077
backup=${1:?Pass verified backup directory}
case "$backup" in /www/backup/mooncci-motion-seo.*) ;; *) exit 2 ;; esac
test "$(readlink -f "$backup")" = "$backup"
node=/opt/mooncci-node-v24.20.0/bin/node
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then exec 9>/www/backup/mooncci-deploy.lock; flock -w 120 9; fi
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
pm stop mooncci-api mooncci-worker
"$node" "$backup/cleanup-motion-seo.cjs" remove "$backup/MANIFEST.json"
"$node" -e 'require(process.argv[1]).restore(process.argv[2],false)' "$backup/verify-bilingual-release.cjs" "$backup"
pm restart mooncci-api mooncci-worker
printf 'Restored scoped files; article-likes data retained.\n'
