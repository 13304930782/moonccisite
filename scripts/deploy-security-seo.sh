#!/usr/bin/env bash
# Run only in a nohup child shell from a verified offline package.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
snippet=/www/server/panel/vhost/nginx/mooncci-blog-seo.inc
nginx=/www/server/nginx/sbin/nginx
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-security-seo.XXXXXX)
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
    for name in src/routes/upload.js src/routes/seo.js src/lib/seo.js; do
      cp -p "$backup/$name" "$live/$name"
    done
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
for name in src/routes/upload.js src/routes/seo.js src/lib/seo.js; do
  node --check "server/$name"
  test -s "$live/$name"
  mkdir -p "$backup/$(dirname "$name")"
  cp -p "$live/$name" "$backup/$name"
done
cp -p "$snippet" "$backup/nginx-before.inc"
cp -p "$web/index.html" "$backup/index.html"
node - "$live" "$snippet" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const [live,snippet]=process.argv.slice(2);
const expected={
 'src/routes/upload.js':'3c547602730300409af7eb1ade68f7214032c103de6cc96bb64e51b536c1d62f',
 'src/routes/seo.js':'13990a3d32c54d6ccb553f9bf6245640fc4a53f178cade8a69b71f4660a2a5cd',
 'src/lib/seo.js':'cedc83388fada933afa7df943c146f5cf622942e49890bb77e6d040e302ab63a',
};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [name,old] of Object.entries(expected)){
 const current=hash(path.join(live,name)),next=hash(path.join('server',name));
 if(current!==old&&current!==next)throw Error('Production source drift: '+name);
}
const current=hash(snippet),next=hash('nginx-blog-seo.conf');
if(current!=='88799733cf65fffeb1290916bee30efdbd6775c9a9512fd4eec906666e83175f'&&current!==next)throw Error('SEO Nginx snippet drift');
NODE
"$nginx" -t
changed=1
for name in src/routes/upload.js src/routes/seo.js src/lib/seo.js; do
  install -o mooncci -g mooncci -m 644 "server/$name" "$live/$name.new"
  mv -f "$live/$name.new" "$live/$name"
done
pm restart mooncci-api --update-env
health
install -m 644 nginx-blog-seo.conf "$snippet.new"
mv -f "$snippet.new" "$snippet"
"$nginx" -t
"$nginx" -s reload
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-security-seo.new"
mv -f "$web/.index-security-seo.new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
curl -fsS --resolve mooncci.site:443:127.0.0.1 --max-time 10 https://mooncci.site/projects/promptdock > "$backup/project.html"
node - "$backup/project.html" <<'NODE'
const fs=require('fs');const html=fs.readFileSync(process.argv[2],'utf8');
if(!html.includes('<title>PromptDock')||!html.includes('rel="canonical" href="https://mooncci.site/projects/promptdock"'))process.exit(1);
NODE
printf 'PASS: scoped API, SEO Nginx and frontend update applied; API restarted. No worker, schema, environment or dependency installation changes.\n'
