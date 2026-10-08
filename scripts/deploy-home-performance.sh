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
test "$(sha256sum "$live/src/index.js" | cut -d' ' -f1)" = 2540c13613736fe42751cecb236d517f641b15581f720f1f8b1c4abe26fef093
node --check server/src/index.js
node --check server/src/lib/imageVariants.js
node --input-type=module -e "await import('./server/runtime/document.mjs')"
backup=$(mktemp -d /www/backup/mooncci-home-performance.XXXXXX)
cp -p "$live/src/index.js" "$backup/index.js"
cp -p "$web/index.html" "$backup/index.html"
if [ -f "$live/src/lib/imageVariants.js" ]; then cp -p "$live/src/lib/imageVariants.js" "$backup/imageVariants.js"; fi
rsync -ac server/runtime/ "$live/runtime-next/"
chown -R mooncci:mooncci "$live/runtime-next"
changed=0
pm() { su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'; }
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    cp -p "$backup/index.js" "$live/src/index.js"
    cp -p "$backup/index.html" "$web/index.html"
    if [ -f "$backup/imageVariants.js" ]; then cp -p "$backup/imageVariants.js" "$live/src/lib/imageVariants.js"; else rm -f "$live/src/lib/imageVariants.js"; fi
    if [ -d "$backup/runtime" ]; then mv "$live/runtime" "$backup/runtime-failed"; mv "$backup/runtime" "$live/runtime"; fi
    pm
  fi
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
changed=1
mv "$live/runtime" "$backup/runtime"
mv "$live/runtime-next" "$live/runtime"
install -o mooncci -g mooncci -m 644 server/src/lib/imageVariants.js "$live/src/lib/imageVariants.js"
install -o mooncci -g mooncci -m 644 server/src/index.js "$live/src/index.js"
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-performance.new"
mv "$web/.index-performance.new" "$web/index.html"
pm
healthy=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json"; then healthy=1; break; fi
  sleep 2
done
test "$healthy" = 1
node -e 'if(!JSON.parse(require("fs").readFileSync(process.argv[1])).ok)process.exit(1)' "$backup/health.json"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
curl -fsS --resolve mooncci.site:443:127.0.0.1 https://mooncci.site/ > "$backup/home.html"
grep -q /api/image-variants/ "$backup/home.html"
printf 'PASS: frontend, SSR and bounded image variants deployed; environment, uploads, SQL and worker unchanged.\n'
