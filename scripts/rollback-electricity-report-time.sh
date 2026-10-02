#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(cd -- "$1" && pwd)
live=$(cat "$backup/LIVE_ROOT")
cp -p "$backup/electricityReport.js" "$live/src/lib/electricityReport.js"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api mooncci-worker --update-env && pm2 save'
printf 'Previous report code restored.\n'
