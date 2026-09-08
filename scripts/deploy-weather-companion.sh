#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
node_bin=/opt/mooncci-node-v24.20.0/bin/node
migration=server/database/migrations/202609080001_create_companion_interactions.sql
[[ ${EUID} -eq 0 && -x "$node_bin" && -f "$source_root/server/src/index.js" && -f "$site_root/index.html" ]]
(cd "$bundle" && sed 's/\r$//' SHA256SUMS | sha256sum -c -)
while IFS= read -r file; do
  [[ "$file" != *..* && "$file" != /* && -f "$bundle/$file" ]]
  case "$file" in src/*|public/licenses/*|server/src/*|server/database/migrations/*) ;; *) echo "Unexpected source: $file"; exit 1 ;; esac
  case "$file" in server/src/*.js|server/src/*/*.js) "$node_bin" --check "$bundle/$file" ;; esac
done < "$bundle/SOURCE-FILES.txt"

# Never replace an already applied migration with different content.
if [[ -f "$source_root/$migration" ]]; then cmp -- "$bundle/$migration" "$source_root/$migration"; fi
[[ -f "$source_root/server/scripts/migrate.js" ]]

# This release fixes mainland connectivity; require the Key configuration step first.
"$node_bin" - "$source_root" <<'NODE'
const path=require('path'),root=process.argv[2];
const env=require(path.join(root,'server/node_modules/dotenv')).config({path:path.join(root,'server/.env')}).parsed || {};
if(env.MOONCCI_CITY_PROVIDER!=='amap' || !env.AMAP_WEB_SERVICE_KEY){
  console.error('请先执行本包 configure-weather-amap.sh 配置高德 Web 服务 Key，未部署。');process.exitCode=1;
}
NODE

"$node_bin" "$bundle/check-weather-source.cjs"

# Do not update a checkout that the API does not use.
su -s /bin/bash mooncci -c 'pm2 jlist' | "$node_bin" -e '
let input=""; process.stdin.on("data",c=>input+=c).on("end",()=>{
  const api=JSON.parse(input).find(p=>p.name==="mooncci-api");
  if(!api || api.pm2_env.pm_cwd!=="/www/wwwroot/mooncci-source/server") {
    console.error("mooncci-api 未运行在 /www/wwwroot/mooncci-source/server，未部署。请先核对当前 API 目录。"); process.exitCode=1;
  }
});'

backup="/www/backup/mooncci-weather-companion-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
cp -p -- "$site_root/index.html" "$backup/index.html"
while IFS= read -r file; do
  if [[ -f "$source_root/$file" ]]; then printf '%s\n' "$file"; fi
done < "$bundle/SOURCE-FILES.txt" > "$backup/existing-files.txt"
printf '%s\n' server/src/index.js >> "$backup/existing-files.txt"
tar -czf "$backup/source.tar.gz" -C "$source_root" -T "$backup/existing-files.txt"
cp -p "$source_root/server/src/index.js" "$backup/index.next.js"
"$node_bin" - "$backup/index.next.js" <<'NODE'
const fs=require('fs'),file=process.argv[2];
let text=fs.readFileSync(file,'utf8');
const lines=["app.use('/api/weather-mood', require('./routes/weatherMood').router);","app.use('/api/admin/weather-companion', require('./routes/weatherMood').admin);"];
for(const line of lines){
  if(text.includes(line))continue;
  const route=line.match(/app.use\('([^']+)'/)[1];
  if(text.includes("app.use('"+route+"'"))throw Error('Unexpected existing weather route');
  const anchor="app.use('/api/electricity', electricityRoutes);";
  if(!text.includes(anchor))throw Error('Missing API route anchor');
  text=text.replace(anchor,anchor+'\n'+line);
}
const oldGlobal="app.use('/api', globalLimiter);";
const newGlobal="app.use('/api', require('./middleware/weatherClientLimit').outsideWeatherGlobal(globalLimiter));";
if(!text.includes(newGlobal)){
  if(!text.includes(oldGlobal))throw Error('Missing global limiter anchor');
  text=text.replace(oldGlobal,newGlobal);
}
fs.writeFileSync(file,text);
NODE
"$node_bin" --check "$backup/index.next.js"
rollback() {
  trap - ERR
  echo "部署失败，恢复备份：$backup" >&2
  tar -xzf "$backup/source.tar.gz" -C "$source_root"
  cp -p "$backup/index.html" "$site_root/index.html"
  su -s /bin/bash mooncci -c 'pm2 restart mooncci-api --update-env' || true
  exit 1
}
trap rollback ERR
install -D -o mooncci -g mooncci -m 644 "$bundle/$migration" "$source_root/$migration"
migration_preview=$(su -s /bin/bash mooncci -c "cd '$source_root/server' && '$node_bin' scripts/migrate.js --dry-run")
printf '%s\n' "$migration_preview"
# Apply only this release's pending migration, never unrelated pending changes.
while IFS= read -r pending; do
  if [[ "$pending" != "${migration##*/}" ]]; then
    echo "发现其他待执行迁移：$pending；未执行业务迁移，请先核对。" >&2
    rollback
  fi
done < <(printf '%s\n' "$migration_preview" | sed -n 's/^  - //p')
su -s /bin/bash mooncci -c "cd '$source_root/server' && '$node_bin' scripts/migrate.js"
while IFS= read -r file; do
  install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"
install -o mooncci -g mooncci -m 644 "$backup/index.next.js" "$source_root/server/src/index.js"
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api --update-env'
curl --retry 8 --retry-delay 1 --retry-connrefused --connect-timeout 3 --max-time 5 -fsS http://127.0.0.1:3001/api/health
curl --connect-timeout 3 --max-time 8 -fsS http://127.0.0.1:3001/api/weather-mood/interactions
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f -- "$site_root/index.html.next" "$site_root/index.html"
trap - ERR
echo "天气小球部署完成；备份：$backup"
echo '天气来源分流已发布，无需 worker 重启。刷新首页，打开小球核对所选城市与天气来源。'
