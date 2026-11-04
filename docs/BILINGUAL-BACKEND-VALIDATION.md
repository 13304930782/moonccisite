# Bilingual backend and browser verification

Executed locally on 2026-11-04. No production configuration, database, mail delivery, push, merge or deployment was used.

## Article persistence and compatibility

- `server/test/articleTranslations.integration.test.js`: **2 passed**, real isolated MySQL at `127.0.0.1:33089` using disposable `mooncci_qa_*` databases. Covers upgrade/rerun/checksum drift, one post identity, unpublished original reservation, private translation drafts, publication snapshots, search deduplication, author permission and author reassignment, locale-separated revisions, version conflict, review and scheduling, original changes, translation withdrawal, original withdrawal, current shared metadata, and rejected translated metadata overwrites.
- Existing draft, revision, conflict, bookmark, slug and publishing integration files: **15 passed, 0 skipped**. Draft/revision fixtures recreate the historical draft table intentionally; the current bilingual migration now runs afterward before current APIs are exercised. Original client requests omit `locale` and retain Chinese behavior.
- Full backend unit/default suite: **453 tests: 411 passed, 42 skipped, 0 failed**, rerun after the final translation completeness and localized fallback tests. The opt-in integrations above were separately enabled; do not count the default suite skips as passes. Logs: `.cache/bilingual-server-delivery-final.log`, `.cache/bilingual-legacy-integration-final.log`.
- Frontend draft save/summary harnesses: **12 passed** using the actual production Chinese translator and catalogs. Serialization, conflict retention, AI stale-result rejection and publish gating assertions are preserved.
- Note rendering/date/style tests: **3 passed**, including English relative dates with Beijing calendar boundaries.

## Actual browser checks

Microsoft Edge via Playwright, Vite on loopback, synthetic APIs, external requests blocked:

- `scripts/test-bilingual-editor-browser.cjs`: Chinese title/body remain in the same mounted editor across UI language changes; independent English editing and saves use the same article ID; 503 save failure preserves English input; UI language changes do not change editor language; switching back retains Chinese input; no cross-language payload writes or page errors.
- `scripts/test-bilingual-routes-browser.cjs`: **74 concrete routes × 2 states = 148 observations**. Routes are extracted from `RoutePages.tsx`, parameters replaced with QA IDs. The normal pass uses empty lists and valid synthetic detail/settings responses; the failure pass returns 503 from business APIs while keeping session and shared configuration available. It scans visible text and visible `aria-label`, `placeholder`, and `title` attributes. After fixture corrections all 148 observations had zero browser page errors. All 74 failure observations had zero untranslated Chinese. Three normal observations found remaining labels during concurrent fixes; the focused rerun below verified those fixes.
- Final focused rerun: **8/8 clean observations** across note detail, editor applications, festivals and account settings in normal and failure states. Zero Chinese fixed copy, zero page errors. A separate empty/whitespace note regression confirms the document-title observer no longer hangs. `NoteDetailPage` and `UpdatesPage` compare normalized title whitespace, matching the browser title getter.
- **28 screenshots** captured: about, about admin, user admin, account settings, login, Early Access and festivals at 1280/375 in light/dark themes. Additional final account/festival screenshots and DOM checks show no horizontal overflow at either width. Representative images were visually inspected: about desktop light, about admin mobile dark, login mobile dark, user admin desktop light and account settings mobile light. The first account header overflow was found and fixed; final DOM overflow checks passed.

Evidence directories: `.cache/bilingual-route-qa`, `.cache/bilingual-final-focused`, `.cache/bilingual-note-regression`.

Example focused rerun in PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:QA_ROUTES='/admin/festivals,/updates/1,/admin/editor-applications,/account/settings'
$env:QA_MODES='empty,failure'
$env:QA_OUTPUT='.cache/bilingual-final-focused'
$env:QA_STRICT='true'
node scripts/test-bilingual-routes-browser.cjs
```

## Scope and remaining verification

The route scan checks real rendered route code with synthetic data, not every business interaction, populated table, dialog or response combination. It does not substitute for a production smoke test or full end-to-end backend/browser integration. Email tests intercept SMTP; real delivery was not attempted. Real DeepSeek requests, live third-party sign-in, real mailboxes, Komari, electricity providers and physical touch devices were not exercised. Screenshots at 1920/1024/768 were not added by this backend verification task. History/BFCache and SSR verification are recorded separately by the main/delivery tasks.

Rollback must not put legacy write APIs over locale-bearing draft/revision data. Keep a compatible bilingual-aware backend, or place editorial writes into maintenance until compatible code is restored. Preserve translation tables and data; do not restore old unique indexes while multiple locale rows exist.

## Follow-up date and validation checks

Visible date/time rendering in admin, account, mail, publishing, media, node/electricity, newsletter and revision/conflict components now consumes the interface locale and keeps the Asia/Shanghai business time zone. Calendar arithmetic and numeric counters were not changed. The exported compatibility date helper still defaults to Chinese when called without a locale; rendered components use the locale-aware hook.

The populated operations task fixture exposed a translator variable shadowing bug hidden by empty lists. Renaming the task parameter fixed it; the actual populated scheduled-task browser check passed with zero page errors and zero Chinese fixed text. Evidence: `.cache/bilingual-operations-populated`.

Actual browser form validation passed: an invalid email produces `Enter a valid email address.` in English and `请输入有效的邮箱地址。` after switching the UI to Chinese, retaining the input `invalid-address`. Evidence: `.cache/bilingual-native-validation/validation.json`. Focused draft/summary/note tests after date changes: **15 passed**.

## Source-basis and third-party control follow-up

A third incremental migration adds `article_drafts.source_hash`. English drafts remember the original text they were based on, including before their first publication. Ordinary save and publication preserve that basis. Explicit review confirmation uses a top-level `reviewed_source_hash` on draft PUT and checks it against the locked current original; stale confirmations return 409. Publishing an older translation no longer silently marks it reviewed. Unknown historical restored bases remain marked for review. The real MySQL bilingual integration covers first-publication source changes and stale/current confirmation.

The latest backend default suite after this change: **452 tests, 410 passed, 42 skipped, 0 failed** (`.cache/bilingual-backend-sourcehash-tests.log`).

Unused scaffold controls (`ui/calendar`, `carousel`, `command`, `sidebar`, `pagination`) have no imports/re-exports in application source and were intentionally left unchanged; the `react-day-picker` wrapper is therefore not on a user-facing route. Actual rich-text toolbar controls were checked in Edge: the same editor content survives Chinese `加粗` to English `Bold` control-label switching. Reachable toolbar accessibility and image-upload validation fallbacks were localized. OS/browser-owned native calendar popups are outside application control.

Native validation ownership/lifecycle tests: **5 passed**, including a business custom error replacing a previously generated native error; locale change, input, reset and disposal preserve that business error.
