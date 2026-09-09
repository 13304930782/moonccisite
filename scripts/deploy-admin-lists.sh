#!/usr/bin/env bash
# Execute with bash/nohup. Never source this file into an interactive SSH shell.
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
web=${MOONCCI_WEB_ROOT:-/www/wwwroot/mooncci.site}
backup_root=${MOONCCI_BACKUP_ROOT:-/www/backup}
mkdir -p "$backup_root"
backup=$(mktemp -d "$backup_root/mooncci-offline.XXXXXX")
switched=0
server_changed=0
live=/www/wwwroot/mooncci-source/server
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
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
  if [ "$rc" -ne 0 ] && [ "$server_changed" = 1 ]; then
    log '恢复原 API 文件……'
    cp -p "$backup/admin.js" "$live/src/routes/admin.js"
    pm restart mooncci-api
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
test -s "$live/src/lib/listPagination.js"
node --check server/src/routes/admin.js
cp -p "$live/src/routes/admin.js" "$backup/admin.js"
log '更新用户与评论 API……'
server_changed=1
install -o mooncci -g mooncci -m 644 server/src/routes/admin.js "$live/src/routes/admin.js"
pm restart mooncci-api
healthy=0
for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" &&
    node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then
    healthy=1; break
  fi
  sleep 2
done
test "$healthy" = 1
log '复制前端资源，保留旧哈希文件……'
rsync -a --exclude=index.html dist/ "$web/"
log '切换页面入口……'
install -m 644 dist/index.html "$web/.index-offline.tmp"
switched=1
mv -f "$web/.index-offline.tmp" "$web/index.html"
cmp dist/index.html "$web/index.html"
printf '%s\n' "$revision" > "$backup/deployed-commit.txt"
log "用户与评论管理部署完成：$revision"
