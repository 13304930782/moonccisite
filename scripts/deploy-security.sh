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
backup=$(mktemp -d "$backup_root/mooncci-security.XXXXXX")
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
health() {
 for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" && node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then return 0; fi
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
# Fail before writes if the installed code is not a reviewed security baseline.
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const live=process.argv[2],baseline=JSON.parse(fs.readFileSync('BASELINE.json','utf8'));
const hash=b=>crypto.createHash('sha256').update(b.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
for(const [name,previous] of Object.entries(baseline)){
 const file=path.join(live,name),next=hash(fs.readFileSync(path.join('server',name)));
 if(fs.existsSync(file)){const current=hash(fs.readFileSync(file));if(!(Array.isArray(previous)?previous:[previous]).includes(current)&&current!==next)throw Error('Live source differs; review required: '+name);}
 else if(previous!==null)throw Error('Required live file missing: '+name);
}
NODE
nginx=/www/server/nginx/sbin/nginx
snippet=/www/server/panel/vhost/nginx/mooncci-blog-seo.inc
test -x "$nginx"
# Review the exact installed snippet before changing proxy headers.
test -f "$snippet" || { echo 'Missing SEO snippet; review active Nginx SEO routing before deploying.'; exit 1; }
node - "$snippet" <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
const current=hash(process.argv[2]);
if(current!==fs.readFileSync('NGINX_BASELINE','utf8').trim()&&current!==hash('nginx-blog-seo.conf'))throw Error('SEO snippet differs; review required before replacing it');
NODE
"$nginx" -t
cp -p "$snippet" "$backup/nginx-before.inc"
printf '%s\n' "$snippet" > "$backup/NGINX_SNIPPET"
# Only the reviewed pure-JavaScript dependency delta is installed offline.
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const live=process.argv[2],hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
const baseline=JSON.parse(fs.readFileSync('DEPENDENCY_BASELINE.json','utf8'));
for(const [name,old] of Object.entries(baseline))if(![old,hash(path.join('server',name))].includes(hash(path.join(live,name))))throw Error('Dependency manifest differs: '+name);
for(const [name,versions] of Object.entries({'nodemailer':['9.1.1','10.0.12'],'multer':['2.3.0','2.4.0'],'ip-address':['10.5.0','10.7.2']})){
 const file=path.join(live,'node_modules',name,'package.json');
 if(!versions.includes(JSON.parse(fs.readFileSync(file,'utf8')).version))throw Error('Unexpected installed dependency: '+name);
}
NODE
pm describe mooncci-worker > "$backup/worker-before.txt"
pm describe mooncci-api > "$backup/api-before.txt"
printf '%s\n' "$live" > "$backup/LIVE_ROOT"
printf '%s\n' "$web" > "$backup/WEB_ROOT"
cp -p "$web/index.html" "$backup/index.html"
cp rollback.sh "$backup/rollback.sh"
: > "$backup/existing-files"
mapfile -t files < BACKEND_FILES
for file in "${files[@]}"; do
 [[ "$file" =~ ^src/(lib/(articleDiscovery|articleImportConvert).js|routes/seo.js)$ ]]
 test -s "server/$file"
 if [[ "$file" == *.js ]]; then node --check "server/$file"; fi
 if [ -e "$live/$file" ]; then printf '%s\n' "$file" >> "$backup/existing-files"; fi
done
tar -cpf "$backup/backend-before.tar" -C "$live" -T "$backup/existing-files"
printf '%s\n' package.json package-lock.json > "$backup/dependency-files"
for module in nodemailer multer ip-address buffer-from concat-stream readable-stream string_decoder typedarray util-deprecate; do
 if [ -d "$live/node_modules/$module" ]; then printf 'node_modules/%s\n' "$module" >> "$backup/dependency-files"; fi
done
if [ -f "$live/node_modules/.package-lock.json" ]; then printf '%s\n' node_modules/.package-lock.json >> "$backup/dependency-files"; fi
tar -cpf "$backup/dependencies-before.tar" -C "$live" -T "$backup/dependency-files"
changed=1
pm stop mooncci-api
pm stop mooncci-worker
for module in nodemailer multer ip-address buffer-from concat-stream readable-stream string_decoder typedarray util-deprecate; do
 if [ -d "$live/node_modules/$module" ]; then mv "$live/node_modules/$module" "$backup/displaced-$module"; fi
done
if [ -f "$live/node_modules/.package-lock.json" ]; then mv "$live/node_modules/.package-lock.json" "$backup/displaced-hidden-lock"; fi
for module in nodemailer multer ip-address; do
 cp -a "server/node_modules/$module" "$live/node_modules/$module"
 chown -R mooncci:mooncci "$live/node_modules/$module"
done
install -o mooncci -g mooncci -m 644 server/package.json "$live/package.json"
install -o mooncci -g mooncci -m 644 server/package-lock.json "$live/package-lock.json"
node - "$live" <<'NODE'
const {createRequire}=require('module');const r=createRequire(process.argv[2]+'/package.json');
if(typeof r('nodemailer').createTransport!=='function'||typeof r('multer')!=='function'||!new (r('ip-address').Address6)('fe90::1').isLinkLocal())throw Error('Offline dependency smoke check failed');
NODE
install -m 644 nginx-blog-seo.conf "$snippet"
"$nginx" -t
"$nginx" -s reload
for file in "${files[@]}"; do
 install -d -o mooncci -g mooncci -m 755 "$(dirname "$live/$file")"
 install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"
done
pm restart mooncci-api --update-env
pm restart mooncci-worker --update-env
health
curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/auth/providers > "$backup/providers.json"
node -e 'if(!Array.isArray(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).providers))process.exit(1)' "$backup/providers.json"
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-security-new"
mv -f "$web/.index-security-new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
pm save
printf 'PASS: security fixes deployed; API and worker restarted; Nginx reloaded. No schema or environment changes.\n'
