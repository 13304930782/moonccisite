#!/usr/bin/env bash
# Offline, reader-only update; run in a nohup child shell.
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
live=/opt/mooncci-reader/current/edge/reader/server.mjs
backup=$(mktemp -d /root/mooncci-reader-ssrf.XXXXXX)
changed=0
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
    cp -p "$backup/server.mjs" "$live"
    systemctl restart mooncci-reader
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  exit "$rc"
}
trap finish EXIT
cd "$package"
sha256sum --strict -c SHA256SUMS > "$backup/checksums.log"
node --check server.mjs
test -s "$live"
current=$(sha256sum "$live" | cut -d' ' -f1)
next=$(sha256sum server.mjs | cut -d' ' -f1)
if [ "$current" != 866408c3353b2bd0bc201df57331e7f5a64b4021a2f46da2810b7230bed120b3 ] && [ "$current" != "$next" ]; then
  echo 'Reader source drift; aborting' >&2
  exit 1
fi
cp -p "$live" "$backup/server.mjs"
changed=1
install -o root -g root -m 644 server.mjs "$live.new"
mv -f "$live.new" "$live"
systemctl restart mooncci-reader
systemctl is-active --quiet mooncci-reader
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3102/_reader/health)
test "$code" = 403
echo 'PASS: isolated reader updated; unauthenticated health remains forbidden.'
