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
node --input-type=module -e "await import('./server/runtime/document.mjs')"
backup=$(mktemp -d /www/backup/mooncci-weather-city.XXXXXX)
cp -p "$web/index.html" "$backup/index.html"
staged=$(mktemp -d "$live/runtime-weather-city.XXXXXX")
rsync -ac server/runtime/ "$staged/"
chown -R mooncci:mooncci "$staged"
changed=0
pm() { su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'; }
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    cp -p "$backup/index.html" "$web/index.html"
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
printf 'PASS: scoped weather-city frontend and matching SSR runtime release; no migrations or dependency installation.\n'
