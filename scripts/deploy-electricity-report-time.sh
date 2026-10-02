#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=${MOONCCI_SERVER_ROOT:-/www/wwwroot/mooncci-source/server}
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS
file=src/lib/electricityReport.js
test -s "$live/$file"
node --check "server/$file"
node - "$live/$file" <<'NODE'
const fs=require('fs'),crypto=require('crypto'),m=JSON.parse(fs.readFileSync('MANIFEST.json','utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(process.argv[2],'utf8').replace(/\r\n/g,'\n')).digest('hex');
if(![m.before,m.after].includes(hash))throw Error('Installed electricityReport.js differs; no files changed.');
NODE
pm(){ su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
pm describe mooncci-api >/dev/null
pm describe mooncci-worker >/dev/null
backup=$(mktemp -d /www/backup/mooncci-electricity-time.XXXXXX)
cp -p "$live/$file" "$backup/electricityReport.js"
printf '%s\n' "$live" > "$backup/LIVE_ROOT"
cp rollback.sh "$backup/rollback.sh"
changed=0
finish(){ rc=$?; trap - EXIT; if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then bash "$backup/rollback.sh" "$backup" || printf 'ROLLBACK NEEDS ATTENTION\n'; fi; printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"; exit "$rc"; }
trap finish EXIT
changed=1
install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"
pm restart mooncci-api mooncci-worker --update-env
healthy=0
for attempt in $(seq 1 30); do
 if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" && node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then healthy=1; break; fi
 sleep 2
done
test "$healthy" = 1
pm jlist > "$backup/processes.json"
node - "$backup/processes.json" <<'NODE'
const list=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));
for(const name of ['mooncci-api','mooncci-worker'])if(!list.some(p=>p.name===name&&p.pm2_env.status==='online'))throw Error(name+' not online');
NODE
pm save
printf 'PASS: report time precision fixed; no migration, historical report rewrite or mail resend.\n'
