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

## 4. Return and heading interfaces

- SiteBack accepts explicit destinations (normal Link behavior), history return with safe fallback, children and visual variants. Direct article loads return to the article list; admin/account are supported. Modifier clicks remain native.
- DetailUI and resource-error list links use fixed SiteBack destinations. Account's return-to-site control and admin user settings use the common interface. PageHeading now supports optional eyebrow/back/actions and page/admin styling; articles, updates and admin overview use it.
- Typecheck passed. SiteBack/history/updates/homepage scope tests: 31 passed.
- Browser passed direct article fallback navigation, single h1, and previous regression flows. POP samples after the return control always occupies its space: scrollY 1369 → 1369 → 1369, opacity 1 and animation none. The prior remaining 44px insertion is eliminated on this tested path.

## 5. Admin consolidation

- Replaced menus plus group.paths with a single ordered grouped configuration, preserving role/feature visibility. Kept real overview statistics and three frequent actions; no new todo endpoints.
- AdminButton maps its variants to ui-btn internally; removed duplicate page classes. Editor return links now use SiteBack with fixed admin/account list destinations and retain draft-leave protection.
- Full typecheck/unit suite: 418 passed. Admin workspace: five widths, both themes, owner/admin/editor/user and feature gates passed. Article management: six viewport/theme combinations, import/delete-cancel/focus/empty states passed. Writing: all 19 scenarios passed (save, restore, publish, failures, mobile dialogs, role locks and return cancellation).
- Updated stale browser assertions for translated toolbar labels, the existing 100-character slug limit, locale preference synchronization and link semantics; external status badge is fixture-isolated. The malformed-length request test still verifies failure preservation and retry.
