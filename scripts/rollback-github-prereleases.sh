#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(cd -- "$1" && pwd)
live=$(cat "$backup/LIVE_ROOT")
web=$(cat "$backup/WEB_ROOT")
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
tar -xpf "$backup/backend-before.tar" -C "$live"
cp -p "$backup/index.html" "$web/.index-github-prereleases-rollback"
mv -f "$web/.index-github-prereleases-rollback" "$web/index.html"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api mooncci-worker --update-env && pm2 save'
healthy=0
for attempt in $(seq 1 30); do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health; then healthy=1; break; fi
 sleep 2
done
test "$healthy" = 1
printf '\nPrevious application restored. Additive columns, user data, environment and uploads preserved.\n'
