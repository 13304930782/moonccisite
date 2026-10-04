#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -e -- "${1:?Pass backup directory}")
case "$backup" in /www/backup/mooncci-mailbox-password.*) ;; *) exit 1 ;; esac
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then
  exec 9>/www/backup/mooncci-deploy.lock
  flock -w 120 9
fi
api_id=$(cat "$backup/API_ID")
[[ "$api_id" =~ ^[0-9]+$ ]]
install -o mooncci -g mooncci -m 644 "$backup/mailboxes.js" /www/wwwroot/mooncci-source/server/src/routes/mailboxes.js
su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart $api_id"
for attempt in $(seq 1 15); do
  if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health >/dev/null; then echo 'PASS: previous mailbox API restored. Additive table retained.'; exit 0; fi
  sleep 2
done
exit 1
