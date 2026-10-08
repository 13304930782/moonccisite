#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -- "${1:?Pass backup directory}")
case "$backup" in /www/backup/mooncci-weather-city.*) ;; *) exit 2;; esac
live=/www/wwwroot/mooncci-source/server
test -s "$backup/index.html"
test -s "$backup/weatherGeocoder.js"
test -s "$backup/weatherReverseGeocode.js"
test -s "$backup/weatherLocation.js"
test -d "$backup/runtime"
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cp -p "$backup/index.html" /www/wwwroot/mooncci.site/index.html
cp -p "$backup/weatherGeocoder.js" "$live/src/lib/weatherGeocoder.js"
cp -p "$backup/weatherReverseGeocode.js" "$live/src/lib/weatherReverseGeocode.js"
cp -p "$backup/weatherLocation.js" "$live/src/lib/weatherLocation.js"
rm -f -- "$live/src/lib/weatherPhoton.js"
mv "$live/runtime" "$backup/runtime-after-release"
mv "$backup/runtime" "$live/runtime"
su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
