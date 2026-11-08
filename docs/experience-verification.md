# Experience fixes verification

Baseline: `9c9dbb9478af8ad138f5d941c9de155dedcf7188` (`codex/full-site-bilingual`, PR #119). Site checks 41868757356 and CodeQL 41868757290 passed on that commit. No deployment is part of this work.

## 1. Updates filters

- Retains completed results with explicit category/status; isolates pagination by language and type; rejects cancelled/version-invalid backfills; retains existing resource cancellation/generation checks.
- Removed feed remount/entrance animation. Empty results replace stale content; pending filter disables load-more.
- `npm run typecheck`: passed.
- `node --test test/updates-v2-page.test.cjs test/updates-v2-scope.test.cjs`: 16 passed.
- `npm run build`: passed.
- `node scripts/test-experience-fixes-browser.cjs`: passed against local Vite and isolated API fixtures: delayed/late responses, retained category, failure/retry, empty category, keyboard focus, pagination, detail/back and scroll restoration.
- Browser: Chromium 153 from temporary @sparticuz/chromium installation (not a project dependency); Playwright's Chromium 145 CDN returned an HTML error instead of a ZIP. Run with `BROWSER_EXECUTABLE` when using a separately installed browser.
