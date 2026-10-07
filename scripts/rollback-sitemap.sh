#!/usr/bin/env bash
set -Eeuo pipefail
backup=${1:?Pass the backup directory printed by deploy.sh}
case "$backup" in /www/backup/mooncci-sitemap.*) ;; *) exit 2;; esac
test -s "$backup/sitemap-pages.xml"
test -s "$backup/sitemap-index.xml"
systemctl disable --now mooncci-sitemap.timer
systemctl stop mooncci-sitemap.service
cp -p "$backup/sitemap-pages.xml" /www/wwwroot/mooncci.site/sitemap-pages.xml
cp -p "$backup/sitemap-index.xml" /www/wwwroot/mooncci.site/sitemap-index.xml
rm -f /etc/systemd/system/mooncci-sitemap.service /etc/systemd/system/mooncci-sitemap.timer /opt/mooncci-sitemap/refresh-sitemap.py
rmdir /opt/mooncci-sitemap
systemctl daemon-reload
