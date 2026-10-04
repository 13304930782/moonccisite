#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -e -- "${1:?Pass backup directory}")
case "$backup" in /root/mooncci-mail-agent-password.*) ;; *) exit 1 ;; esac
install -o root -g root -m 600 "$backup/agent.py" /opt/mooncci-mail-agent/agent.py
if [ -f "$backup/update_mailbox.py" ]; then
  install -o root -g root -m 600 "$backup/update_mailbox.py" /opt/mooncci-mail-agent/update_mailbox.py
else
  rm -f /opt/mooncci-mail-agent/update_mailbox.py
fi
systemctl restart mooncci-mail-agent
test "$(systemctl is-active mooncci-mail-agent)" = active
printf 'PASS: previous mail agent restored.\n'
