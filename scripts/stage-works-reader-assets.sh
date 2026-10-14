#!/usr/bin/env bash
# Prepare missing hashed reader assets before main SSR changes, in a nohup child shell.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then printf 'Run in a child shell.\n' >&2; return 2; fi
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$package"
node=$(python3 -c 'import json; print(json.load(open("BASELINE.json"))["reader"]["node"])')
case "$node" in /usr/bin/node|/opt/mooncci-node-v24.20.0/bin/node) ;; *) exit 2 ;; esac
web=$(readlink -f /opt/mooncci-reader/current/dist)
case "$web" in /opt/mooncci-reader/releases/*/dist) ;; *) exit 2 ;; esac
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
"$node" verify.cjs prestage "$package" /www/wwwroot/mooncci-source/server "$web" before
rsync -ac --ignore-existing "$package/dist/assets/" "$web/assets/"
"$node" verify.cjs prestage "$package" /www/wwwroot/mooncci-source/server "$web" after
printf 'PASS: missing hashed reader assets prepared; entry and existing assets untouched.\n'
