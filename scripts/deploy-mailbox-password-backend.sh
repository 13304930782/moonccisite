#!/usr/bin/env bash
# Run via nohup bash in a child shell; never source in an interactive SSH session.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
node --check server/src/routes/mailboxes.js
node --check server/scripts/migrate-mailbox-passwords.js
test -f "$live/src/routes/mailboxes.js"
test -f "$live/.env"
node - "$live/src/routes/mailboxes.js" <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const hash=x=>crypto.createHash('sha256').update(x.replace(/\r\n/g,'\n')).digest('hex');
const current=hash(fs.readFileSync(process.argv[2],'utf8'));
const next=hash(fs.readFileSync('server/src/routes/mailboxes.js','utf8'));
const baseline=fs.readFileSync('BASELINE','utf8').trim();
if(current!==baseline&&current!==next)throw Error('Unreviewed live mailbox route');
NODE
api_id=$(pm jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const a=JSON.parse(s).filter(p=>p.pm2_env.pm_exec_path==="/www/wwwroot/mooncci-source/server/src/index.js"&&p.pm2_env.status==="online");if(a.length!==1)process.exit(1);console.log(a[0].pm_id)})')
[[ "$api_id" =~ ^[0-9]+$ ]]
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:3001/api/health >/dev/null
backup=$(mktemp -d /www/backup/mooncci-mailbox-password.XXXXXX)
cp -p "$live/src/routes/mailboxes.js" "$backup/mailboxes.js"
cp rollback.sh "$backup/rollback.sh"
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
node server/scripts/migrate-mailbox-passwords.js "$live"
changed=1
install -o mooncci -g mooncci -m 644 server/src/routes/mailboxes.js "$live/src/routes/mailboxes.js"
cmp -s server/src/routes/mailboxes.js "$live/src/routes/mailboxes.js"
pm restart "$api_id"
healthy=0
for attempt in $(seq 1 15); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" 2> "$backup/health-error.log" && node -e 'try{if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)}catch{process.exit(1)}' "$backup/health.json"; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'X-Requested-With: XMLHttpRequest' -X POST http://127.0.0.1:3001/api/mailboxes/credentials/code)" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' -H 'X-Requested-With: XMLHttpRequest' -X POST http://127.0.0.1:3001/api/mailboxes/agent/rotation-claim)" = 401
printf 'PASS: mailbox password API and additive migration installed; API healthy. No frontend, worker, dependencies or Nginx changes.\n'
