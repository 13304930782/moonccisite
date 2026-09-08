# grok-ball

Source: https://github.com/tycoding/grok-ball

Pinned revision: `de368ce3acdc5a70e871ee46ebbe8f60b11d3d6a`

`grok-ball.ts` and `LICENSE` are unchanged upstream files. Local patch to `grok-ball.js`: cache the last body/eye transform and eye path, skipping only identical SVG attribute writes. Original poses, rounding, frame cadence, gaze and emotion logic are retained. The runtime is bundled locally by Vite; no visitor requests to GitHub or a CDN are needed. The React integration is in `src/app/components/WeatherCompanion.tsx`.

Copyright (c) 2026 tycoding. MIT license retained here and published at `/licenses/grok-ball.txt`.
