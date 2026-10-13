#!/usr/bin/env bash
# Run with nohup bash as a child shell; never source this script.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=${MOONCCI_API_ROOT:-/www/wwwroot/mooncci-source/server}
web=${MOONCCI_WEB_ROOT:-/www/wwwroot/mooncci.site}
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-seo-recommendations.XXXXXX)
changed=0
runtime_changed=0
frontend_changed=0
restart(){ su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api'; }
finish(){
 rc=$?;trap - EXIT;set +e
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ];then
  for file in src/lib/seo.js src/routes/seo.js;do cp -p "$backup/$file" "$live/$file";done
  if [ "$frontend_changed" = 1 ];then cp -p "$backup/index.html" "$web/index.html";fi
  if [ "$runtime_changed" = 1 ];then
   if [ -d "$live/runtime" ];then mv "$live/runtime" "$backup/runtime-failed";fi
   mv "$backup/runtime" "$live/runtime"
  fi
  restart
 fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/checksums.log"
test -s "$live/.env"
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const live=process.argv[2],baseline=JSON.parse(fs.readFileSync('BASELINE.json','utf8'));
for(const file of ['src/lib/seo.js','src/routes/seo.js']){
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const current=hash(path.join(live,file));
 if(![].concat(baseline[file]).includes(current)&&current!==hash(path.join('server',file)))throw Error('Production source drift: '+file);
}
NODE
for file in src/lib/seo.js src/routes/seo.js;do
 node --check "server/$file"
 mkdir -p "$backup/$(dirname "$file")"
 cp -p "$live/$file" "$backup/$file"
done
if [ -d dist ];then
 command -v rsync >/dev/null
 test -s "$web/index.html"
 test -s "$live/runtime/document.mjs"
 cp -p "$web/index.html" "$backup/index.html"
 staged=$(mktemp -d "$live/runtime-seo.XXXXXX")
 rsync -a "$live/runtime/" "$staged/"
 rsync -ac --delete --exclude=node_modules server/runtime/ "$staged/"
 chown -R mooncci:mooncci "$staged"
 node --input-type=module -e 'import {pathToFileURL} from "node:url"; await import(pathToFileURL(process.argv[1]+"/document.mjs").href)' "$staged"
 # Publish new immutable assets before the runtime starts referencing them.
 rsync -ac --exclude=index.html dist/ "$web/"
fi
changed=1
for file in src/lib/seo.js src/routes/seo.js;do
 cp -p "$live/$file" "$live/$file.seo-new"
 cat "server/$file" > "$live/$file.seo-new"
 mv -f "$live/$file.seo-new" "$live/$file"
done
if [ -d dist ];then
 mv "$live/runtime" "$backup/runtime"
 runtime_changed=1
 mv "$staged" "$live/runtime"
 install -m 644 dist/index.html "$web/.index-seo-new"
 frontend_changed=1
 mv -f "$web/.index-seo-new" "$web/index.html"
 sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
 (cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
fi
restart
ready=0
for attempt in $(seq 1 20);do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" &&
 node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json";then ready=1;break;fi
 sleep 2
done
test "$ready" = 1
curl -fsS --max-time 10 'http://127.0.0.1:3001/api/seo?path=/articles' > "$backup/articles-meta.json"
curl -fsS --max-time 10 'http://127.0.0.1:3001/robots.txt' > "$backup/robots.txt"
node - "$backup" <<'NODE'
const fs=require('fs'),path=require('path'),root=process.argv[2];
const meta=JSON.parse(fs.readFileSync(path.join(root,'articles-meta.json'),'utf8'));
if(!meta.title.includes('技术实践与经验记录')||meta.description.length<60||meta.canonical!=='https://mooncci.site/articles')throw Error('SEO metadata validation failed');
const robots=fs.readFileSync(path.join(root,'robots.txt'),'utf8');
for(const rule of ['Disallow: /api/','Disallow: /api/uploads/releases/','Allow: /api/uploads/*.png$','Allow: /api/image-variants/'])if(!robots.includes(rule+'\n'))throw Error('Robots validation failed');
NODE
printf 'PASS: SEO updated; frontend_updated=%s; API restarted. No Nginx, environment, dependency or database changes.\n' "$frontend_changed"
