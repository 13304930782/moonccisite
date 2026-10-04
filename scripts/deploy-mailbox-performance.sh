#!/usr/bin/env bash
# Execute in a nohup child shell, never source.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
while read -r file; do node --check "$file"; done < <(find server -name '*.js' -type f)
python3 files.py preflight "$package"
api_id=$(pm jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const a=JSON.parse(s).filter(p=>p.pm2_env.pm_exec_path==="/www/wwwroot/mooncci-source/server/src/index.js");if(a.length!==1||a[0].pm2_env.status!=="online"||a[0].pm2_env.exec_mode!=="fork_mode")process.exit(1);console.log(a[0].pm_id)})')
[[ "$api_id" =~ ^[0-9]+$ ]]
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:3001/api/health >/dev/null
backup=$(mktemp -d /www/backup/mooncci-mail-perf.XXXXXX)
python3 files.py backup "$package" "$backup"
cp files.py rollback.sh mode.sh "$backup/"
printf '%s\n' "$api_id" > "$backup/API_ID"
changed=0
finish() {
  rc=$?; trap - EXIT
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    MOONCCI_DEPLOY_LOCK_HELD=1 bash "$backup/rollback.sh" "$backup" || echo 'ROLLBACK NEEDS ATTENTION' >&2
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
changed=1
python3 files.py install "$package"
python3 files.py mode /www/wwwroot/mooncci-source/server instrumentation
pm restart "$api_id"
healthy=0
for attempt in $(seq 1 15); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health >/dev/null; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'X-Requested-With: XMLHttpRequest' http://127.0.0.1:3001/api/mailboxes/folders/inbox)" = 401
echo 'PASS: instrumentation enabled; owner pooling remains OFF. No migrations, dependency or mail-server changes.'
