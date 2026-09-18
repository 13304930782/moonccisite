#!/usr/bin/env bash
# Run in a child shell (nohup bash); never source this script.
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-article-dates.XXXXXX)
chmod 700 "$backup"
changed=0
pmrestart(){ su -s /bin/bash mooncci -c 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api'; }
health(){ local ok=0;for n in $(seq 1 30);do if curl -fsS --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" && node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1])).ok!==true)process.exit(1)' "$backup/health.json";then ok=1;break;fi;sleep 1;done;test "$ok" = 1; }
finish(){
 rc=$?;trap - EXIT;set +e
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ];then
   tar -xpf "$backup/server-before.tar" -C "$live"
   cp -p "$backup/index.html" "$web/index.html"
   pmrestart && health
   echo "Failed; restored original files. "
 fi
 echo "Backup: $backup"
 echo "Deploy exit code: $rc"
 exit "$rc"
}
trap finish EXIT
# Only known baseline files can be replaced. Unknown production edits stop deployment.
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');const live=process.argv[2];const hashes=require('./BASELINE.json');
for(const [name,accepted] of Object.entries(hashes)){const file=path.join(live,name);if(!fs.existsSync(file)){if(accepted.includes(null))continue;throw Error('Required file missing: '+name);}const h=crypto.createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/^\uFEFF/,'')).digest('hex');if(!accepted.includes(h))throw Error('Production file differs; refusing overwrite: '+name);}
NODE
node - "$live" <<'NODE'
const db=require(require('path').join(process.argv[2],'src/db'));
(async()=>{try{await db.query('SELECT id,version,payload FROM article_drafts LIMIT 0');await db.query('SELECT version,updated_at,published_at FROM posts LIMIT 0');}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
NODE
: > "$backup/existing-files"
while IFS= read -r file;do
 case "$file" in src/routes/posts.js|src/routes/articleDrafts.js) ;; *) echo 'Unexpected file manifest';exit 1;; esac
 test -s "server/$file"
 if [ -e "$live/$file" ];then printf '%s\n' "$file" >> "$backup/existing-files";fi
 if [[ "$file" == *.js ]];then node --check "server/$file";fi
done < BACKEND_FILES
tar -cpf "$backup/server-before.tar" -C "$live" -T "$backup/existing-files"
cp -p "$web/index.html" "$backup/index.html"
changed=1
while IFS= read -r file;do install -D -o mooncci -g mooncci -m 644 "server/$file" "$live/$file";done < BACKEND_FILES

pmrestart
health
# Publish immutable assets before switching the HTML entry point.
for item in dist/*;do [ "$(basename "$item")" = index.html ] && continue;cp -a "$item" "$web/";done
install -m 644 dist/index.html "$web/.article-dates-index.tmp"
mv -f "$web/.article-dates-index.tmp" "$web/index.html"
echo 'Article update dates and ordering deployed. No migrations were executed.'
