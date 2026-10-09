#!/usr/bin/env bash
# Run only in a nohup child shell from a verified offline package.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
vhost=/www/server/panel/vhost/nginx/mooncci.site.conf
snippet=/www/server/panel/vhost/nginx/mooncci-blog-seo.inc
nginx=/www/server/nginx/sbin/nginx
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-document.XXXXXX)
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
health() {
  for attempt in $(seq 1 20); do
    if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" &&
       node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then return 0; fi
    sleep 2
  done
  return 1
}
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    for name in src/lib/publicDocument.js src/routes/seo.js src/lib/seo.js; do
      if [ -f "$backup/$name" ]; then cp -p "$backup/$name" "$live/$name"; else rm -f "$live/$name"; fi
    done
    if [ -d "$backup/runtime" ]; then mv "$live/runtime" "$backup/runtime-failed"; mv "$backup/runtime" "$live/runtime"; fi
    cp -p "$backup/vhost.conf" "$vhost"
    cp -p "$backup/nginx-before.inc" "$snippet"
    cp -p "$backup/index.html" "$web/index.html"
    "$nginx" -t && "$nginx" -s reload
    pm restart mooncci-api --update-env
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/checksums.log"
test -s "$live/.env"
test -s "$web/index.html"
test -x "$nginx"
test -d "$live/node_modules"
command -v rsync >/dev/null
for name in src/lib/publicDocument.js src/routes/seo.js src/lib/seo.js; do
  node --check "server/$name"
  mkdir -p "$backup/$(dirname "$name")"
  if [ -f "$live/$name" ]; then cp -p "$live/$name" "$backup/$name"; fi
done
cp -p "$vhost" "$backup/vhost.conf"
cp -p "$snippet" "$backup/nginx-before.inc"
cp -p "$web/index.html" "$backup/index.html"
node - "$live" "$snippet" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [live,snippet]=process.argv.slice(2);
const expected={
 'src/routes/seo.js':'86eff215311b4962c83451c45ce33125565f67c87393444890b4e552b8784b30',
 'src/lib/seo.js':'a494c06a74a8000c0ac77d680112e32df6cce5d585d779b7bbfcb7c7e7eab122',
};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [name,old] of Object.entries(expected)){
 const current=hash(path.join(live,name)),next=hash(path.join('server',name));
 if(current!==old&&current!==next)throw Error('Production source drift: '+name);
}
const current=hash(snippet),next=hash('nginx-blog-seo.conf');
if(current!=='0c0b6ad4e7ca4bce522164c9331387e9e4a84bf1cae8f4ccadbec87c67280f1a'&&current!==next)throw Error('SEO Nginx snippet drift');
NODE
"$nginx" -t
# Stage the isolated Node renderer before changing any live source.
node --input-type=module -e "await import('./server/runtime/document.mjs')"
rsync -ac server/runtime/ "$live/runtime-next/"
chown -R mooncci:mooncci "$live/runtime-next"
changed=1
if [ -d "$live/runtime" ]; then mv "$live/runtime" "$backup/runtime"; fi
mv "$live/runtime-next" "$live/runtime"
for name in src/lib/publicDocument.js src/routes/seo.js src/lib/seo.js; do
  install -o mooncci -g mooncci -m 644 "server/$name" "$live/$name.new"
  mv -f "$live/$name.new" "$live/$name"
done
install -m 644 nginx-blog-seo.conf "$snippet.new"
mv -f "$snippet.new" "$snippet"
node - "$vhost" <<'NODE'
const fs=require('fs'),p=process.argv[2],before=fs.readFileSync(p,'utf8');
const old='try_files $uri $uri/ /index.html;',next='try_files $uri $uri/ @mooncci_document;';
if(!before.includes(old)&&!before.includes(next))throw Error('Unknown document fallback');
fs.writeFileSync(p,before.replace(old,next));
NODE
"$nginx" -t
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-security-seo.new"
mv -f "$web/.index-security-seo.new" "$web/index.html"
pm restart mooncci-api --update-env
health
"$nginx" -s reload
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
curl -fsS --resolve mooncci.site:443:127.0.0.1 --max-time 10 https://mooncci.site/projects/promptdock > "$backup/project.html"
node - "$backup/project.html" <<'NODE'
const fs=require('fs');const html=fs.readFileSync(process.argv[2],'utf8');
if(!html.includes('<title>PromptDock')||!html.includes('rel="canonical" href="https://mooncci.site/projects/promptdock"')||!html.includes('mooncci-document-data'))process.exit(1);
NODE
printf 'PASS: scoped API, SEO Nginx and frontend update applied; API restarted. Isolated renderer dependencies bundled; no worker, schema or environment changes.\n'
