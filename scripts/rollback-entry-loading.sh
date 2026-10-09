#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -- "${1:?Pass backup directory}")
case "$backup" in /www/backup/mooncci-entry-loading.*) ;; *) exit 2;; esac
live=/www/wwwroot/mooncci-source/server
test -s "$backup/publicDocument.js"
test -s "$backup/index.html"
test -d "$backup/runtime"
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cp -p "$backup/publicDocument.js" "$live/src/lib/publicDocument.js"
cp -p "$backup/index.html" /www/wwwroot/mooncci.site/index.html
cp -p "$backup/seo.js" "$live/src/routes/seo.js"
mv "$live/runtime" "$backup/runtime-after-release"
mv "$backup/runtime" "$live/runtime"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
