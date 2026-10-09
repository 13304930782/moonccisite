#!/bin/bash
set -Eeuo pipefail
backup=$(realpath -- "${1:?Pass recorded backup directory}")
case "$backup" in /www/backup/mooncci-document.*) ;; *) exit 2;; esac
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
nginx=/www/server/nginx/sbin/nginx
for required in src/routes/seo.js src/lib/seo.js index.html vhost.conf nginx-before.inc; do test -s "$backup/$required"; done
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
for name in src/routes/seo.js src/lib/seo.js; do cp -p "$backup/$name" "$live/$name"; done
if [ -f "$backup/src/lib/publicDocument.js" ]; then cp -p "$backup/src/lib/publicDocument.js" "$live/src/lib/publicDocument.js"; fi
if [ -d "$backup/runtime" ]; then
  mv "$live/runtime" "$backup/runtime-after-release"
  mv "$backup/runtime" "$live/runtime"
fi
cp -p "$backup/index.html" "$web/index.html"
cp -p "$backup/vhost.conf" /www/server/panel/vhost/nginx/mooncci.site.conf
cp -p "$backup/nginx-before.inc" /www/server/panel/vhost/nginx/mooncci-blog-seo.inc
"$nginx" -t
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
"$nginx" -s reload
curl -fsS --max-time 10 http://127.0.0.1:3001/api/health
