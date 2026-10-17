# Note detail and bundle release

Base: 854189d; production frontend c8fe840. This release does not include the separate interaction/motion development branch.

- Dedicated note detail layout, theme-variable muted surfaces, related notes and an optional note-only comment variant. Default article and compact-list comments retain their baseline DOM.
- Region labels omit the China prefix only in note comments; source data stays unchanged.
- Related notes use the existing SSR-approved activity endpoint. Relative dates use the same Shanghai timezone as the existing date formatter.
- Run the existing production router resolver before Vite resolution, and merge shared chunks below 10,000 bytes while retaining lazy routes/editor loading.
- Update the reading browser regression to navigate via the existing article header link instead of a removed legacy breadcrumb; retain its speech cancellation and remaining assertions.

## Validation

239 frontend tests, typecheck and build passed. Reading browser regression passed. Independent Chrome checks covered home, article list/detail, note, electricity and the lazy rich-text editor; no failed JS requests or initialization errors. Real SSR plus Chrome hydration passed in Shanghai and Los Angeles timezones at 390px. Editor dependencies were absent from the checked public routes. Isolated release/rollback tests passed (8).

| Measurement | Before chunk changes | Final | Budget |
| --- | ---: | ---: | ---: |
| Initial JS | 295620 | 307918 | 320000 |
| Initial JS gzip | 96701 | 100491 | 105000 |
| Total JS | 2238575 | 2233341 | 2225000 |
| Total JS gzip | 752801 | 742357 | 750000 |
| Largest JS chunk | 295620 | 307918 | 450000 |

Total raw JS remains 8,341 bytes over budget (production baseline was 7,439 over). The user explicitly accepted this existing failure for this release. `check:bundle` remains failing for totalJsBytes; budgets and CI are unchanged. Gzip numbers are locally computed compressed sizes, not measured network traffic.

Previous note-page screenshot validation retained known subpixel raster differences rather than claiming all outside-page comparisons were exact. No real-device Safari acceptance was performed. Initial SSR SEO retains the existing content-based title; the client applies the requested shorter note title. No backend SEO logic was changed.

## Deployment scope

Verified offline payload: dist plus generated SSR entry/styles/chunks. Preserve existing assets, runtime directory, runtime dependencies and worker state. Reload only mooncci-api after switching the generated renderer. No database, backend source, environment, Nginx, overseas relay/login, worker or mail changes. Local fixtures, recordings and credentials stay in ignored .cache and are not packaged.
