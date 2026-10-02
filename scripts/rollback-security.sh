#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(cd -- "$1" && pwd)
live=$(cat "$backup/LIVE_ROOT")
web=$(cat "$backup/WEB_ROOT")
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
if [ -f "$backup/dependencies-before.tar" ]; then
 su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 stop mooncci-api; pm2 stop mooncci-worker'
 failed=$(mktemp -d "$backup/rollback-dependencies.XXXXXX")
 for module in nodemailer multer ip-address buffer-from concat-stream readable-stream string_decoder typedarray util-deprecate; do
  if [ -d "$live/node_modules/$module" ]; then mv "$live/node_modules/$module" "$failed/$module"; fi
 done
 if [ -f "$live/node_modules/.package-lock.json" ]; then mv "$live/node_modules/.package-lock.json" "$failed/hidden-lock"; fi
 tar -xpf "$backup/dependencies-before.tar" -C "$live"
fi
if [ -f "$backup/nginx-before.inc" ]; then
 cp -p "$backup/nginx-before.inc" "$(cat "$backup/NGINX_SNIPPET")"
 /www/server/nginx/sbin/nginx -t
 /www/server/nginx/sbin/nginx -s reload
fi
tar -xpf "$backup/backend-before.tar" -C "$live"
cp -p "$backup/index.html" "$web/.index-security-rollback"
mv -f "$web/.index-security-rollback" "$web/index.html"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env; pm2 restart mooncci-worker --update-env; pm2 save'
healthy=0
for attempt in $(seq 1 30); do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health; then healthy=1; break; fi
 sleep 2
done
test "$healthy" = 1
printf '\nPrevious application restored. User data, environment and uploads preserved.\n'
