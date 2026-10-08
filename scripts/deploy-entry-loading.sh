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
test "$(sha256sum "$live/src/lib/publicDocument.js" | cut -d' ' -f1)" = b88de92d7999f9bd4720620f38871285d70cf216f01863d9f5a14a2d1b0400c2
test "$(sha256sum "$live/src/routes/seo.js" | cut -d' ' -f1)" = 63375f1727269810c5626fa82c73301fee982a6cf0b870eee692d79d92640a56
node --check server/src/lib/publicDocument.js
node --check server/src/routes/seo.js
node --input-type=module -e "await import('./server/runtime/document.mjs')"
backup=$(mktemp -d /www/backup/mooncci-entry-loading.XXXXXX)
cp -p "$live/src/lib/publicDocument.js" "$backup/publicDocument.js"
cp -p "$live/src/routes/seo.js" "$backup/seo.js"
cp -p "$web/index.html" "$backup/index.html"
staged=$(mktemp -d "$live/runtime-entry-loading.XXXXXX")
rsync -ac server/runtime/ "$staged/"
chown -R mooncci:mooncci "$staged"
changed=0
pm() { su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'; }
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    cp -p "$backup/publicDocument.js" "$live/src/lib/publicDocument.js"
    cp -p "$backup/seo.js" "$live/src/routes/seo.js"
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
install -o mooncci -g mooncci -m 644 server/src/lib/publicDocument.js "$live/src/lib/publicDocument.js"
install -o mooncci -g mooncci -m 644 server/src/routes/seo.js "$live/src/routes/seo.js"
pm
healthy=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/auth/session > "$backup/session.json"; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).user!==null)process.exit(1)' "$backup/session.json"
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-entry-loading.new"
mv "$web/.index-entry-loading.new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
curl -fsS --resolve mooncci.site:443:127.0.0.1 https://mooncci.site/ > "$backup/home.html"
grep -q 'id="mooncci-home-css"' "$backup/home.html"
test "$(curl -sS -o /dev/null -w '%{http_code}' https://mooncci.site/api/auth/me)" = 401
printf 'PASS: scoped entry-loading and seo-bootstrap release; no migrations or dependency installation.\n'
