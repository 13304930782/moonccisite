#!/usr/bin/env bash
# Upgrade the existing BaoTa installation; run as root during a maintenance window.
set -Eeuo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
node_bin=/opt/mooncci-node-v24.20.0/bin/node
export PATH="$(dirname "$node_bin"):$PATH"
[[ ${EUID} -eq 0 ]] || { echo '请在宝塔 root 终端执行。' >&2; exit 1; }
[[ -x "$node_bin" && -f "$source_root/server/.env" && -f "$source_root/server/package.json" && -f "$site_root/index.html" ]]
for program in rsync tar sha256sum curl su npm; do command -v "$program" >/dev/null; done
"$node_bin" -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
dump_bin=$(command -v mysqldump || true)
[[ -n "$dump_bin" ]] || dump_bin=/www/server/mysql/bin/mysqldump
[[ -x "$dump_bin" ]] || { echo '找不到 mysqldump，未修改站点。' >&2; exit 1; }
(cd "$bundle" && sha256sum --quiet -c SHA256SUMS)
while IFS= read -r file; do
  [[ -n "$file" && "$file" != /* && "$file" != *..* && -f "$bundle/$file" && ! -L "$bundle/$file" ]]
  case "$file" in server/.env|*/node_modules/*|*/uploads/*|server/ecosystem.config.cjs) exit 1 ;; esac
done < "$bundle/SOURCE-FILES.txt"
su -s /bin/bash mooncci -c 'pm2 jlist' | "$node_bin" -e '
let input="";process.stdin.on("data",v=>input+=v).on("end",()=>{
const all=JSON.parse(input);
if(!["mooncci-api","mooncci-worker"].every(name=>all.some(p=>p.name===name&&p.pm2_env.pm_cwd==="/www/wwwroot/mooncci-source/server"))){
 console.error("PM2 API/worker 目录不匹配；未部署。");process.exitCode=1;
}});'
"$node_bin" - "$source_root" <<'NODE'
const path=require('path'),root=process.argv[2];
require(path.join(root,'server/node_modules/dotenv')).config({path:path.join(root,'server/.env')});
const secret=process.env.JWT_SECRET||'';
if(secret.length<32||/replace_with|your_secret|change.?me/i.test(secret))throw Error('请先配置至少32字符的非示例 JWT_SECRET');
for(const key of ['DB_HOST','DB_USER','DB_NAME'])if(!process.env[key])throw Error(`缺少 ${key}`);
NODE

stamp=$(date +%Y%m%d-%H%M%S)
backup="/www/backup/mooncci-audit-$stamp"
stage="/www/wwwroot/.mooncci-audit-stage-$stamp"
install -d -m 700 "$backup"
install -d -o mooncci -g mooncci -m 755 "$stage"
install -o mooncci -g mooncci -m 644 "$bundle/server/package.json" "$bundle/server/package-lock.json" "$stage/"
# Install Linux dependencies before interrupting the running website.
su -s /bin/bash mooncci -c "export PATH='$(dirname "$node_bin")':\$PATH; cd '$stage'; npm ci --omit=dev --registry=https://registry.npmjs.org"
tar --exclude=./.git --exclude=./node_modules --exclude=./server/node_modules --exclude=./.cache --exclude=./server/uploads --exclude=./dist -czf "$backup/source.tar.gz" -C "$source_root" .
cp -p "$site_root/index.html" "$backup/index.html"
cp -p "$source_root/server/.env" "$backup/server.env"
failed() {
  trap - ERR
  su -s /bin/bash mooncci -c 'pm2 stop mooncci-api mooncci-worker' || true
  echo "部署失败，API/worker 保持停止。请保留终端错误及备份：$backup" >&2
  echo '没有自动回退到缺少会话撤销保护的旧后端；请修复错误后重试。' >&2
  exit 1
}
trap failed ERR
su -s /bin/bash mooncci -c 'pm2 stop mooncci-api mooncci-worker'

# Create a root-only option file so database passwords never enter argv or logs.
"$node_bin" - "$source_root" "$backup" <<'NODE'
const fs=require('fs'),path=require('path'),root=process.argv[2],backup=process.argv[3];
require(path.join(root,'server/node_modules/dotenv')).config({path:path.join(root,'server/.env')});
function quoted(value){return '"'+String(value||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r')+'"';}
const lines=['[client]',`host=${quoted(process.env.DB_HOST||'127.0.0.1')}`,`port=${Number(process.env.DB_PORT||3306)}`,`user=${quoted(process.env.DB_USER)}`,`password=${quoted(process.env.DB_PASSWORD)}`];
fs.writeFileSync(path.join(backup,'mysql.cnf'),lines.join('\n')+'\n',{mode:0o600,flag:'wx'});
fs.writeFileSync(path.join(backup,'database-name'),process.env.DB_NAME,{mode:0o600,flag:'wx'});
NODE
db_name=$(cat "$backup/database-name")
"$dump_bin" --defaults-extra-file="$backup/mysql.cnf" --single-transaction --routines --events --triggers --hex-blob --no-tablespaces --databases "$db_name" > "$backup/database.sql"
[[ -s "$backup/database.sql" ]]
chmod 600 "$backup/database.sql"
# The secret option file stays inside the root-only backup; .env is also backed up there.
while IFS= read -r file; do
  install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"
if [[ -d "$source_root/server/node_modules" ]]; then mv -- "$source_root/server/node_modules" "$backup/node_modules.previous"; fi
mv -- "$stage/node_modules" "$source_root/server/node_modules"
su -s /bin/bash mooncci -c "set -e; cd '$source_root/server'; '$node_bin' scripts/migrate.js --dry-run; '$node_bin' scripts/migrate.js"
"$node_bin" - "$source_root" <<'NODE'
const db=require(process.argv[2]+'/server/src/db');
(async()=>{try{await db.query('SELECT token_hash FROM auth_revocations LIMIT 1');await db.query('SELECT user_id FROM auth_invalidations LIMIT 1');}finally{await db.end();}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
NODE
# Keep old hashed assets available for already-open tabs. Publish index last.
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f -- "$site_root/index.html.next" "$site_root/index.html"
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api mooncci-worker --update-env'
curl --retry 10 --retry-delay 2 --retry-connrefused --connect-timeout 3 --max-time 5 -fsS http://127.0.0.1:3001/api/health
for endpoint in auth/me electricity; do
  status=$(curl --connect-timeout 3 --max-time 5 -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3001/api/$endpoint")
  [[ "$status" == 401 ]]
done
curl --connect-timeout 3 --max-time 5 -fsS -X POST -H 'X-Requested-With: XMLHttpRequest' http://127.0.0.1:3001/api/auth/logout
trap - ERR
printf '\n审计修复部署完成。备份：%s\n' "$backup"
echo '请在正式 HTTPS 网站登录→刷新→退出→再次刷新，并验证另一标签页同步退出。'
