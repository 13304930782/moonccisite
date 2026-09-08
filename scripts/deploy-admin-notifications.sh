#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
node_bin=/opt/mooncci-node-v24.20.0/bin/node
[[ ${EUID} -eq 0 && -x "$node_bin" && -f "$source_root/server/src/routes/admin.js" && -f "$site_root/index.html" ]]
(cd "$bundle" && sha256sum -c SHA256SUMS)
while IFS= read -r file; do
  [[ "$file" != *..* && "$file" != /* && -f "$bundle/$file" ]]
  case "$file" in src/*|server/src/*) ;; *) exit 1 ;; esac
  case "$file" in server/src/*.js|server/src/*/*.js) "$node_bin" --check "$bundle/$file" ;; esac
done < "$bundle/SOURCE-FILES.txt"
su -s /bin/bash mooncci -c 'pm2 jlist' | "$node_bin" -e '
let s="";process.stdin.on("data",v=>s+=v).on("end",()=>{
const api=JSON.parse(s).find(p=>p.name==="mooncci-api");
if(api?.pm2_env?.pm_cwd!=="/www/wwwroot/mooncci-source/server"){console.error("API 运行目录不匹配，未部署。");process.exitCode=1;}
});'
backup="/www/backup/mooncci-admin-notifications-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
cp -p "$site_root/index.html" "$backup/index.html"
while IFS= read -r file; do
  if [[ -f "$source_root/$file" ]]; then printf '%s\n' "$file"; fi
done < "$bundle/SOURCE-FILES.txt" > "$backup/existing-files.txt"
tar -czf "$backup/source.tar.gz" -C "$source_root" -T "$backup/existing-files.txt"
rollback() {
  trap - ERR
  tar -xzf "$backup/source.tar.gz" -C "$source_root"
  cp -p "$backup/index.html" "$site_root/index.html"
  su -s /bin/bash mooncci -c 'pm2 restart mooncci-api --update-env' || true
  echo "部署失败，已恢复备份：$backup" >&2
  exit 1
}
trap rollback ERR
while IFS= read -r file; do
  install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"
su -s /bin/bash mooncci -c 'pm2 restart mooncci-api --update-env'
curl --retry 8 --retry-delay 1 --retry-connrefused --connect-timeout 3 --max-time 5 -fsS http://127.0.0.1:3001/api/health
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f "$site_root/index.html.next" "$site_root/index.html"
trap - ERR
echo "评论审核与权限通知部署完成；备份：$backup"
echo '无需数据库迁移、修改邮件配置或重启 worker。真实通知在下一次审核/权限变更时触发。'
