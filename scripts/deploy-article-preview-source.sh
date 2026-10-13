#!/usr/bin/env bash
# Explicitly requested source-on-server build. Always run as a nohup child shell.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 2; fi
set -Eeuo pipefail
mode=${1:-main}
case "$mode" in main|reader) ;; *) echo 'Use main or reader'; exit 2 ;; esac
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
case "$root" in /www/wwwroot/mooncci-source|/www/wwwroot/mooncci.site|/opt/mooncci-reader/current*) echo 'Build from an isolated clone, not live paths'; exit 2 ;; esac
cd "$root"
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
export NODE_OPTIONS=--max-old-space-size=768
for tool in git node npm python3; do command -v "$tool" >/dev/null; done
test "$(node -p 'process.versions.node.split(".")[0]')" = 24
revision=$(git rev-parse HEAD)
test -z "$(git status --porcelain)"
available=$(awk '/MemAvailable:|SwapFree:/ {sum+=$2} END {printf "%.0f",sum/1024}' /proc/meminfo)
if [ "$available" -lt 1024 ]; then echo "Not enough free RAM + swap to build safely: ${available} MiB (need 1024 MiB). No production files changed."; exit 2; fi
printf 'SOURCE=%s\nTARGET=%s\nBUILD_STARTED\n' "$revision" "$mode"
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
if [ "$mode" = main ]; then
 mkdir -p .cache/preview-ssr-deps
 cp scripts/document-runtime/package.json scripts/document-runtime/package-lock.json .cache/preview-ssr-deps/
 npm ci --prefix .cache/preview-ssr-deps --omit=dev --ignore-scripts --no-audit --no-fund
fi
test "$(git rev-parse HEAD)" = "$revision"
test -z "$(git status --porcelain)"
stage=$(python3 scripts/article-preview/prepare.py --target "$mode")
printf 'CHECKED_BUILD=%s\n' "$stage"
# Do not let the build-only V8 budget affect PM2's existing processes.
unset NODE_OPTIONS
bash "$stage/deploy.sh"
