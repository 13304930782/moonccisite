#!/usr/bin/env bash
# Run in a nohup child shell, never source.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
umask 077
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$package"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
sha256sum --strict -c SHA256SUMS >/dev/null
python3 experience-preview-release.py verify "$package"
node --check server/src/routes/settings.js
test -d /www/wwwroot/mooncci-source/server/runtime/node_modules/jsdom
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
pm jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const p=JSON.parse(s).filter(x=>x.name==="mooncci-api");if(p.length!==1||p[0].pm2_env.status!=="online")process.exit(1)})'
backup=$(mktemp -d /www/backup/mooncci-experience.XXXXXX)
printf '%s\n' "$backup" > BACKUP_PATH
printf 'BACKUP=%s\n' "$backup"
changed=0; stopped=0
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    pm stop mooncci-api
    rr=$?
    if [ "$rr" = 0 ]; then python3 "$backup/experience-preview-release.py" restore "$backup" > "$backup/rollback.log" 2>&1; rr=$?; fi
    printf '%s\n' "$rr" > "$backup/rollback-exit-code"
    if [ "$rr" = 0 ]; then pm restart mooncci-api; else echo 'ROLLBACK NEEDS ATTENTION'; fi
  elif [ "$rc" -ne 0 ] && [ "$stopped" = 1 ]; then pm restart mooncci-api; fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
python3 experience-preview-release.py snapshot "$package" "$backup"
printf 'snapshot-complete\n' > "$backup/STAGE"
stopped=1; pm stop mooncci-api
changed=1; printf 'installing\n' > "$backup/STAGE"
python3 experience-preview-release.py install "$package"
node --input-type=module -e 'await import("file:///www/wwwroot/mooncci-source/server/runtime/document.mjs")'
pm restart mooncci-api
ready=0
for attempt in $(seq 1 30); do
  if node -e 'fetch("http://127.0.0.1:3001/api/health",{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok||(await r.json()).ok!==true)process.exit(1)}).catch(()=>process.exit(1))'; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1
printf 'complete\n' > "$backup/STAGE"
echo 'PASS: frontend, SSR and site settings deployed; API healthy.'
