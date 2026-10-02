#!/usr/bin/env bash
# Execute with nohup bash. Do not source into an interactive session.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=${MOONCCI_SERVER_ROOT:-/www/wwwroot/mooncci-source/server}
web=${MOONCCI_WEB_ROOT:-/www/wwwroot/mooncci.site}
backup_root=${MOONCCI_BACKUP_ROOT:-/www/backup}
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p "$backup_root"
exec 9>"$backup_root/mooncci-deploy.lock"
flock -w 120 9
backup=$(mktemp -d "$backup_root/mooncci-publishing.XXXXXX")
chmod 700 "$backup"
changed=0
feature=false
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; PUBLISHING_ENABLED=$feature pm2 $*"; }
check_api() {
 for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" &&
   node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then return 0; fi
  sleep 2
 done
 return 1
}
finish() {
 rc=$?
 trap - EXIT
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
  printf 'Deployment failed; rolling back application only.\n'
  bash "$backup/rollback.sh" "$backup" || printf 'ROLLBACK NEEDS ATTENTION: %s\n' "$backup"
 fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/package-checksums.log"
test -s "$live/.env"
test -s "$web/index.html"
test -s "$live/src/lib/articleRevisions.js"
test -s "$live/src/worker.js"
test -d "$live/node_modules"
command -v rsync >/dev/null
command -v python3 >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
# Preserve existing deployment-specific code: accept only reviewed baseline or this exact new file.
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const live=process.argv[2],baseline=JSON.parse(fs.readFileSync('BASELINE.json','utf8'));
const hash=b=>crypto.createHash('sha256').update(b.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
for(const [name,previous] of Object.entries(baseline)){
 const file=path.join(live,name),next=hash(fs.readFileSync(path.join('server',name)));
 if(fs.existsSync(file)){const current=hash(fs.readFileSync(file));if(current!==previous&&current!==next)throw Error('Live source differs; review required: '+name);}
 else if(previous!==null)throw Error('Required live file missing: '+name);
}
NODE
pm describe mooncci-api > "$backup/api-before.txt"
pm describe mooncci-worker > "$backup/worker-before.txt"
printf '%s\n' "$live" > "$backup/LIVE_ROOT"
printf '%s\n' "$web" > "$backup/WEB_ROOT"
cp -p "$web/index.html" "$backup/index.html"
cp -p "$live/.env" "$backup/environment-before"
cp publishing-env.py "$backup/publishing-env.py"
cp rollback.sh "$backup/rollback.sh"
: > "$backup/existing-files"
mapfile -t files < BACKEND_FILES
for file in "${files[@]}"; do
 [[ "$file" =~ ^(src/(index.js|jobs/contentScheduler.js|lib/articlePublishing.js|services/articleWorkflow.js|routes/(articleDrafts|posts|upload|publishing|series).js)|database/migrations/202609210001_publishing.sql)$ ]]
 test -s "server/$file"
 if [[ "$file" == *.js ]]; then node --check "server/$file"; fi
 if [ -e "$live/$file" ]; then printf '%s\n' "$file" >> "$backup/existing-files"; fi
done
tar -cpf "$backup/backend-before.tar" -C "$live" -T "$backup/existing-files"
# Additive, idempotent migration. Historical migration files/checksums stay untouched.
node server/scripts/migrate-publishing.js "$live"
changed=1
python3 publishing-env.py "$live/.env" false
pm stop mooncci-worker
for file in "${files[@]}"; do
 install -d -o mooncci -g mooncci -m 755 "$(dirname "$live/$file")"
 install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"
done
pm restart mooncci-api mooncci-worker --update-env
check_api
curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/publishing/config > "$backup/config-disabled.json"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).enabled!==false)process.exit(1)' "$backup/config-disabled.json"
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-publishing-new"
mv -f "$web/.index-publishing-new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
if [ "${1:-}" = "--enable" ]; then
 python3 publishing-env.py "$live/.env" true
 feature=true
 pm restart mooncci-api mooncci-worker --update-env
 check_api
 curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/publishing/config > "$backup/config-enabled.json"
 node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).enabled!==true)process.exit(1)' "$backup/config-enabled.json"
 curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/series > "$backup/series.json"
fi
pm jlist > "$backup/processes.json"
node - "$backup/processes.json" <<'NODE'
const items=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));
for(const name of ['mooncci-api','mooncci-worker'])if(!items.some(x=>x.name===name&&x.pm2_env.status==='online'))throw Error(name+' not online');
NODE
pm save
printf 'PASS: scoped deployment; publishing=%s. Real submission, review, scheduled publication and login acceptance still required.\n' "$feature"
