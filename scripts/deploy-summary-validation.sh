#!/usr/bin/env bash
# Launch with nohup bash in a child shell; do not source into interactive SSH.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
service=src/services/articleSummary.js
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-summary-validation.XXXXXX)
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
finish() {
 rc=$?; trap - EXIT
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then bash "$backup/rollback.sh" "$backup" || printf 'ROLLBACK NEEDS ATTENTION: %s\n' "$backup"; fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/package-checksums.log"
node - "$live" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const live=process.argv[2],m=JSON.parse(fs.readFileSync('MANIFEST.json','utf8'));
if(m.service!=='src/services/articleSummary.js'||m.frontend||m.dependencies_changed||m.env_changes||m.migrations.length)throw Error('Unexpected release scope');
const sha=data=>crypto.createHash('sha256').update(data.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const actual=sha(fs.readFileSync(path.join(live,m.service)));
if(actual!==m.previous_sha256&&actual!==m.next_sha256)throw Error('Unreviewed live service change');
if(sha(fs.readFileSync(path.join('server',m.service)))!==m.next_sha256)throw Error('Service checksum mismatch');
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node 24 required');
NODE
node --check "server/$service"
pm describe mooncci-api > "$backup/api-before.txt"
pm describe mooncci-worker > "$backup/worker-before.txt"
cp -p "$live/$service" "$backup/articleSummary.js"
cp rollback.sh "$backup/rollback.sh"
changed=1
install -o mooncci -g mooncci -m 644 "server/$service" "$live/$service"
cmp "server/$service" "$live/$service"
pm restart mooncci-api --update-env
pm restart mooncci-worker --update-env
curl --retry 10 --retry-connrefused --retry-delay 2 -fsS --max-time 10 http://127.0.0.1:3001/api/health > "$backup/health.json"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"
test "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/article-seo/settings)" = 401
pm save
printf 'PASS: AI summary validation service deployed. No frontend, environment, dependency, Nginx or database changes.\n'
