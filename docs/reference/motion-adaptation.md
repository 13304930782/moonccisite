# Motion adaptation, preserving mooncci

Baseline: `7816be3` (second round). Reference pinned to
[`02d021f`](https://github.com/Caho1/open-claude-ui/tree/02d021fceaf2a907f9e63a8125621bdda1b85d60).
MIT notice is retained in `open-claude-ui.LICENSE`. No reference theme, assets,
desktop bundle or dependency was imported. Research files, raw recordings and
per-frame observations live in ignored `.cache/motion-design/reference`.

The five requested source files and `CdsButton.tsx` were actually run in an
isolated harness using the installed React/motion versions. Runtime observations
are separate from static risks and from the deliberately modified drag diagnostic.

| Family | Reference movement | mooncci adaptation and actual callers |
| --- | --- | --- |
| Press/release | CdsButton holds .98 and restores with the same 150ms CSS ease. The bouncy spring is a separate preset, not wired to this button. | `controlMotion` captures current scale, compresses during the held gesture and springs on release. Existing button/icon/control classes across public, account, writing, media and mail use the same delegated mechanism. State labels reserve their width and loaders occupy the existing icon slot. |
| Selection/results | SegmentedControl moves one layoutId background with spring500/35; labels stay fixed. | `useMovingIndicator` moves one marker with current x/y/size/velocity. Existing variable widths and mobile wrapping remain. ThemeSelect, update/comment sorting, posts/media states reuse it. Update entries and PostResults present only added/changed content; existing row keys and request logic remain. |
| Surfaces | Presets use a .95/y4 popover spring, .96/y10 modal spring, and distinct 120/150ms exits. | `surfaceMotion` derives actual Radix collision origin or trigger direction, and respects explicit drawer sides. Transform uses a restrained spring, alpha a short ease. Dialogs, menus, raw image pickers/framing, reading settings and mobile navigation share it. Inert visual exits retain no modal locks and can be interrupted. |
| Disclosure | ThinkingAccordion coordinates height/alpha/180° arrow over200ms without scaling text. | `MotionDisclosure` coordinates intrinsic height, short alpha, arrow and neighbour movement. Settled parents follow a moving child without a second trailing spring. Actual update discussions, comment/reply expansion and mobile article directory use it. Native project/version/details use progressive intrinsic-size CSS; unsupported browsers snap with semantics intact. |
| Images | Shared hook uses document View Transitions. Media viewer uses anchored zoom, direct writes and a sliding multi-image runway. | `imagePresentation` animates only an inert image clone between measured rectangles/radius/crop. The real stage remains stable. Anchor zoom and direct drag are preserved; bounded resistance and release-only settle are added. Article images use this shared implementation, not article/URL-specific cases. |

## Specific reference differences and evidence

1. **Global snapshot input interception, observed.** In Chrome1100×900, open
   followed by native Close after40ms hit the HTML snapshot instead of the button;
   the transition finished around275ms and the overlay remained open. Normal
   settled close worked. `states-observation.json` contains click targets and
   transition timing. Local FLIP retains spatial continuity while leaving live
   controls immediately usable. It does not reproduce a whole-document snapshot.
2. **Multi-image origin assumption, observed.** Unmodified MediaLightboxViewer
   with three1600×1000 fixtures in1100×900 placed active image1 at x=-582,w825;
   an inactive image appeared centred. `lightbox-runway.json`, original video and
   `lightbox-original.png` retain evidence. mooncci keeps its current single stage
   and short directional change instead of adopting that runway/layout.
3. **Native image dragging, observed in the original.** The original image is
   draggable. Native pointer movement wrote once then lost capture; later moves
   did not reach its handler. `lightbox-drag.json` and original video are retained.
   mooncci retains `draggable=false` and pointer capture from its earlier rounds.
4. **Cumulative delta, observed only in a separate diagnostic.** After setting
   only `draggable=false` on the reference fixture DOM, total pointer deltas
   10/20/30/40px yielded +10/+30/+60/+100px. Source346 adds total delta to drag.tx,
   then349 mutates that same base. This is not claimed as original default
   behaviour. mooncci uses the press-time offset plus total delta, directly.
5. **Reduced-motion gap, observed.** Reference SegmentedControl still traversed
   and overshot under system reduced motion. mooncci listens to both the system
   preference and its existing local preference, including changes mid-motion.
6. **Thinking live lock, source/fixture behaviour.** Its isThinkingLive forces
   expansion. This business rule is not carried to normal article disclosures;
   only the height/arrow choreography is adapted.
7. The reference hook lacks explicit concurrent cancellation and viewport-origin
   guards. Those are **static risks**, not reproduced promise failures. Source
   invisibility/disconnection is handled by a local fade in mooncci, with no flight
   to stale coordinates. Strongly cropped source/target aspect mismatch also uses
   that fallback rather than distorting the image.

The reference is not treated as animation-free or universally faulty. Second-round
mooncci already had press feedback, a160ms moving underline and direct image pan.
This round changes gesture phases, velocity continuation, coordinated layout,
source/target presentation and released boundaries. Functional state commits and
requests never wait for animation. No global transition-all, whole-page entrance,
text reveal or scroll interception is introduced.

Installed public package is motion12.23.24; its resolved framer-motion implementation
in this workspace is12.38.0. APIs were checked and executed from the installed
source. Final bundle increments and engine/device limitations are reported with
the local acceptance evidence; mobile emulation/WebKit are not real Safari tests.

The public controller chunk loads through the existing afterInitialLoad mechanism,
after the initial content. Existing CSS feedback remains immediate before it is
ready. A press already in progress finishes with that owner before enhancement
installs; requests and route state never wait for either animation or import.
The total motion-code cost is still reported, rather than treated as removed.

Article follow-up preserves the literal Aa entry. For a coverless article without
a directory the existing trigger is grouped with the header category, removing
the solitary body toolbar. Other articles keep their existing directory/settings
positions. Mobile metadata establishes two groups before asynchronous analytics;
both text rows share an axis beside the avatar, and the cluster is centered. The
count node is hidden until a real positive value is known, without a fake
accessible count or fixed empty numeric width. The editor
preview still has no analytics slot. Desktop reading settings receives focus once
its initially hidden panel has been placed; later resizing does not steal focus.

WebKit originally reported the constrained SVG fit width as naturalWidth in the
new image plane. A direct second-round comparison proved this was a regression,
not an existing SVG limitation. The loaded pending image is now synchronously
measured without max constraints and restored in finally before painting. The
original SVG browser fixture remains in the final zoom/pan gate; raster evidence
is supplementary, not a replacement for that regression test.
