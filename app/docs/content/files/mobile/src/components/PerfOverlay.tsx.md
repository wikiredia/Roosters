---
updated: 2026-10-29T23:10:00Z
---

**The fps overlay**, mounted in the root layout over every screen and never taking a touch. Only exists where
`debugEnabled` is true and the switch on the Server & debug screen is on (`lib/perf.perfOverlay`).

- **UI fps**: frames drawn by the UI thread (`useFrameCallback`), with the slowest frame, written straight into an animated
  text on the UI thread. It keeps counting while JS is busy, which is the point.
- **JS fps**: `requestAnimationFrame`s per second and the slowest gap.
- **columns**: how often the Rooster grid's day columns rendered since the last reset.
- **cache**: size and `JSON.stringify` time of the last write of the persisted query cache.

Watch out: the UI line is a `TextInput` that takes `text` from animated props (a `Text` can't be animated that way). That's
the usual trick, but it is untested on a device from this repo; if it shows nothing, use JS fps and the debug screen.

## `PerfOverlay`

The overlay (renders nothing when off).
