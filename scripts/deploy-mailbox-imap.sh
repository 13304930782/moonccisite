#!/usr/bin/env bash
# Run only in a child shell; do not source in interactive SSH.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
live=/www/wwwroot/mooncci-source/server
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
node --check server/src/routes/mailboxes.js
node --check server/src/lib/mailboxImap.js
test -f "$live/src/routes/mailboxes.js"
test ! -e "$live/src/lib/mailboxImap.js"
test ! -e "$live/src/lib/mailbox-vendor"
baseline=$(cat BASELINE)
test "$(sha256sum "$live/src/routes/mailboxes.js" | cut -d' ' -f1)" = "$baseline"
api_id=$(pm jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const a=JSON.parse(s).filter(p=>p.pm2_env.pm_exec_path==="/www/wwwroot/mooncci-source/server/src/index.js"&&p.pm2_env.status==="online");if(a.length!==1)process.exit(1);console.log(a[0].pm_id)})')
[[ "$api_id" =~ ^[0-9]+$ ]]
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:3001/api/health >/dev/null
backup=$(mktemp -d /www/backup/mooncci-mailbox-imap.XXXXXX)
printf '%s\n' "$api_id" > "$backup/API_ID"
cp scripts/rollback-mailbox-imap.sh "$backup/rollback.sh"
cp -p "$live/src/routes/mailboxes.js" "$backup/mailboxes.js"
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
mkdir -p "$live/src/lib/mailbox-vendor"
cp -a server/src/lib/mailbox-vendor/node_modules "$live/src/lib/mailbox-vendor/"
chown -R mooncci:mooncci "$live/src/lib/mailbox-vendor"
install -o mooncci -g mooncci -m 644 server/src/lib/mailboxImap.js "$live/src/lib/mailboxImap.js"
install -o mooncci -g mooncci -m 644 server/src/routes/mailboxes.js "$live/src/routes/mailboxes.js"
cd "$live"
node -e "require('./src/lib/mailboxImap')"
pm restart "$api_id"
healthy=0
for attempt in $(seq 1 15); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health >/dev/null; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
printf 'PASS: isolated IMAP backend installed; API healthy. No worker, frontend, Nginx or database changes.\n'
