#!/usr/bin/env bash
set -euo pipefail

# Run from the verified, extracted release directory on the old WordPress host.
release_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_file="$release_dir/moooncci-cn-article-redirects.conf"
target_file=/www/server/panel/vhost/nginx/extension/moooncci.cn/old-article-redirects.conf
nginx_bin=/www/server/nginx/sbin/nginx
expected_previous=0bd9283f4d7ba99ca8ed4bd6d91348801035d5248f8190c3f5b1296a7b3b33a4

exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9

cd "$release_dir"
sha256sum -c SHA256SUMS
printf '%s  %s\n' "$expected_previous" "$target_file" | sha256sum -c -
test -f /www/server/panel/vhost/nginx/extension/moooncci.cn/site_total.conf
printf '%s  %s\n' \
  f6164e48155f31e365773bea83a0433ddde83ce458a3fad4be21e3f74df1b282 /www/server/panel/vhost/nginx/moooncci.cn.conf \
  df4a8f75069d528667f3df28fa5b29021060abc6ead19a923636eac1fd97cc33 /www/server/panel/vhost/rewrite/moooncci.cn.conf \
  8edf8d8438a160611748ec9d29e6d8d4524f2607b29391c0ea5b4aa2e1a49d48 /www/server/panel/vhost/nginx/extension/moooncci.cn/site_total.conf \
  | sha256sum -c -

backup_file="$(mktemp /www/backup/moooncci-old-article-redirects.XXXXXX.conf)"
cp -p "$target_file" "$backup_file"
install -m 0644 "$source_file" "$target_file"
if ! "$nginx_bin" -t; then
  install -m 0644 "$backup_file" "$target_file"
  "$nginx_bin" -t
  echo 'Nginx syntax check failed; previous redirect file restored.' >&2
  exit 1
fi
if ! "$nginx_bin" -s reload; then
  install -m 0644 "$backup_file" "$target_file"
  "$nginx_bin" -t
  "$nginx_bin" -s reload
  echo 'Nginx reload failed; previous redirect file restored.' >&2
  exit 1
fi

echo 'PASS: old homepage and four article redirects installed; Nginx reloaded.'
echo "BACKUP_FILE=$backup_file"
echo "INSTALLED_FILE=$target_file"
