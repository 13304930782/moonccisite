#!/usr/bin/env bash
# Run in a nohup child shell; do not source.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
node=/opt/mooncci-node-v24.20.0/bin/node
live=/www/wwwroot/mooncci-source/server
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
"$node" verify-bilingual-release.cjs verify "$package"
"$node" cleanup-motion-seo.cjs check MANIFEST.json
test -s "$live/.env"
test -d "$live/node_modules"
test -d "$live/runtime/node_modules/jsdom"
for file in server/src/index.js server/src/routes/account.js server/src/routes/articleLikes.js server/scripts/migrate-article-likes.js; do "$node" --check "$file"; done
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
pm jlist | "$node" -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const p=JSON.parse(s);for(const n of ["mooncci-api","mooncci-worker"]){const a=p.filter(x=>x.name===n);if(a.length!==1||a[0].pm2_env.status!=="online")process.exit(1)}})'
backup=$(mktemp -d /www/backup/mooncci-motion-seo.XXXXXX)
printf '%s\n' "$backup" > "$package/BACKUP_PATH"
stopped=0
changed=0
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ]; then
    if [ "$changed" = 1 ]; then
      MOONCCI_DEPLOY_LOCK_HELD=1 bash "$backup/rollback-bilingual.sh" "$backup" > "$backup/rollback.log" 2>&1
      printf '%s\n' "$?" > "$backup/rollback-exit-code"
    elif [ "$stopped" = 1 ]; then pm restart mooncci-api mooncci-worker; fi
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
"$node" verify-bilingual-release.cjs snapshot "$package" "$backup"
cp cleanup-motion-seo.cjs "$backup/cleanup-motion-seo.cjs"
stopped=1
pm stop mooncci-api mooncci-worker
"$node" verify-bilingual-release.cjs backup-db "$backup"
(cd "$backup" && sha256sum --strict -c database-before.sql.sha256)
"$node" server/scripts/migrate-article-likes.js "$live" --check
"$node" server/scripts/migrate-article-likes.js "$live" --apply
"$node" server/scripts/migrate-article-likes.js "$live" --verify
"$node" verify-bilingual-release.cjs verify-db "$backup"
changed=1
"$node" verify-bilingual-release.cjs install "$package"
"$node" --input-type=module -e 'await import("file:///www/wwwroot/mooncci-source/server/runtime/document.mjs")'
pm restart mooncci-api mooncci-worker
for attempt in $(seq 1 30); do
  if "$node" -e 'fetch("http://127.0.0.1:3001/api/health",{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok||(await r.json()).ok!==true)process.exit(1)}).catch(()=>process.exit(1))'; then break; fi
  [ "$attempt" -lt 30 ] || exit 1
  sleep 2
done
"$node" -e 'fetch("http://127.0.0.1:3001/article/cities-skylines-ii",{signal:AbortSignal.timeout(10000)}).then(async r=>{const html=await r.text();if(!r.ok||!/<nav[^>]*article-languages[^>]*data-nosnippet/i.test(html))process.exit(1)}).catch(()=>process.exit(1))'
touch "$backup/SUCCESS"
printf 'PASS: scoped motion/SEO release and article-likes migration.\n'
