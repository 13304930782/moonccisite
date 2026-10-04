#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -e -- "${1:?Pass backup directory}")
case "$backup" in /www/backup/mooncci-site-diagnostics.*) ;; *) exit 1;; esac
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then
  exec 9>/www/backup/mooncci-deploy.lock
  flock -w 120 9
fi
python3 "$backup/site-diagnostics-files.py" restore "$backup"
scope=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["scope"])' "$backup/FILES.json")
if [ "$scope" = api ]; then
  api_id=$(cat "$backup/API_ID");[[ "$api_id" =~ ^[0-9]+$ ]]
  su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart $api_id"
else systemctl restart mooncci-reader;fi
echo 'Restored scoped source; environment and mailbox pools unchanged.'
