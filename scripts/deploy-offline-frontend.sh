#!/usr/bin/env bash
# Execute with bash/nohup. Never source this file into an interactive SSH shell.
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
web=${MOONCCI_WEB_ROOT:-/www/wwwroot/mooncci.site}
backup_root=${MOONCCI_BACKUP_ROOT:-/www/backup}
mkdir -p "$backup_root"
backup=$(mktemp -d "$backup_root/mooncci-offline.XXXXXX")
switched=0
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
finish() {
  rc=$?
  trap - EXIT
  set +e
  if [ "$rc" -ne 0 ] && [ "$switched" = 1 ]; then
    log '恢复原页面入口……'
    if cp -p "$backup/index.html" "$web/.index-rollback.tmp" && mv -f "$web/.index-rollback.tmp" "$web/index.html"; then
      log '原入口已恢复'
    else
      log "自动恢复失败，原入口保存在 $backup/index.html"
    fi
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  log "备份目录：$backup"
  log "部署退出码：$rc"
  exit "$rc"
}
trap finish EXIT
exec 9>"$backup_root/mooncci-deploy.lock"
log '等待部署锁，最多 120 秒……'
flock -w 120 9 || { log '其他部署仍在运行，本次未修改网站'; exit 1; }
log '校验包内文件……'
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/checksums.log"
test -s dist/index.html
test -s "$web/index.html"
revision=$(cat REVISION)
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
cp -p "$web/index.html" "$backup/index.html"
log '复制前端资源，保留旧哈希文件……'
rsync -a --exclude=index.html dist/ "$web/"
log '切换页面入口……'
install -m 644 dist/index.html "$web/.index-offline.tmp"
switched=1
mv -f "$web/.index-offline.tmp" "$web/index.html"
cmp dist/index.html "$web/index.html"
printf '%s\n' "$revision" > "$backup/deployed-commit.txt"
log "前端部署完成：$revision"
