#!/usr/bin/env bash
set -Eeuo pipefail
mode=${1:?Use instrumentation, owner, owner-short or off}
case "$mode" in instrumentation|owner|owner-short|off) ;; *) exit 1 ;; esac
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
api_id=$(cat "$root/API_ID")
[[ "$api_id" =~ ^[0-9]+$ ]]
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
changed=0
recover() {
  rc=$?; trap - EXIT
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ] && [[ "$mode" = owner* ]]; then
    python3 "$root/files.py" mode /www/wwwroot/mooncci-source/server instrumentation
    pm restart "$api_id" || true
    echo 'Owner enable failed; reverted to instrumentation-only' >&2
  fi
  exit "$rc"
}
trap recover EXIT
if [[ "$mode" = owner* ]]; then
  pm jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const a=JSON.parse(s).filter(p=>p.pm2_env.pm_exec_path==="/www/wwwroot/mooncci-source/server/src/index.js");if(a.length!==1||a[0].pm2_env.status!=="online"||a[0].pm2_env.exec_mode!=="fork_mode"||String(a[0].pm2_env.NODE_APP_INSTANCE||0)!=="0")process.exit(1)})'
fi
python3 "$root/files.py" mode /www/wwwroot/mooncci-source/server "$mode"
changed=1
pm restart "$api_id"
for attempt in $(seq 1 15); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health >/dev/null; then echo "PASS: $mode"; exit 0; fi
  sleep 2
done
exit 1
