#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
node_bin=/opt/mooncci-node-v24.20.0/bin/node
[[ ${EUID} -eq 0 && -x "$node_bin" && -f "$source_root/server/.env" && -f "$site_root/index.html" ]]
(cd "$bundle" && sed 's/\r$//' SHA256SUMS | sha256sum -c -)
while IFS= read -r file; do
 file=${file%$'\r'}
 [[ "$file" != *..* && -f "$bundle/$file" ]]
 case "$file" in server/*.js) "$node_bin" --check "$bundle/$file" ;; server/database/migrations/*.sql|src/*.tsx|src/*.css) ;; *) exit 1 ;; esac
done < "$bundle/SOURCE-FILES.txt"
su -s /bin/bash mooncci -c 'pm2 jlist' | "$node_bin" -e '
let input=""; process.stdin.on("data",c=>input+=c).on("end",()=>{
 const processes=JSON.parse(input);
 if(!["mooncci-api","mooncci-worker"].every(name=>processes.some(p=>p.name===name&&p.pm2_env.pm_cwd==="/www/wwwroot/mooncci-source/server"))){console.error("API/worker 目录与预期不符，未修改。");process.exitCode=1;}
});'
backup="/www/backup/mooncci-electricity-rooms-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
cp -p "$source_root/server/.env" "$backup/server.env"
cp -p "$site_root/index.html" "$backup/index.html"
while IFS= read -r file; do
 file=${file%$'\r'}
 if [[ -f "$source_root/$file" ]]; then printf '%s\n' "$file"; fi
done < "$bundle/SOURCE-FILES.txt" > "$backup/existing-files.txt"
tar -czf "$backup/source.tar.gz" -C "$source_root" -T "$backup/existing-files.txt"
# Stop both processes while backing up/migrating; no public API can read a half-migrated room.
su -s /bin/bash mooncci -c 'pm2 stop mooncci-api mooncci-worker'
failed() {
 trap - ERR
 su -s /bin/bash mooncci -c 'pm2 stop mooncci-api mooncci-worker' || true
 echo "部署未完成。API/worker 保持停止，避免恢复公开电量接口。备份：$backup" >&2
 echo '修复终端上方错误后可重新执行本脚本；不要删除服务端加密密钥。' >&2
 exit 1
}
trap failed ERR
while IFS= read -r file; do
 file=${file%$'\r'}
 install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"
(cd "$source_root/server" && "$node_bin" scripts/backup-electricity-rooms.js "$backup/database")
su -s /bin/bash mooncci -c 'cd /www/wwwroot/mooncci-source/server && /opt/mooncci-node-v24.20.0/bin/node scripts/ensure-electricity-key.js'
chmod 600 "$source_root/server/.env"
cp -p "$source_root/server/.env" "$backup/server-with-electricity-key.env"
su -s /bin/bash mooncci -c 'cd /www/wwwroot/mooncci-source/server && /opt/mooncci-node-v24.20.0/bin/node scripts/migrate.js'
su -s /bin/bash mooncci -c 'cd /www/wwwroot/mooncci-source/server && /opt/mooncci-node-v24.20.0/bin/node scripts/migrate-electricity-room.js'
# Publish while API remains stopped; old UI cannot issue an unscoped request during migration.
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f -- "$site_root/index.html.next" "$site_root/index.html"
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api mooncci-worker --update-env'
curl --retry 8 --retry-delay 1 --retry-connrefused --connect-timeout 3 --max-time 5 -fsS http://127.0.0.1:3001/api/health
privacy=$(curl --connect-timeout 3 --max-time 5 -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/electricity)
[[ "$privacy" == 401 ]]
trap - ERR
echo "多宿舍功能发布完成，匿名电量接口已验证为 401。备份：$backup"
echo '后台 → 水电监控设置 → 添加宿舍 / 批量导入。原有宿舍仅站长可见。'
