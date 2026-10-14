#!/usr/bin/env bash
# Execute with nohup bash rollback.sh BACKUP in a child shell. Never source.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then printf 'Run this script in a child shell.\n' >&2; return 2; fi
set -Eeuo pipefail
umask 077
backup=$(realpath -- "${1:?Pass the cover-focus backup directory}")
case "$backup" in /www/backup/mooncci-cover-focus-main.*|/www/backup/mooncci-cover-focus-reader.*) ;; *) exit 2 ;; esac
test -f "$backup/BACKUP_SHA256SUMS"
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then
 exec 9>/www/backup/mooncci-deploy.lock
 flock -w 120 9
fi
(cd "$backup" && sha256sum --strict -c BACKUP_SHA256SUMS >/dev/null)
node=$(cat "$backup/NODE")
case "$node" in /usr/bin/node|/opt/mooncci-node-v24.20.0/bin/node) ;; *) exit 2 ;; esac
mode=$("$node" -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).target' "$backup/BEFORE.json")
web=$("$node" -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).web' "$backup/BEFORE.json")
live=/www/wwwroot/mooncci-source/server
case "$mode:$web" in main:/www/wwwroot/mooncci.site|reader:/opt/mooncci-reader/releases/*/dist) ;; *) exit 2 ;; esac
test "$(realpath -- "$web")" = "$web"
if [ "$mode" = reader ]; then test "$(readlink -f /opt/mooncci-reader/current/dist)" = "$web"; fi
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
"$node" "$backup/verify.cjs" rollback-guard "$backup"
# Restore only reviewed frontend sources, runtime and assets; no database operations.
tar -xpf "$backup/frontend-before.tar" -C "$web"
if [ "$mode" = main ]; then
 tar -xpf "$backup/source-before.tar" -C "$(dirname "$live")"
 # A complete tar snapshot also recovers failures between the two runtime renames.
 restore=$(mktemp -d "$live/.runtime-cover-focus-restore.XXXXXX")
 tar -xpf "$backup/runtime-before.tar" -C "$restore"
 chown -R mooncci:mooncci "$restore"
 chmod -R u=rwX,go=rX "$restore"
 if [ -d "$live/runtime" ]; then mv -- "$live/runtime" "$backup/runtime-failed-$(date +%s)-$$"; fi
 mv -- "$restore" "$live/runtime"
fi
"$node" "$backup/verify.cjs" remove-new "$backup"
"$node" "$backup/verify.cjs" restored "$backup" > "$backup/restored.log"
if [ "$mode" = main ]; then
 pm reload mooncci-api
 ready=0
 for attempt in $(seq 1 30); do
   if "$node" -e 'fetch("http://127.0.0.1:3001/api/health",{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok||(await r.json()).ok!==true)process.exit(1)}).catch(()=>process.exit(1))'; then ready=1; break; fi
   sleep 2
 done
 test "$ready" = 1
 pm jlist | "$node" "$backup/verify.cjs" pm2 "$backup" "$backup/pm2-restored.json"
fi
printf 'PASS: cover-focus rollback bytes, original covers and health verified; database untouched. BACKUP=%s\n' "$backup"
