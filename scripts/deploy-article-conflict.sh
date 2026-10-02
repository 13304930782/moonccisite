#!/usr/bin/env bash
# Run in a nohup child shell; never source this file.
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
backup=$(mktemp -d "$backup_root/mooncci-article-conflict.XXXXXX")
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
health() {
 for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health 2>/dev/null > "$backup/health.json" && node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then return 0; fi
  sleep 2
 done
 return 1
}
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
test -s "$live/.env"
test -s "$web/index.html"
test -d "$live/node_modules"
command -v rsync >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
# Fail before writes if the installed code is not a reviewed article-conflict baseline.
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
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),live=process.argv[2];
for(const [name,expected] of Object.entries(JSON.parse(fs.readFileSync('PREREQUISITES.json','utf8')))){
 const current=crypto.createHash('sha256').update(fs.readFileSync(path.join(live,name),'utf8').replace(/\r\n/g,'\n')).digest('hex');
 if(current!==expected)throw Error('Publishing prerequisite differs: '+name);
}
NODE
pm describe mooncci-api > "$backup/api-before.txt"
printf '%s\n' "$live" > "$backup/LIVE_ROOT"
printf '%s\n' "$web" > "$backup/WEB_ROOT"
cp -p "$web/index.html" "$backup/index.html"
cp rollback.sh "$backup/rollback.sh"
: > "$backup/existing-files"
mapfile -t files < BACKEND_FILES
for file in "${files[@]}"; do
 [[ "$file" =~ ^src/(lib/articleConflict.js|routes/articleDrafts.js)$ ]]
 test -s "server/$file"
 if [[ "$file" == *.js ]]; then node --check "server/$file"; fi
 if [ -e "$live/$file" ]; then printf '%s\n' "$file" >> "$backup/existing-files"; fi
done
tar -cpf "$backup/backend-before.tar" -C "$live" -T "$backup/existing-files"
changed=1
for file in "${files[@]}"; do
 install -d -o mooncci -g mooncci -m 755 "$(dirname "$live/$file")"
 install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"
done
pm restart mooncci-api --update-env
health
curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/auth/providers > "$backup/providers.json"
node -e 'if(!Array.isArray(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).providers))process.exit(1)' "$backup/providers.json"
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-article-conflict-new"
mv -f "$web/.index-article-conflict-new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
pm save
printf 'PASS: article-conflict resolution deployed; API only restarted. No schema, environment or worker changes.\n'
