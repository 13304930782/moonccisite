#!/usr/bin/env bash
# Run in a child shell; restores app files only, never drops new user data.
set -Eeuo pipefail
backup=$(cd -- "$1" && pwd)
live=$(cat "$backup/LIVE_ROOT")
web=$(cat "$backup/WEB_ROOT")
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; ENGAGEMENT_ENABLED=false pm2 $*"; }
python3 "$backup/engagement-env.py" "$live/.env" false
pm stop mooncci-worker
tar -xpf "$backup/backend-before.tar" -C "$live"
cp -p "$backup/index.html" "$web/.index-engagement-rollback"
mv -f "$web/.index-engagement-rollback" "$web/index.html"
pm restart mooncci-api mooncci-worker --update-env
pm save
healthy=0
for attempt in $(seq 1 30); do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health; then healthy=1; break; fi
 sleep 2
done
test "$healthy" = 1
printf '\nApplication restored; engagement disabled; new database tables/data retained.\n'
