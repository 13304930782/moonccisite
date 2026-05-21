#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/www/wwwroot/mooncci-source"
SITE_ROOT="/www/wwwroot/mooncci.site"
SETTINGS_TMP="/tmp/mooncci-site-settings.json"

cd "$PROJECT_ROOT"

echo "1/4 拉取线上站点设置..."
curl -fsS "https://mooncci.site/api/settings/site" -o "$SETTINGS_TMP"

echo "2/4 生成 src/app/config/initialSiteSettings.ts..."
mkdir -p src/app/config
node - <<'NODE'
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/tmp/mooncci-site-settings.json', 'utf8'));
const content = `export const initialSiteSettings = ${JSON.stringify(data, null, 2)} as const;\n`;

fs.writeFileSync('src/app/config/initialSiteSettings.ts', content);
NODE

echo "3/4 打包前端..."
npm run build

echo "4/4 部署 dist 到站点目录..."
cp "$SITE_ROOT/index.html" "$SITE_ROOT/index.html.bak_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
mkdir -p "$SITE_ROOT/assets"
/bin/cp -f dist/index.html "$SITE_ROOT/index.html"
/bin/cp -af dist/assets/. "$SITE_ROOT/assets/"

echo "完成：首屏配置已更新，前端已重新部署。无需重启 PM2。"
