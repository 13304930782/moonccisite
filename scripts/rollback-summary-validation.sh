#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(cd -- "$1" && pwd)
case "$backup" in /www/backup/mooncci-summary-validation.*) ;; *) printf 'Unexpected backup directory\n'; exit 1 ;; esac
live=/www/wwwroot/mooncci-source/server
test -s "$backup/articleSummary.js"
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
install -o mooncci -g mooncci -m 644 "$backup/articleSummary.js" "$live/src/services/articleSummary.js"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env; pm2 restart mooncci-worker --update-env; pm2 save'
curl --retry 10 --retry-connrefused --retry-delay 2 -fsS --max-time 10 http://127.0.0.1:3001/api/health
printf '\nPrevious AI summary service restored.\n'
