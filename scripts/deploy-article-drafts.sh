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
umask 077
chmod 700 "$backup"
live=${MOONCCI_SERVER_ROOT:-/www/wwwroot/mooncci-source/server}
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
check_api() {
  local healthy=0
  for attempt in $(seq 1 30); do
    if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" &&
      node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok!==true)process.exit(1)' "$backup/health.json"; then
      healthy=1; break
    fi
    sleep 2
  done
  test "$healthy" = 1
}
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
    if tar -xpf "$backup/backend-before.tar" -C "$live" && pm restart mooncci-api && check_api; then
      log '原 API 已恢复并通过健康检查'
    else
      log "API 自动恢复失败，请检查进程；原文件保存在 $backup/backend-before.tar"
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
test -s "$live/.env"
test -s "$live/src/lib/googleIdentity.js"
test -s "$live/src/middleware/auth.js"
test -s "$live/src/lib/asyncRouter.js"
mapfile -t backend_files < BACKEND_FILES
for file in "${backend_files[@]}"; do
  [[ "$file" =~ ^(src/(index.js|routes/(articleDrafts|admin|posts).js)|database/migrations/202609110001_article_drafts.sql)$ ]]
  test -s "server/$file"
  if [[ "$file" == *.js ]]; then node --check "server/$file"; fi
  if [[ "$file" == *.sql ]] && [ -e "$live/$file" ]; then cmp "server/$file" "$live/$file"; fi
  if [ -e "$live/$file" ]; then printf '%s\n' "$file" >> "$backup/existing-files"; fi
done
tar -cpf "$backup/backend-before.tar" -C "$live" -T "$backup/existing-files"
log '只读检查已有第三方登录表，不执行迁移……'
node - "$live" <<'NODE'
const path = require('path');
const live = process.argv[2];
require(path.join(live, 'node_modules/dotenv')).config({path:path.join(live, '.env')});
const db = require(path.join(live, 'src/db'));
(async () => {try {
  for (const table of ['oauth_providers','oauth_states','oauth_identities','oauth_registrations']) await db.query(`SELECT * FROM ${table} LIMIT 0`);
} catch { console.error('Existing social login tables are required; no changes were made.'); process.exitCode=1; }
finally { await db.end(); }})();
NODE
log '仅应用新增文章草稿表，保留历史 SQL 校验记录……'
node server/scripts/migrate-article-drafts.js "$live"
log '更新文章 API，保留 Google CF 代理与环境配置……'
server_changed=1
for file in "${backend_files[@]}"; do
  install -d -o mooncci -g mooncci -m 755 "$(dirname "$live/$file")"
  install -o mooncci -g mooncci -m 644 "server/$file" "$live/$file"
done
sed -n 's|  server/|  |p' SHA256SUMS | grep -v '  scripts/migrate-article-drafts.js$' > "$backup/backend-checksums"
(cd "$live" && sha256sum --strict -c "$backup/backend-checksums") > "$backup/backend-verification.log"
pm restart mooncci-api
check_api
curl -fsS --connect-timeout 3 --max-time 10 http://127.0.0.1:3001/api/auth/providers > "$backup/providers.json"
node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(x.providers)||x.providers.some(p=>!(p.provider&&p.name)))process.exit(1)' "$backup/providers.json"
log '复制前端资源，保留旧哈希文件……'
rsync -ac --exclude=index.html dist/ "$web/"
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
log "文章草稿机制部署完成：$revision"
