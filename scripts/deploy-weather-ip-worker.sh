#!/usr/bin/env bash
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
test "$(sha256sum "$live/src/lib/weatherGlobalIp.js" | cut -d' ' -f1)" = e4b7dbab865c78015f88f9457836631fd631030049b42623360fc5ab4e52539c
test "$(sha256sum "$live/data/dbip/dbip-city-lite-2026-10.mmdb" | cut -d' ' -f1)" = 9e250f02722d1ad1780f88192f0e908af285478a33e76b88b349c9181ae9d0f5
test ! -e "$live/src/lib/weatherGlobalIpWorker.js"
node --check server/src/lib/weatherGlobalIp.js
node --check server/src/lib/weatherGlobalIpWorker.js
staged=$(mktemp -d "$live/ip-worker-release.XXXXXX")
mkdir -p "$staged/src/lib"
cp server/src/lib/weatherGlobalIp*.js "$staged/src/lib/"
cp "$live/src/lib/weatherLocation.js" "$live/src/lib/weatherSource.js" "$staged/src/lib/"
ln -s "$live/vendor" "$staged/vendor"
ln -s "$live/data" "$staged/data"
node - "$staged/src/lib/weatherGlobalIp.js" <<'JS'
const assert=require('node:assert/strict');
const {lookupGlobalIp,globalIpCity}=require(process.argv[2]);
(async()=>{
 try {
  assert.equal(globalIpCity(await lookupGlobalIp('104.245.13.12')).name,'San Jose');
  assert.equal(globalIpCity(await lookupGlobalIp('39.144.58.249')),null);
  assert(process.memoryUsage().external < 40*1024*1024);
  console.log('PASS: isolated lookup preflight, API does not retain database');
 } finally {lookupGlobalIp.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
JS
backup=$(mktemp -d /www/backup/mooncci-weather-ip-worker.XXXXXX)
cp -p "$live/src/lib/weatherGlobalIp.js" "$backup/weatherGlobalIp.js"
changed=0
pm() { su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'; }
finish() {
 rc=$?; trap - EXIT; set +e
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
  cp -p "$backup/weatherGlobalIp.js" "$live/src/lib/weatherGlobalIp.js"
  rm -f -- "$live/src/lib/weatherGlobalIpWorker.js"
  pm
 fi
 case "$staged" in "$live"/ip-worker-release.*) rm -rf -- "$staged";; esac
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
changed=1
install -o mooncci -g mooncci -m 644 server/src/lib/weatherGlobalIp.js "$live/src/lib/weatherGlobalIp.js"
install -o mooncci -g mooncci -m 644 server/src/lib/weatherGlobalIpWorker.js "$live/src/lib/weatherGlobalIpWorker.js"
pm
healthy=0
for attempt in $(seq 1 20); do
 if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json"; then healthy=1; break; fi
 sleep 2
done
test "$healthy" = 1
cmp server/src/lib/weatherGlobalIp.js "$live/src/lib/weatherGlobalIp.js"
cmp server/src/lib/weatherGlobalIpWorker.js "$live/src/lib/weatherGlobalIpWorker.js"
printf 'PASS: isolated offline IP lookup; frontend, runtime, database, config and worker unchanged.\n'
