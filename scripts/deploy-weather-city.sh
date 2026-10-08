#!/usr/bin/env bash
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
test "$(sha256sum "$live/src/lib/weatherNetworkCity.js" | cut -d' ' -f1)" = 06e435927ddfac432c2329c90a26ffca31144185e70b65a3c719cc5d572ec716
test "$(sha256sum "$live/src/lib/weatherLocation.js" | cut -d' ' -f1)" = 164959635c6ddb4e22b9705478d9c1ebbec955affa7a508a85193a71b93e8128
test "$(sha256sum "$live/src/lib/weatherSource.js" | cut -d' ' -f1)" = "$(sha256sum server/src/lib/weatherSource.js | cut -d' ' -f1)"
test ! -e "$live/src/lib/weatherGlobalIp.js"
test ! -e "$live/vendor/mmdb-lib"
test ! -e "$live/data/dbip"
node --check server/src/lib/weatherNetworkCity.js
node --check server/src/lib/weatherGlobalIp.js
node --check server/src/lib/weatherLocation.js
node -e 'const {lookupGlobalIp,globalIpCity}=require("./server/src/lib/weatherGlobalIp"); if(globalIpCity(lookupGlobalIp("104.245.13.12"))?.name!=="San Jose")throw Error("IP city validation failed"); if(globalIpCity(lookupGlobalIp("39.144.58.249"))!==null)throw Error("Domestic IP city must not be used")'
node --input-type=module -e "await import('./server/runtime/document.mjs')"
backup=$(mktemp -d /www/backup/mooncci-weather-city.XXXXXX)
cp -p "$web/index.html" "$backup/index.html"
cp -p "$live/src/lib/weatherNetworkCity.js" "$backup/weatherNetworkCity.js"
cp -p "$live/src/lib/weatherLocation.js" "$backup/weatherLocation.js"
staged=$(mktemp -d "$live/runtime-weather-city.XXXXXX")
rsync -ac server/runtime/ "$staged/"
chown -R mooncci:mooncci "$staged"
changed=0
pm() { su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'; }
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    cp -p "$backup/index.html" "$web/index.html"
    cp -p "$backup/weatherNetworkCity.js" "$live/src/lib/weatherNetworkCity.js"
    cp -p "$backup/weatherLocation.js" "$live/src/lib/weatherLocation.js"
    rm -f -- "$live/src/lib/weatherGlobalIp.js"
    if [ -d "$backup/runtime" ]; then mv "$live/runtime" "$backup/runtime-failed"; mv "$backup/runtime" "$live/runtime"; fi
    pm
  fi
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
changed=1
mv "$live/runtime" "$backup/runtime"
mv "$staged" "$live/runtime"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherNetworkCity.js "$live/src/lib/weatherNetworkCity.js"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherLocation.js "$live/src/lib/weatherLocation.js"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherGlobalIp.js "$live/src/lib/weatherGlobalIp.js"
mkdir -p "$live/vendor/mmdb-lib" "$live/data/dbip"
rsync -ac server/vendor/mmdb-lib/ "$live/vendor/mmdb-lib/"
rsync -ac server/data/dbip/ "$live/data/dbip/"
chown -R mooncci:mooncci "$live/vendor/mmdb-lib" "$live/data/dbip"
pm
healthy=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/auth/session > "$backup/session.json"; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).user!==null)process.exit(1)' "$backup/session.json"
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-weather-city.new"
mv "$web/.index-weather-city.new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
curl -fsS --resolve mooncci.site:443:127.0.0.1 https://mooncci.site/ > "$backup/home.html"
grep -q 'id="mooncci-home-css"' "$backup/home.html"
test "$(curl -sS -o /dev/null -w '%{http_code}' https://mooncci.site/api/auth/me)" = 401
printf 'PASS: foreign offline IP fallback, domestic location permission prompt, frontend and SSR; no migrations or dependency installation.\n'
