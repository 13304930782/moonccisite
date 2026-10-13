#!/usr/bin/env bash
# Run in a nohup child shell with the backup path emitted by deploy.sh.
set -Eeuo pipefail
backup=$(realpath -- "${1:?Pass the release backup directory}")
case "$backup" in /www/backup/mooncci-article-ui-main.*|/www/backup/mooncci-article-ui-reader.*) ;; *) exit 2 ;; esac
mode=$(cat "$backup/TARGET")
web=$(cat "$backup/WEB_ROOT")
case "$mode:$web" in main:/www/wwwroot/mooncci.site|reader:/opt/mooncci-reader/releases/*/dist) ;; *) exit 2 ;; esac
test -s "$backup/index.html"
test -f "$backup/frontend-before.tar"
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then
 exec 9>/www/backup/mooncci-deploy.lock
 flock -w 120 9
fi
tar -xpf "$backup/frontend-before.tar" -C "$web"
if [ "$mode" = main ]; then
 test -s "$backup/api-index.js"
 cp -p "$backup/api-index.js" /www/wwwroot/mooncci-source/server/src/index.js
fi
if [ "$mode" = main ] && [ -d "$backup/runtime-old" ]; then
 live=/www/wwwroot/mooncci-source/server
 if [ -d "$live/runtime" ]; then mv "$live/runtime" "$backup/runtime-failed-$(date +%s)"; fi
 mv "$backup/runtime-old" "$live/runtime"
fi
install -m 644 "$backup/index.html" "$web/.index-article-ui-rollback"
mv -f "$web/.index-article-ui-rollback" "$web/index.html"
if [ "$mode" = main ]; then
 su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
 curl --retry 10 --retry-connrefused --retry-delay 2 -fsS --max-time 3 http://127.0.0.1:3001/api/health
fi
printf 'Rollback completed: %s\n' "$backup"
