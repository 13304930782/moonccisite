#!/usr/bin/env bash
# Run the bundled copy in a child bash, not by sourcing into an interactive SSH shell.
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
node_bin=/opt/mooncci-node-v24.20.0/bin/node
migration=server/database/migrations/202609070001_create_electricity_daily_usage.sql

if [[ ${EUID} -ne 0 ]]; then echo '请在服务器 root SSH 会话中用 bash 执行。'; exit 1; fi
if [[ ${1:-} != '' && ${1:-} != '--preview' ]]; then echo '参数只能为 --preview 或留空。'; exit 1; fi
[[ -x "$node_bin" && -f "$source_root/server/.env" && -d "$site_root" ]]
[[ -f "$source_root/server/src/lib/electricityReport.js" ]]
[[ -f "$bundle/SHA256SUMS" && -f "$bundle/SOURCE-FILES.txt" ]]
(cd "$bundle" && sed 's/\r$//' SHA256SUMS | sha256sum -c -)
while IFS= read -r file; do
  file=${file%$'\r'}
  [[ "$file" != /* && "$file" != *..* && "$file" != *'.env'* ]]
  [[ -f "$bundle/$file" ]]
  case "$file" in server/src/*.js) "$node_bin" --check "$bundle/$file" ;; esac
done < "$bundle/SOURCE-FILES.txt"

# Never overwrite a migration that may already have been applied.
if [[ -f "$source_root/$migration" ]]; then
  cmp -- "$bundle/$migration" "$source_root/$migration"
else
  install -D -o mooncci -g mooncci -m 644 "$bundle/$migration" "$source_root/$migration"
fi
su -s /bin/bash mooncci -c "cd '$source_root/server' && '$node_bin' scripts/migrate.js --dry-run"
if [[ ${1:-} == '--preview' ]]; then
  echo '迁移预览完成，尚未执行业务迁移、部署源码或重启进程。'; exit 0
fi

backup="/www/backup/mooncci-electricity-daily-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
while IFS= read -r file; do
  file=${file%$'\r'}
  if [[ -f "$source_root/$file" ]]; then printf '%s\n' "$file"; fi
done < "$bundle/SOURCE-FILES.txt" > "$backup/existing-files.txt"
tar -czf "$backup/source.tar.gz" -C "$source_root" -T "$backup/existing-files.txt"
cp -p -- "$site_root/index.html" "$backup/index.html"
echo "代码回退备份：$backup；数据库应已通过宝塔另行备份。"

su -s /bin/bash mooncci -c "cd '$source_root/server' && '$node_bin' scripts/migrate.js"
while IFS= read -r file; do
  file=${file%$'\r'}
  install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api mooncci-worker --update-env'
healthy=false
for attempt in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null; then healthy=true; break; fi
  sleep 2
done
if [[ "$healthy" != true ]]; then echo "健康检查失败，尚未替换前端；请检查 PM2 或从 $backup 回退。"; exit 1; fi
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f -- "$site_root/index.html.next" "$site_root/index.html"
su -s /bin/bash mooncci -c 'pm2 save'
echo '完整日用电与零点预测部署完成；请运行日明细检查脚本确认学校接口，数据将从下一个正常零点进入面板。'
