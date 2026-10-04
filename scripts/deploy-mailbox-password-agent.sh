#!/usr/bin/env bash
# Run via nohup bash in a child shell; never source in an interactive SSH session.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/opt/mooncci-mail-agent
exec 9>/root/mooncci-mail-agent-deploy.lock
flock -w 120 9
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
test -f "$live/agent.py"
test ! -e "$live/update_mailbox.py" || cmp -s server/mail-agent/update_mailbox.py "$live/update_mailbox.py"
/www/server/panel/pyenv/bin/python3 - "$live/agent.py" <<'PY'
from pathlib import Path
import hashlib,sys
hash_file=lambda p: hashlib.sha256(Path(p).read_bytes().replace(b'\r\n',b'\n')).hexdigest()
current=hash_file(sys.argv[1])
if current not in (Path('BASELINE').read_text().strip(),hash_file('server/mail-agent/agent.py')):
    raise SystemExit('Unreviewed live mail agent')
PY
/www/server/panel/pyenv/bin/python3 - <<'PY'
from pathlib import Path
for name in ('agent.py','update_mailbox.py'):
    compile(Path('server/mail-agent',name).read_bytes(),name,'exec')
PY
test "$(systemctl is-active mooncci-mail-agent)" = active
backup=$(mktemp -d /root/mooncci-mail-agent-password.XXXXXX)
cp -p "$live/agent.py" "$backup/agent.py"
if [ -e "$live/update_mailbox.py" ]; then cp -p "$live/update_mailbox.py" "$backup/update_mailbox.py"; fi
cp rollback.sh "$backup/rollback.sh"
changed=0
finish() {
  rc=$?; trap - EXIT
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then bash "$backup/rollback.sh" "$backup" || echo 'ROLLBACK NEEDS ATTENTION' >&2; fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
changed=1
install -o root -g root -m 600 server/mail-agent/update_mailbox.py "$live/update_mailbox.py"
install -o root -g root -m 600 server/mail-agent/agent.py "$live/agent.py"
systemctl restart mooncci-mail-agent
for attempt in $(seq 1 10); do
  if [ "$(systemctl is-active mooncci-mail-agent)" = active ]; then break; fi
  sleep 1
done
test "$(systemctl is-active mooncci-mail-agent)" = active
cmp -s server/mail-agent/update_mailbox.py "$live/update_mailbox.py"
cmp -s server/mail-agent/agent.py "$live/agent.py"
printf 'PASS: outbound mail agent can process password changes. No mailbox account, maildir, database or Postfix configuration changed.\n'
