#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-.}"

cd "$ROOT_DIR" || exit 1

if [ ! -e "$TARGET" ]; then
  echo "Target not found: $TARGET"
  exit 2
fi

echo "== Public document safety scan =="
echo "Target: $TARGET"
echo

PATTERN='(/www/wwwroot/|/root/|/home/[A-Za-z0-9._-]+|C:\\Users\\|E:/|127\.0\.0\.1:[0-9]+|localhost:[0-9]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|([0-9]{1,3}\.){3}[0-9]{1,3}|JWT_SECRET|DB_PASSWORD|SMTP_PASS|SMTP_PASSWORD|mooncci_token|Bearer [A-Za-z0-9._-]+|password[[:space:]]*=|secret[[:space:]]*=|token[[:space:]]*=|pm2|nginx\.conf|ecosystem\.config)'

if [ -f "$TARGET" ]; then
  grep -nEI "$PATTERN" "$TARGET" || true
else
  find "$TARGET" -type f \
    \( -iname '*.md' -o -iname '*.txt' -o -iname '*.html' -o -iname '*.json' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/.git/*' \
    ! -path '*/dist/*' \
    ! -path '*/uploads/*' \
    -print0 \
    | xargs -0 grep -nEI "$PATTERN" 2>/dev/null || true
fi

echo
echo "If there is no output above, no obvious sensitive deployment detail was found."
echo "Before publishing, still manually check screenshots and code blocks."
