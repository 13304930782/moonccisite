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

## 2. Article loading and prefetch

- Added the same article-shaped fallback for route-code and article-data loading; unknown covers have no speculative image placeholder.
- Existing pointer/focus/touch preload now fetches anonymous article data. Only published responses are cached; id/slug aliases and locale are preserved. In-flight limits, generation invalidation, silent failure and regular-click retry are tested. English route chunk matching now strips its locale prefix.
- Typecheck passed; article-preload + updates tests: 17 passed; article-preload + homepage scope checks: 8 passed. Full suite initially 414/415: only the intentionally changed ContentUI baseline fingerprint differed; its pin was updated for the reviewed loading/cache changes.
- Browser fixture passed cold/no-cover loading, pending prefetch coalescing (one request), warm-cache navigation (no extra request), and silent prefetch failure followed by successful navigation.

## 3. Measured motion fixes

Before changes, sampled POP frames on updates page 2: opacity 1 / animation none, scrollY 716 → 1427 → 1325. Pagination button text rect before/during press was identical (33.609375 × 17, transform/scale none). Thus no reproduced fade or text-scale defect on those controls; DiagnosticNavigation remains unchanged.

The site reduced-motion setting did reproduce one running WAAPI filter-marker animation; the system setting already suppressed it. Now both suppress it, and live site-preference changes cancel it. Month navigation also honors the same preference.

Restoring cached backfill pages synchronously removes the large intermediate list-height jump: measured 1281 → 1325 → 1325 (remaining 44px return-control insertion is covered by the next navigation-interface change). Removed the impossible nested-html selector rather than enabling another content fade.

Typecheck passed; updates/scope/motion tests: 17 passed. Browser repeated the same path and button measurements, and reported 0 running animations under site reduced motion; system reduced motion passed too.
