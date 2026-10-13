#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(cd -- "$1" && pwd)
live=$(cat "$backup/LIVE_ROOT")
web=$(cat "$backup/WEB_ROOT")
test "$live" = /www/wwwroot/mooncci-source/server
test "$web" = /www/wwwroot/mooncci.site
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
tar -xpf "$backup/backend-before.tar" -C "$live"
while IFS= read -r file; do
 case "$file" in src/lib/articleSummaryProof.js|src/routes/articleSeo.js|src/services/articleSummary.js) rm -f -- "$live/$file" ;; *) printf 'Unexpected new file: %s\n' "$file"; exit 1 ;; esac
done < "$backup/new-files"
if [ -d "$backup/runtime-old" ]; then
 if [ -d "$live/runtime" ]; then mv "$live/runtime" "$backup/runtime-failed-$(date +%s)"; fi
 mv "$backup/runtime-old" "$live/runtime"
fi
cp -p "$backup/index.html" "$web/.index-summary-rollback"
mv -f "$web/.index-summary-rollback" "$web/index.html"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env; pm2 restart mooncci-worker --update-env; pm2 save'
curl --retry 10 --retry-connrefused --retry-delay 2 -fsS --max-time 10 http://127.0.0.1:3001/api/health
printf '\nPrevious application restored; database, credentials and uploads retained.\n'
