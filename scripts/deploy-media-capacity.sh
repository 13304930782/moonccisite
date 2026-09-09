#!/usr/bin/env bash
# Run in a child shell/nohup, never source into an interactive SSH shell.
set -Eeuo pipefail
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
export GIT_TERMINAL_PROMPT=0
rev=${1:?Pass the verified full Git commit SHA}
[[ "$rev" =~ ^[0-9a-f]{40}$ ]] || exit 2
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -n 9 || { echo '已有部署正在运行'; exit 1; }
live=/www/wwwroot/mooncci-source/server
web=/www/wwwroot/mooncci.site
stage=$(mktemp -d /www/wwwroot/.mooncci-capacity.XXXXXX)
backup=$(mktemp -d /www/backup/mooncci-capacity.XXXXXX)
changed=0
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
finish() {
  rc=$?
  trap - EXIT
  set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    echo '部署失败，恢复原 API 文件和前端入口……'
    tar -xzf "$backup/routes.tar.gz" -C "$live"
    cp -p "$backup/index.html" "$web/index.html"
    pm restart mooncci-api
  fi
  echo "备份目录：$backup"
  echo "暂存目录：$stage"
  echo "部署退出码：$rc"
  exit "$rc"
}
trap finish EXIT
test -s "$live/.env"
test -d "$live/node_modules"
test -s "$web/index.html"
chmod 755 "$stage"
git init -q "$stage/repo"
git -C "$stage/repo" remote add origin https://github.com/13304930782/moonccisite.git
git -C "$stage/repo" fetch --depth=1 origin "$rev"
git -C "$stage/repo" checkout --detach FETCH_HEAD
test "$(git -C "$stage/repo" rev-parse HEAD)" = "$rev"
chown -R mooncci:mooncci "$stage/repo"
echo '构建前端，线上服务继续运行……'
su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; cd '$stage/repo' && npm ci --include=dev && npm run build"
test -s "$stage/repo/dist/index.html"
for file in src/lib/mediaSync.js src/lib/listPagination.js src/routes/admin.js src/routes/upload.js; do
  node --check "$stage/repo/server/$file"
done
tar -czf "$backup/routes.tar.gz" -C "$live" src/routes/admin.js src/routes/upload.js
cp -p "$web/index.html" "$backup/index.html"
changed=1
for file in src/lib/mediaSync.js src/lib/listPagination.js src/routes/admin.js src/routes/upload.js; do
  install -o mooncci -g mooncci -m 644 "$stage/repo/server/$file" "$live/$file"
done
pm restart mooncci-api
healthy=0
for attempt in $(seq 1 30); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health > "$backup/health.json" &&
    node -e 'if (JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).ok !== true) process.exit(1)' "$backup/health.json"; then
    healthy=1; break
  fi
  sleep 2
done
test "$healthy" = 1
# New backend also serves the old array contract, so existing tabs remain usable.
rsync -a --exclude=index.html "$stage/repo/dist/" "$web/"
install -m 644 "$stage/repo/dist/index.html" "$web/.index-capacity.tmp"
mv -f "$web/.index-capacity.tmp" "$web/index.html"
sleep 5
curl -fsS --connect-timeout 3 --max-time 5 http://127.0.0.1:3001/api/health
pm status
printf '%s\n' "$rev" > "$backup/deployed-commit.txt"
echo
echo "部署完成：$rev"
