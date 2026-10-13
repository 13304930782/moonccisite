#!/usr/bin/env bash
# Always run in a nohup child shell, never source into an interactive SSH shell.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-article-summary.XXXXXX)
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
finish() {
 rc=$?; trap - EXIT
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then bash "$backup/rollback.sh" "$backup" || printf 'ROLLBACK NEEDS ATTENTION: %s\n' "$backup"; fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/package-checksums.log"
test -s "$live/.env"
test -s "$live/runtime/document.mjs"
test -s "$web/index.html"
test -d "$live/node_modules"
command -v rsync >/dev/null
pm describe mooncci-api > "$backup/api-before.txt"
pm describe mooncci-worker > "$backup/worker-before.txt"
node - "$live" "$web" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),live=process.argv[2],web=process.argv[3];
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node 24 required');
const sha=(b,normalize=true)=>crypto.createHash('sha256').update(normalize?b.toString('utf8').replace(/\r\n/g,'\n'):b).digest('hex');
const baseline=JSON.parse(fs.readFileSync('BASELINE.json','utf8'));
for(const [name,expected] of Object.entries(baseline.backend)){
 const file=path.join(live,name),next=sha(fs.readFileSync(path.join('server',name)));
 const actual=fs.existsSync(file)?sha(fs.readFileSync(file)):null;
 if(actual!==expected&&actual!==next)throw Error('Unreviewed backend change: '+name);
}
for(const [name,expected] of Object.entries(baseline.prerequisites))if(sha(fs.readFileSync(path.join(live,name)))!==expected)throw Error('Prerequisite changed: '+name);
for(const [file,expected] of Object.entries(baseline.entries)){
 const next=file===web+'/index.html'?'dist/index.html':'server/'+path.relative(live,file).replace(/\\/g,'/');
 const actual=sha(fs.readFileSync(file),false);
 if(actual!==expected&&actual!==sha(fs.readFileSync(next),false))throw Error('Published entry changed: '+file);
}
require(path.join(live,'node_modules/dotenv')).config({path:path.join(live,'.env'),quiet:true});
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw Error('JWT_SECRET must contain at least 32 characters');
if(process.env.ARTICLE_AI_SECRET_KEY&&!/^[a-f0-9]{64}$/i.test(process.env.ARTICLE_AI_SECRET_KEY))throw Error('Invalid ARTICLE_AI_SECRET_KEY');
NODE
printf '%s\n' "$live" > "$backup/LIVE_ROOT"
printf '%s\n' "$web" > "$backup/WEB_ROOT"
cp -p "$web/index.html" "$backup/index.html"
cp rollback.sh "$backup/rollback.sh"
cp BACKEND_FILES "$backup/BACKEND_FILES"
: > "$backup/existing-files"
: > "$backup/new-files"
mapfile -t files < BACKEND_FILES
for file in "${files[@]}"; do
 case "$file" in
 src/index.js|src/lib/articlePublishing.js|src/lib/articleRevisions.js|src/lib/articleSummaryProof.js|src/lib/seo.js|src/routes/articleDrafts.js|src/routes/posts.js|src/routes/articleSeo.js|src/services/articleWorkflow.js|src/services/articleSummary.js) ;;
 *) printf 'Unexpected package scope: %s\n' "$file"; exit 1 ;;
 esac
 node --check "server/$file"
 if [ -e "$live/$file" ]; then printf '%s\n' "$file" >> "$backup/existing-files"; else printf '%s\n' "$file" >> "$backup/new-files"; fi
done
tar -cpf "$backup/backend-before.tar" -C "$live" -T "$backup/existing-files"
runtime_stage=$(mktemp -d "$live/.runtime-summary.XXXXXX")
rsync -ac server/runtime/ "$runtime_stage/"
chown -R mooncci:mooncci "$runtime_stage"
chmod -R u=rwX,go=rX "$runtime_stage"
changed=1
mv "$live/runtime" "$backup/runtime-old"
mv "$runtime_stage" "$live/runtime"
for file in "${files[@]}"; do install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"; done
# Keep prior frontend chunks available to already-open pages. No --delete.
rsync -ac --exclude=index.html dist/ "$web/"
install -m 644 dist/index.html "$web/.index-summary-new"
mv -f "$web/.index-summary-new" "$web/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
(cd "$web" && sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"
pm restart mooncci-api --update-env
pm restart mooncci-worker --update-env
ready=0
for attempt in $(seq 1 30); do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" && node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then ready=1; break; fi
 sleep 2
done
test "$ready" = 1
for path in /api/article-seo/settings /api/article-seo/status /api/node-monitor/access; do
 test "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:3001$path")" = 401
done
curl -fsS --max-time 20 'http://127.0.0.1:3001/api/seo?path=/article/16' > "$backup/article16-meta.json"
curl -fsS --max-time 20 'http://127.0.0.1:3001/' > "$backup/home.html"
node - "$backup" <<'NODE'
const fs=require('fs'),path=require('path'),root=process.argv[2],m=JSON.parse(fs.readFileSync(path.join(root,'article16-meta.json'),'utf8'));
if(m.description.length<80||m.canonical!=='https://mooncci.site/article/16'||!m.robots.startsWith('index'))throw Error('Article SEO verification failed');
const html=fs.readFileSync(path.join(root,'home.html'),'utf8');if(!html.includes('个人技术博客与开发实践')||!html.includes('/node-monitor')||!html.includes('Explore'))throw Error('Home content or deployed navigation missing');
NODE
pm save
printf 'PASS: article AI summary deployed. API and worker restarted; no env, dependency, Nginx or database migration changes.\n'
