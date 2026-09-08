#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source_root=/www/wwwroot/mooncci-source
site_root=/www/wwwroot/mooncci.site
[[ ${EUID} -eq 0 && -d "$source_root/src" && -f "$site_root/index.html" ]]
(cd "$bundle" && sed 's/\r$//' SHA256SUMS | sha256sum -c -)
while IFS= read -r file; do
  file=${file%$'\r'}
  [[ "$file" == src/* && "$file" != *..* && -f "$bundle/$file" ]]
done < "$bundle/SOURCE-FILES.txt"

backup="/www/backup/mooncci-electricity-layout-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
cp -p -- "$site_root/index.html" "$backup/index.html"
while IFS= read -r file; do
  file=${file%$'\r'}
  if [[ -f "$source_root/$file" ]]; then printf '%s\n' "$file"; fi
done < "$bundle/SOURCE-FILES.txt" > "$backup/existing-files.txt"
tar -czf "$backup/source.tar.gz" -C "$source_root" -T "$backup/existing-files.txt"
while IFS= read -r file; do
  file=${file%$'\r'}
  install -D -o mooncci -g mooncci -m 644 "$bundle/$file" "$source_root/$file"
done < "$bundle/SOURCE-FILES.txt"

# Keep older assets for existing sessions and rollback; switch HTML after new assets exist.
rsync -a --chmod=D755,F644 --exclude=index.html "$bundle/dist/" "$site_root/"
install -m 644 "$bundle/dist/index.html" "$site_root/index.html.next"
mv -f -- "$site_root/index.html.next" "$site_root/index.html"
echo "前端修复部署完成；回退备份：$backup"
echo '无需数据库迁移或 PM2 重启。请刷新电量页面检查新布局。'
