#!/usr/bin/env bash
# Execute with bash/nohup. Never source this file into an interactive SSH shell.
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
web=${MOONCCI_WEB_ROOT:-/www/wwwroot/mooncci.site}
backup_root=${MOONCCI_BACKUP_ROOT:-/www/backup}
runtime=${MOONCCI_PRESENTATION_ROOT:-/www/wwwroot/mooncci-source/server/runtime}
mkdir -p "$backup_root"
backup=$(mktemp -d "$backup_root/mooncci-offline.XXXXXX")
switched=0
presentation_changed=0
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
finish() {
  rc=$?
  trap - EXIT
  set +e
  if [ "$rc" -ne 0 ] && [ "$presentation_changed" = 1 ]; then
    for file in styles.json home.css; do
      if cp -p "$backup/presentation/$file" "$runtime/.$file-rollback.tmp" && mv -f "$runtime/.$file-rollback.tmp" "$runtime/$file"; then
        log "已恢复展示资源：$file"
      else
        log "展示资源恢复失败：$backup/presentation/$file"
      fi
    done
  fi
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
if [ -e presentation ] || [ -L presentation ]; then
  [[ -d presentation && ! -L presentation ]]
  [[ -d "$runtime" && ! -L "$runtime" ]]
  # These two files are read per request; never replace cached renderer code here.
  test -z "$(find presentation -mindepth 1 -maxdepth 1 ! -name styles.json ! -name home.css -print)"
  mkdir "$backup/presentation"
  for file in styles.json home.css; do
    [[ -f "presentation/$file" && -s "presentation/$file" && ! -L "presentation/$file" ]]
    [[ -f "$runtime/$file" && -s "$runtime/$file" && ! -L "$runtime/$file" ]]
    [[ ! -e "$runtime/.$file-offline.tmp" && ! -L "$runtime/.$file-offline.tmp" ]]
    [[ ! -e "$runtime/.$file-rollback.tmp" && ! -L "$runtime/.$file-rollback.tmp" ]]
    grep -Eq "^[0-9a-f]{64}  presentation/${file//./\\.}$" SHA256SUMS
    cp -p "$runtime/$file" "$backup/presentation/$file"
  done
fi
log '复制前端资源，保留旧哈希文件……'
rsync -ac --exclude=index.html dist/ "$web/"
if [ -d presentation ]; then
  presentation_changed=1
  for file in home.css styles.json; do
    cp -p "$runtime/$file" "$runtime/.$file-offline.tmp"
    cat "presentation/$file" > "$runtime/.$file-offline.tmp"
    mv -f "$runtime/.$file-offline.tmp" "$runtime/$file"
  done
  sed -n 's|  presentation/|  |p' SHA256SUMS > "$backup/presentation-checksums"
  (cd "$runtime" && LC_ALL=C sha256sum --strict -c "$backup/presentation-checksums") > "$backup/presentation-verification.log"
fi
log '切换页面入口……'
install -m 644 dist/index.html "$web/.index-offline.tmp"
switched=1
mv -f "$web/.index-offline.tmp" "$web/index.html"
log '核对已部署的全部前端文件……'
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/frontend-checksums"
test -s "$backup/frontend-checksums"
if ! (cd "$web" && LC_ALL=C sha256sum --strict -c "$backup/frontend-checksums") > "$backup/frontend-verification.log"; then
  log '以下部署文件校验失败：'
  grep -v ': OK$' "$backup/frontend-verification.log" >&2 || true
  exit 1
fi
printf '%s\n' "$revision" > "$backup/deployed-commit.txt"
log "前端部署完成：$revision"
