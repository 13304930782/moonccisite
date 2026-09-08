#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
node_bin=/opt/mooncci-node-v24.20.0/bin/node
[[ ${EUID} -eq 0 && -x "$node_bin" && -f "$source_root/server/.env" ]]
[[ -f "$source_root/server/src/lib/electricityDailyUsage.js" && -f "$site_root/index.html" ]]
(cd "$bundle" && sed 's/\r$//' SHA256SUMS | sha256sum -c -)
while IFS= read -r file; do
  file=${file%$'\r'}
  [[ "$file" != *..* && -f "$bundle/$file" ]]
  case "$file" in server/*.js) "$node_bin" --check "$bundle/$file" ;; src/*.tsx|src/*.css) ;; *) exit 1 ;; esac
done < "$bundle/SOURCE-FILES.txt"
su -s /bin/bash mooncci -c 'pm2 jlist' | "$node_bin" -e '
let input=""; process.stdin.on("data",c=>input+=c).on("end",()=>{
  const processes=JSON.parse(input);
  if(!["mooncci-worker", "mooncci-api"].every(name=>processes.some(p=>p.name===name && p.pm2_env.pm_cwd==="/www/wwwroot/mooncci-source/server"))) {
    console.error("API 或 worker 运行目录不符，尚未修改源码。"); process.exitCode=1;
  }
});'
backup="/www/backup/mooncci-electricity-history-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
cp -p "$site_root/index.html" "$backup/index.html"
while IFS= read -r file; do
  file=${file%$'\r'}
  if [[ -f "$source_root/$file" ]]; then printf '%s\n' "$file"; fi
done < "$bundle/SOURCE-FILES.txt" > "$backup/existing-files.txt"
tar -czf "$backup/source.tar.gz" -C "$source_root" -T "$backup/existing-files.txt"
rollback() {
  trap - ERR
  echo "安装或 worker 重启失败，恢复源码备份：$backup" >&2
  tar -xzf "$backup/source.tar.gz" -C "$source_root"
  cp -p "$backup/index.html" "$site_root/index.html"
  su -s /bin/bash mooncci -c 'pm2 restart mooncci-api mooncci-worker --update-env' || true
  exit 1
}
trap rollback ERR
while IFS= read -r file; do
  file=${file%$'\r'}
  install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"
echo "源码已安装；回退备份：$backup"
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api mooncci-worker --update-env'
curl --retry 8 --retry-delay 1 --retry-connrefused --connect-timeout 3 --max-time 5 -fsS http://127.0.0.1:3001/api/health
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f -- "$site_root/index.html.next" "$site_root/index.html"
trap - ERR
echo '后台电量管理 v5 已发布：运行计划按行编辑，上方可手动同步学校历史。'
echo '自动历史同步仍仅在每日零点执行；无需数据库迁移。'
