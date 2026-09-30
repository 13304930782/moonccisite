#!/usr/bin/env bash
# Backend routes only. Run in a child shell, never source.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/www/wwwroot/mooncci-source/server
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
node - "$live" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=b=>crypto.createHash('sha256').update(b.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
const baseline=JSON.parse(fs.readFileSync('BASELINE.json','utf8'));
for(const [name,old] of Object.entries(baseline)){
 const target=path.join(process.argv[2],name);
 const current=fs.existsSync(target)?hash(fs.readFileSync(target)):null;
 const next=hash(fs.readFileSync(path.join('server',name)));
 if(current!==old&&current!==next)throw Error('Unreviewed live file: '+name);
}
NODE
api_id=$(pm jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const a=JSON.parse(s).filter(p=>p.pm2_env.pm_exec_path==="/www/wwwroot/mooncci-source/server/src/index.js"&&p.pm2_env.status==="online");if(a.length!==1)process.exit(1);console.log(a[0].pm_id)})')
[[ "$api_id" =~ ^[0-9]+$ ]]
mapfile -t files < BACKEND_FILES
for file in "${files[@]}"; do node --check "server/$file"; done
curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:3001/api/health >/dev/null
backup=$(mktemp -d /www/backup/mooncci-article-images.XXXXXX)
printf '%s\n' "$api_id" > "$backup/API_ID"
cp rollback.sh "$backup/rollback.sh"
existing=()
: > "$backup/ADDED_FILES"
for file in "${files[@]}"; do
 if [ -f "$live/$file" ]; then existing+=("$file"); else printf '%s\n' "$file" >> "$backup/ADDED_FILES"; fi
done
tar -cpf "$backup/backend-before.tar" -C "$live" "${existing[@]}"
cp BACKEND_FILES "$backup/BACKEND_FILES"
cp BASELINE.json "$backup/BASELINE.json"
node - "$live" "$backup" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const states={};
for(const name of fs.readFileSync('BACKEND_FILES','utf8').trim().split('\n')){
 const target=path.join(process.argv[2],name);
 states[name]={before:fs.existsSync(target)?hash(fs.readFileSync(target)):null,after:hash(fs.readFileSync(path.join('server',name)))};
}
fs.writeFileSync(path.join(process.argv[3],'ROLLBACK_STATE.json'),JSON.stringify(states)+'\n');
NODE
changed=0
finish() {
 rc=$?; trap - EXIT
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
  MOONCCI_DEPLOY_LOCK_HELD=1 bash "$backup/rollback.sh" "$backup" || printf 'ROLLBACK NEEDS ATTENTION\n'
 fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
changed=1
for file in "${files[@]}"; do install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"; done
for file in "${files[@]}"; do cmp -s "server/$file" "$live/$file"; done
pm restart "$api_id"
healthy=0
for attempt in $(seq 1 15); do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" 2> "$backup/health-error.log" && node -e 'try{if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)}catch{process.exit(1)}' "$backup/health.json"; then healthy=1; break; fi
 printf 'Waiting for API readiness (%s/15)...\n' "$attempt"
 sleep 2
done
test "$healthy" = 1
node <<'NODE'
(async()=>{
 const get=async path=>{const r=await fetch('http://127.0.0.1:3001/api'+path,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Article probe HTTP '+r.status);return r.json();};
 const posts=await get('/posts?limit=1');
 if(!Array.isArray(posts))throw Error('Unexpected article list');
 if(posts.length){
  const post=await get('/posts/'+encodeURIComponent(posts[0].id));
  if(!post.image_dimensions||typeof post.image_dimensions!=='object'||Array.isArray(post.image_dimensions))throw Error('Article dimension field missing');
  console.log('Verified article response; known image dimensions:',Object.keys(post.image_dimensions).length);
 }else console.log('No published article to probe; API health verified.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
NODE
printf 'PASS: article image dimensions applied; API restarted. No worker, frontend, dependency, Nginx or database changes.\n'
