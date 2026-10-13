#!/usr/bin/env bash
# Scoped UI release. Always execute in a nohup child shell; never source.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
mode=$(cat TARGET)
live=/www/wwwroot/mooncci-source/server
case "$mode" in
 main) web=/www/wwwroot/mooncci.site; export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH" ;;
 reader) web=$(readlink -f /opt/mooncci-reader/current/dist)
   case "$web" in /opt/mooncci-reader/releases/*/dist) ;; *) echo 'Unexpected reader directory'; exit 2 ;; esac ;;
 *) echo 'Unexpected release target'; exit 2 ;;
esac
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d "/www/backup/mooncci-article-ui-$mode.XXXXXX")
changed=0
stage=''
finish() {
 rc=$?; trap - EXIT; set +e
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
   MOONCCI_DEPLOY_LOCK_HELD=1 bash "$backup/rollback.sh" "$backup" || printf 'ROLLBACK NEEDS ATTENTION: %s\n' "$backup"
 fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
test -s "$web/index.html"
command -v rsync >/dev/null
command -v python3 >/dev/null
python3 - "$mode" "$web" "$live" <<'PY'
import hashlib,json,sys
from pathlib import Path
mode,web,live=sys.argv[1:]
baseline=json.loads(Path('BASELINE.json').read_text())
sha=lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
expected=baseline['index' if mode=='main' else 'reader_index']
if sha(web+'/index.html') not in [expected,sha('dist/index.html')]: raise SystemExit('Published frontend drift')
if mode=='main':
 if sha(live+'/runtime/document.mjs') not in [baseline['runtime'],sha('server/runtime/document.mjs')]: raise SystemExit('Published SSR drift')
 for name,expected in baseline['prerequisites'].items():
  if name not in ['src/lib/publicDocument.js','src/services/articleSummary.js']: raise SystemExit('Unexpected prerequisite')
  if sha(live+'/'+name)!=expected: raise SystemExit('Backend prerequisite drift: '+name)
PY
cp -p "$web/index.html" "$backup/index.html"
cp rollback.sh "$backup/rollback.sh"
cp TARGET REVISION "$backup/"
printf '%s\n' "$web" > "$backup/WEB_ROOT"
# Back up every existing file this package will overwrite, including unhashed assets.
sed -n 's|^[0-9a-f]*  dist/||p' SHA256SUMS | while IFS= read -r file; do
 test "$file" = index.html && continue
 if [ -f "$web/$file" ]; then printf '%s\n' "$file"; fi
done > "$backup/existing-frontend-files"
tar -cpf "$backup/frontend-before.tar" -C "$web" -T "$backup/existing-frontend-files"
if [ "$mode" = main ]; then
 test -s "$live/.env"
 stage=$(mktemp -d "$live/.runtime-article-ui.XXXXXX")
 rsync -ac server/runtime/ "$stage/"
 chown -R mooncci:mooncci "$stage"
 chmod -R u=rwX,go=rX "$stage"
 # Resolve existing dependencies from the live server; no dependency installation.
 node --input-type=module -e 'await import(process.argv[1])' "$stage/document.mjs"
fi
changed=1
# Keep old hashed chunks available for already-open pages and rollback.
rsync -ac --exclude=index.html dist/ "$web/"
if [ "$mode" = main ]; then
 mv "$live/runtime" "$backup/runtime-old"
 mv "$stage" "$live/runtime"
fi
install -m 644 dist/index.html "$web/.index-article-ui.new"
mv -f "$web/.index-article-ui.new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
if [ "$mode" = main ]; then
 sed -n 's|  server/runtime/|  |p' SHA256SUMS > "$backup/runtime-checksums"
 (cd "$live/runtime" && sha256sum --strict -c "$backup/runtime-checksums") > "$backup/runtime-verification.log"
 su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api --update-env'
 ready=0
 for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" && node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).ok!==true)process.exit(1)' "$backup/health.json"; then ready=1; break; fi
  sleep 2
 done
 test "$ready" = 1
 curl -fsS --max-time 20 --resolve mooncci.site:443:127.0.0.1 https://mooncci.site/article/17 > "$backup/article17.html"
 node - "$backup/article17.html" <<'NODE'
const html=require('fs').readFileSync(process.argv[2],'utf8');
for(const value of ['hero-band','hero-meta','class="g"','循环的语法','mooncci-document-data','rel="canonical" href="https://mooncci.site/article/17"'])if(!html.includes(value))throw Error('Missing article document: '+value);
NODE
fi
printf 'PASS: %s UI release %s; preserved backend source, configuration, dependencies, uploads and SQL.\n' "$mode" "$(cat REVISION)"
