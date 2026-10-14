#!/usr/bin/env bash
# Execute with nohup bash rollback.sh BACKUP in a child shell. Never source.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then printf 'Run this script in a child shell.\n' >&2; return 2; fi
set -Eeuo pipefail
umask 077
backup=$(realpath -- "${1:?Pass the works backup directory}")
case "$backup" in /www/backup/mooncci-works-main.*|/www/backup/mooncci-works-reader.*) ;; *) exit 2 ;; esac
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
 tar -xpf "$backup/backend-before.tar" -C "$live"
 tar -xpf "$backup/source-before.tar" -C "$(dirname "$live")"
 # Restore managed SSR files while leaving the runtime directory and active
 # worker/deployment state paths in place. Stage entries on the same filesystem.
 restore=$(mktemp -d "$live/.runtime-works-restore.XXXXXX")
 tar -xpf "$backup/runtime-before.tar" -C "$restore"
 chown -R mooncci:mooncci "$restore"
 chmod -R u=rwX,go=rX "$restore"
 incoming=$(mktemp -d "$live/.runtime-works-rollback-incoming.XXXXXX")
 rsync -ac --temp-dir="$incoming" --exclude=/document.mjs --exclude=/styles.json --exclude=/home.css "$restore/" "$live/runtime/"
 for entry in document.mjs styles.json home.css; do
   install -o mooncci -g mooncci -m 644 "$restore/$entry" "$incoming/$entry"
   mv -f -- "$incoming/$entry" "$live/runtime/$entry"
 done
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
printf 'PASS: works rollback bytes, original covers and health verified; new nullable icon column and data retained. BACKUP=%s\n' "$backup"
