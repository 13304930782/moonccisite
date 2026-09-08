#!/usr/bin/env bash
set -euo pipefail
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node_bin=/opt/mooncci-node-v24.20.0/bin/node
[[ ${EUID} -eq 0 && -x "$node_bin" && -f /www/wwwroot/mooncci-source/server/.env ]]
read -r -s -p '请粘贴高德 Web 服务 Key（输入不显示），然后按回车：' amap_key
printf '\n'
MOONCCI_NEW_AMAP_KEY="$amap_key" "$node_bin" "$bundle/configure-weather-amap.cjs"
unset amap_key
