#!/usr/bin/env bash
set -u

BASE_URL="${BASE_URL:-https://mooncci.site}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR" || exit 1

section() {
  printf '\n== %s ==\n' "$1"
}

run() {
  printf '\n$ %s\n' "$*"
  "$@" || true
}

section "Runtime"
run pwd
run node -v

section "Public health and security headers"
curl -sI "$BASE_URL/api/health" \
  | grep -Ei 'HTTP/|content-type|cache-control|strict-transport-security|x-frame-options|x-content-type-options|content-security-policy|access-control|cf-cache-status' \
  || true

section "API write-source protection"
printf 'POST /api/auth/logout without X-Requested-With should be 403:\n'
curl -s -o /tmp/mooncci-review-logout.body -w '%{http_code}\n' \
  -X POST "$BASE_URL/api/auth/logout" || true
rm -f /tmp/mooncci-review-logout.body

section "Upload hardening code check"
grep -RIn \
  'image/svg|allowedTypes|allowedExts|hasAllowedMagicNumber|file-type|sharp|quality|Invalid image file content' \
  server/src/routes/upload.js server/package.json 2>/dev/null || true

section "Abnormal upload extensions"
find server/uploads -type f \
  ! -iname '*.jpg' ! -iname '*.jpeg' ! -iname '*.png' \
  ! -iname '*.gif' ! -iname '*.webp' ! -iname '*.ico' \
  -print 2>/dev/null || true

section "Markdown and safe URL code check"
grep -RIn \
  'dangerouslySetInnerHTML|safeHref|safeImageSrc|javascript:|vbscript:|data:' \
  src/app/components/MarkdownContent.tsx src/app/lib/safeUrl.ts 2>/dev/null || true

section "Comment permission code check"
grep -RIn \
  'authRequired|can_comment|parent_id|reply_to_user_id|status != .deleted.|pending|rejected|comment_likes|uniq_comment_user|maskIp|ip_address' \
  server/src/routes/comments.js server/src/routes/admin.js server/database/schema.sql 2>/dev/null || true

section "Mail permission code check"
grep -RIn \
  'send-custom|smtp|SMTP_|adminOnly|owner|mail|nodemailer|custom_mail_logs' \
  server/src/routes/settings.js server/src/lib/mailer.js server/database/schema.sql 2>/dev/null || true

section "Secret pattern scan, excluding real env and generated folders"
grep -RIn \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=uploads \
  --exclude='package-lock.json' \
  --exclude='.env' \
  -E 'JWT_SECRET=|DB_PASSWORD=|SMTP_PASS=|SMTP_PASSWORD=|mysql://|mooncci_token=|Bearer [A-Za-z0-9._-]+' \
  . 2>/dev/null || true

section "PM2 status"
if id mooncci >/dev/null 2>&1; then
  su -s /bin/bash mooncci -c "pm2 status" || true
elif command -v pm2 >/dev/null 2>&1; then
  pm2 status || true
else
  echo "pm2 not found in current shell"
fi

section "Done"
echo "Review complete. Investigate any unexpected output above."
