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
test "$(sha256sum "$live/src/lib/weatherGeocoder.js" | cut -d' ' -f1)" = 1881fbb262a4b29933bf777d4cf14be56700d795663334bf590d5d8e3291c4a4
test "$(sha256sum "$live/src/lib/weatherBudget.js" | cut -d' ' -f1)" = 20f46d87873ee3c850df104396d50466bb6c71326e1b0b2c418140b663b35030
test "$(sha256sum "$live/src/routes/weatherMood.js" | cut -d' ' -f1)" = 08ad6e1a0d30bcebfaca7cd4de60d2ca3e2acb028c8187e4c6356a436e06ba4f
test "$(sha256sum "$live/src/lib/weatherNetworkCity.js" | cut -d' ' -f1)" = a0e107194a19d839bfec9f467951f1edb218e466ea31398bbcc85a14b5e67518
test ! -e "$live/src/lib/weatherOfflineIp.js"
test ! -e "$live/vendor/ip2region"
test ! -e "$live/data/ip2region"
node --check server/src/lib/weatherGeocoder.js
node --check server/src/lib/weatherNetworkCity.js
node --check server/src/lib/weatherOfflineIp.js
node --check server/src/lib/weatherBudget.js
node --check server/src/routes/weatherMood.js
node --input-type=module -e "await import('./server/runtime/document.mjs')"
node -e 'require("./server/src/lib/weatherOfflineIp").lookupOfflineIp("114.247.50.2").then(value=>{if(value?.city!=="北京市")throw Error("Offline database verification failed")})'
backup=$(mktemp -d /www/backup/mooncci-weather-city.XXXXXX)
cp -p "$web/index.html" "$backup/index.html"
cp -p "$live/src/lib/weatherGeocoder.js" "$backup/weatherGeocoder.js"
cp -p "$live/src/lib/weatherBudget.js" "$backup/weatherBudget.js"
cp -p "$live/src/routes/weatherMood.js" "$backup/weatherMood.js"
cp -p "$live/src/lib/weatherNetworkCity.js" "$backup/weatherNetworkCity.js"
staged=$(mktemp -d "$live/runtime-weather-city.XXXXXX")
rsync -ac server/runtime/ "$staged/"
chown -R mooncci:mooncci "$staged"
changed=0
pm() { su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'; }
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    cp -p "$backup/index.html" "$web/index.html"
    cp -p "$backup/weatherGeocoder.js" "$live/src/lib/weatherGeocoder.js"
    cp -p "$backup/weatherBudget.js" "$live/src/lib/weatherBudget.js"
    cp -p "$backup/weatherMood.js" "$live/src/routes/weatherMood.js"
    cp -p "$backup/weatherNetworkCity.js" "$live/src/lib/weatherNetworkCity.js"
    rm -f -- "$live/src/lib/weatherOfflineIp.js"
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
install -o mooncci -g mooncci -m 644 server/src/lib/weatherGeocoder.js "$live/src/lib/weatherGeocoder.js"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherNetworkCity.js "$live/src/lib/weatherNetworkCity.js"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherOfflineIp.js "$live/src/lib/weatherOfflineIp.js"
mkdir -p "$live/vendor/ip2region" "$live/data/ip2region"
rsync -ac server/vendor/ip2region/ "$live/vendor/ip2region/"
rsync -ac server/data/ip2region/ "$live/data/ip2region/"
chown -R mooncci:mooncci "$live/vendor/ip2region" "$live/data/ip2region"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherBudget.js "$live/src/lib/weatherBudget.js"
install -o mooncci -g mooncci -m 644 server/src/routes/weatherMood.js "$live/src/routes/weatherMood.js"
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
printf 'PASS: scoped weather-city frontend, matching SSR runtime and geocoder release; no migrations or dependency installation.\n'
