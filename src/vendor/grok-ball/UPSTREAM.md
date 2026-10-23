# grok-ball

Source: https://github.com/tycoding/grok-ball

Pinned revision: `de368ce3acdc5a70e871ee46ebbe8f60b11d3d6a`

`LICENSE` is unchanged upstream. `grok-ball.ts` adds the optional `pointerTracking` integration flag. Local patch to `grok-ball.js`: cache the last body/eye transform and eye path, skipping only identical SVG attribute writes. Default poses, rounding, frame cadence, gaze and emotion logic are retained. The site opts into `pointerTracking`: wider mouse-gaze range, gentler exponential response, and temporary pointer priority over autonomous glances/turns; attention fades back to idle after mouse inactivity. Default instances retain the pinned golden output. The runtime is bundled locally by Vite; no visitor requests to GitHub or a CDN are needed. The React integration is in `src/app/components/WeatherCompanion.tsx`.

Copyright (c) 2026 tycoding. MIT license retained here and published at `/licenses/grok-ball.txt`.

Pointer tracking exposes its eased vertical head pitch on the body SVG group for attached decorations; the default runtime does not emit this attribute.
