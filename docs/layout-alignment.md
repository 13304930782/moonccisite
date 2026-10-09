# Public page alignment

Mode: Redesign · Preserve. Keep black/white themes, current fonts, homepage sections, routes, labels, navigation, API behavior and article body line length.

Observed: at a 1280px viewport the article list starts at x=40 while About starts at x≈252. Narrow reading pages, 920px detail groups and 440px auth forms independently center their outer containers. Home aligns text vertically against live note content; detail/list/home top padding differs.

Use one 1200px outer container, 40px desktop / 20px mobile gutters, 64px desktop / 32px mobile top spacing. Inner reading columns retain 760px maximum width and align to the outer start. Login and registration retain their centered 440px form layout, including the loading skeleton. Detail text stays 680px. Intro labels/breadcrumbs share a 24px line plus 16px gap; heading scale is 36px / 28px. These are mooncci defaults informed by Apple Layout consistency/alignment principles, not Apple-mandated pixel values.

Highest visual impact: formerly centered narrow pages now share the left content edge with navigation and lists. Homepage columns remain, with top alignment independent of the live note height. Public content pages use consistent geometry; account forms intentionally remain centered.

Protected contracts: no auth/API/mail/SEO/scroll-restoration changes. Detail metadata and back navigation are preserved. Existing native-rich-text reader must be retained in rollback; reverting this layout commit is safe because it changes presentation only.

Reference: https://developer.apple.com/design/human-interface-guidelines/layout
