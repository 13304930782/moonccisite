#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
sha256sum --strict -c SHA256SUMS
test ! -e /etc/systemd/system/mooncci-sitemap.service
test ! -e /opt/mooncci-sitemap
backup=$(mktemp -d /www/backup/mooncci-sitemap.XXXXXX)
cp -p /www/wwwroot/mooncci.site/sitemap-pages.xml "$backup/sitemap-pages.xml"
cp -p /www/wwwroot/mooncci.site/sitemap-index.xml "$backup/sitemap-index.xml"
printf 'BACKUP=%s\n' "$backup"
rollback() {
  systemctl disable --now mooncci-sitemap.timer || true
  systemctl stop mooncci-sitemap.service || true
  cp -p "$backup/sitemap-pages.xml" /www/wwwroot/mooncci.site/sitemap-pages.xml
  cp -p "$backup/sitemap-index.xml" /www/wwwroot/mooncci.site/sitemap-index.xml
  rm -f /etc/systemd/system/mooncci-sitemap.service /etc/systemd/system/mooncci-sitemap.timer
  rm -f /opt/mooncci-sitemap/refresh-sitemap.py
  rmdir /opt/mooncci-sitemap || true
  systemctl daemon-reload
}
trap 'rollback' ERR
install -d -m 755 /opt/mooncci-sitemap
install -m 644 refresh-sitemap.py /opt/mooncci-sitemap/refresh-sitemap.py
install -m 644 mooncci-sitemap.service mooncci-sitemap.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start mooncci-sitemap.service
install -m 644 sitemap-index.xml /www/wwwroot/mooncci.site/sitemap-index.xml
systemctl enable --now mooncci-sitemap.timer
systemctl is-active mooncci-sitemap.timer
curl -fsS https://mooncci.site/sitemap-pages.xml > "$backup/verified.xml"
python3 - "$backup/verified.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot()
assert len(root)>4, 'Expected complete public content'
print('Verified URLs:',len(root))
PY
printf 'EXIT_CODE=0\n'
