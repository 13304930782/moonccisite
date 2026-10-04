#!/usr/bin/env bash
# Run in a nohup child shell. No environment edits, dependencies or migrations.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
python3 site-diagnostics-files.py preflight "$package"
scope=$(python3 -c 'import json;print(json.load(open("FILES.json"))["scope"])')
if [ "$scope" = api ]; then
  node --check server/src/index.js
  node --check server/src/lib/siteDiagnostics.js
  api_id=$(su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 jlist' | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const a=JSON.parse(s).filter(p=>p.pm2_env.pm_exec_path==="/www/wwwroot/mooncci-source/server/src/index.js"&&p.pm2_env.status==="online");if(a.length!==1)process.exit(1);console.log(a[0].pm_id)})')
  [[ "$api_id" =~ ^[0-9]+$ ]]
  curl -fsS --max-time 5 http://127.0.0.1:3001/api/health >/dev/null
else
  test "$scope" = reader
  node --check edge/reader/server.mjs
  systemctl is-active --quiet mooncci-reader
fi
backup=$(mktemp -d /www/backup/mooncci-site-diagnostics.XXXXXX)
python3 site-diagnostics-files.py backup "$package" "$backup"
cp site-diagnostics-files.py rollback-site-diagnostics.sh "$backup/"
printf '%s\n' "${api_id:-}" > "$backup/API_ID"
changed=0
finish() {
  rc=$?;trap - EXIT
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    MOONCCI_DEPLOY_LOCK_HELD=1 bash "$backup/rollback-site-diagnostics.sh" "$backup" || echo 'ROLLBACK NEEDS ATTENTION'
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
changed=1
python3 site-diagnostics-files.py install "$package"
if [ "$scope" = api ]; then
  su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart $api_id"
else systemctl restart mooncci-reader; fi
ready=0
for attempt in $(seq 1 20); do
  if [ "$scope" = api ]; then
    if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health >/dev/null; then ready=1;break;fi
  elif systemctl is-active --quiet mooncci-reader && [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3102/_reader/health || true)" = 403 ]; then ready=1;break;fi
  sleep 1
done
test "$ready" = 1
echo 'PASS: opt-in diagnostics deployed; mail flags, credentials and data unchanged.'
