#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -- "${1:?Pass backup directory}")
case "$backup" in /www/backup/mooncci-weather-city.*) ;; *) exit 2;; esac
live=/www/wwwroot/mooncci-source/server
test -s "$backup/index.html"
test -s "$backup/weatherGeocoder.js"
test -s "$backup/weatherBudget.js"
test -s "$backup/weatherMood.js"
test -s "$backup/weatherNetworkCity.js"
test -d "$backup/runtime"
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cp -p "$backup/index.html" /www/wwwroot/mooncci.site/index.html
cp -p "$backup/weatherGeocoder.js" "$live/src/lib/weatherGeocoder.js"
cp -p "$backup/weatherBudget.js" "$live/src/lib/weatherBudget.js"
cp -p "$backup/weatherMood.js" "$live/src/routes/weatherMood.js"
cp -p "$backup/weatherNetworkCity.js" "$live/src/lib/weatherNetworkCity.js"
rm -f -- "$live/src/lib/weatherOfflineIp.js"
mv "$live/runtime" "$backup/runtime-after-release"
mv "$backup/runtime" "$live/runtime"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
