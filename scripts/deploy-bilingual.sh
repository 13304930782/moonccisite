#!/usr/bin/env bash
# Run in a nohup child shell; never source.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
node=/opt/mooncci-node-v24.20.0/bin/node
live=/www/wwwroot/mooncci-source/server
nginx=/www/server/nginx/sbin/nginx
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
"$node" verify-bilingual-release.cjs verify "$package"
test -s "$live/.env"
test -d "$live/runtime/node_modules/jsdom"
test -d "$live/node_modules"
test -x "$nginx"
"$nginx" -t
python3 -c 'from pathlib import Path; [compile(Path(p).read_bytes(),p,"exec") for p in ["ops/refresh-sitemap.py","ops/indexnow.py"]]'
"$node" -e 'const fs=require("fs"),cp=require("child_process");for(const n of Object.keys(JSON.parse(fs.readFileSync("MANIFEST.json")).files)){if(n.startsWith("server/src/")&&n.endsWith(".js")){const r=cp.spawnSync(process.execPath,["--check",n],{stdio:"inherit"});if(r.status!==0)process.exit(1)}}'
backup=$(mktemp -d /www/backup/mooncci-bilingual.XXXXXX)
printf 'BACKUP=%s\n' "$backup"
printf '%s\n' "$backup" > "$package/BACKUP_PATH"
stopped=0
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
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
# Verify both existing processes before stopping either one; no new process definitions.
pm jlist | "$node" -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const p=JSON.parse(s);for(const n of ["mooncci-api","mooncci-worker"]){const a=p.filter(x=>x.name===n);if(a.length!==1||a[0].pm2_env.status!=="online")process.exit(1)}})'
"$node" verify-bilingual-release.cjs snapshot "$package" "$backup"
printf 'snapshot-complete\n' > "$backup/STAGE"
stopped=1
pm stop mooncci-api mooncci-worker
printf 'services-stopped\n' > "$backup/STAGE"
"$node" verify-bilingual-release.cjs backup-db "$backup"
(cd "$backup" && sha256sum --strict -c database-before.sql.sha256)
"$node" verify-bilingual-release.cjs verify "$package"
changed=1
printf 'installing\n' > "$backup/STAGE"
"$node" verify-bilingual-release.cjs install "$package"
"$nginx" -t
"$node" --input-type=module -e 'await import("file:///www/wwwroot/mooncci-source/server/runtime/document.mjs")'
(cd "$live" && "$node" scripts/migrate-bilingual.js --check && "$node" scripts/migrate-bilingual.js --apply && "$node" scripts/migrate-bilingual.js --check) > "$backup/migration.log" 2>&1
"$node" verify-bilingual-release.cjs verify-db "$backup"
printf 'migration-verified\n' > "$backup/STAGE"
# No backend has run against translated data yet. From this point, rollback keeps it.
touch "$backup/BACKEND_STARTED"
pm restart mooncci-api mooncci-worker
"$nginx" -s reload
ready=0
for attempt in $(seq 1 30); do
  if "$node" -e 'fetch("http://127.0.0.1:3001/api/health",{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok||(await r.json()).ok!==true)process.exit(1)}).catch(()=>process.exit(1))'; then ready=1; break; fi
  sleep 2
done
test "$ready" = 1
python3 - <<'PY'
import importlib.util, urllib.request
def load(name, file):
    spec=importlib.util.spec_from_file_location(name,file); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
sitemap=load('sitemap','/opt/mooncci-sitemap/refresh-sitemap.py')
indexnow=load('indexnow','/opt/mooncci-indexnow/indexnow.py')
with urllib.request.urlopen('http://127.0.0.1:3001/sitemap.xml',timeout=15) as response: data=response.read(10*1024*1024+1)
if len(data)>10*1024*1024: raise ValueError('Sitemap too large')
sitemap.validate(data)
for value in ['https://moooncci.cn/','https://moooncci.cn/en','https://moooncci.cn/en/article/bilingual-verification']: indexnow.public_url(value)
print('PASS: live sitemap and bilingual IndexNow URL validation; no URLs submitted')
PY
"$node" -e 'const fs=require("fs");const p=process.argv[1];fs.writeFileSync(p+"/runtime/deployment.json",JSON.stringify({revision:JSON.parse(fs.readFileSync("MANIFEST.json")).revision,completedAt:new Date().toISOString(),scope:"bilingual",result:"success"})+"\n",{mode:0o600})' "$live"
chown mooncci:mooncci "$live/runtime/deployment.json"
touch "$backup/SUCCESS"
printf 'complete\n' > "$backup/STAGE"
printf 'PASS: bilingual API, worker, SSR, frontend, incremental migration, Nginx and sitemap/IndexNow scripts. Existing timer configuration and queues retained.\n'
