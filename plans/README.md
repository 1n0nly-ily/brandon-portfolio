# Animation plans

Written by `improve-animations` on commit `74ea9c1`.
Scope: the **Music page only** (`music.redesign.html`). No other page changes.

## Plans

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| [001](001-music-hero-cosmic-zoom-scene.md) | Scroll-driven cosmic zoom-out hero scene | HIGH | DONE (2026-09-09) |
| [002](002-music-hero-layout-and-handoff.md) | Hero layout, type and loader→hero handoff | MEDIUM | DONE (2026-09-09) |

Both landed in one pass. New file `redesign-assets/js/music-hero.js`; CSS block +
reduced-motion additions in `redesign-assets/css/core.css` (music-page section);
`#mx-hero-scroll` markup + `<script>` in `music.redesign.html`. Verified: four acts
render (Earth limb → marble → Mars/Saturn/Neptune fly-bys → Milky Way band), type
recedes at q≈0.55, `<h1>Music</h1>` intact below, other pages untouched, zero
console errors. Isolated render benchmark = **0.29 ms/frame worst case**. Full-refresh
frame-timing could not be confirmed in the embedded preview pane (it throttles rAF);
the loop carries the plan's perf discipline (no layout reads in-frame, idle-skip,
IntersectionObserver + visibilitychange pause, capped 260+140 particles, DPR≤2).

## Execution order

**001 → 002.** 002 extends markup and JS that 001 creates; running it first will
fail at step 1.

## What these build

The loader's city→orbit ascent currently ends when the curtain lifts. Together these
plans continue that camera move into a scroll-pinned hero:

```
loader (2s, automatic)          hero (scroll-driven, 2.6 viewport-heights)
city ──► atmosphere ──► orbit │ orbit ──► Earth as a marble ──► planets ──► Milky Way ──► ledger
                              ▲
                        seam must be invisible
```

## Constraints carried through both plans

- **Zero new media.** No textures, no images, no video, no 3D library — the whole
  scene is procedural Canvas 2D. This keeps the owner's "don't change media or file
  paths" rule intact and keeps the page light.
- **Performance is the gate, not a nicety.** This page's sibling (Photography) had
  to be rescued from jank; its post-fix score is `longFrames: 0, worstMs: 12` over a
  full scroll. Both plans require **`longFrames` ≤ 2, `worstMs` ≤ 20** and give the
  exact console snippet to measure it. The known failure modes — layout reads inside
  rAF, per-frame DOM writes, unbounded particle counts — are called out with the
  repo's own fixed examples to copy.
- **Everything scoped to `body.music-page`.** The rest of the portfolio keeps its
  warm amber identity.
- **Reduced motion is a real path**, not a disable: a single composed static frame,
  no pinning, normal page scroll.

## Two judgement calls worth knowing about

1. **Hero length is 2.6 viewport-heights, not 4.** Three tracks behind four screens
   of scroll is hostile. `--mx-hero-len` in `core.css` is the single knob if you want
   it longer; plan 002 also adds a *skip to the music* link so the ledger is always
   one click away.

2. **"Copy the reference site" is implemented as adaptation, not cloning.**
   arstraumur.music belongs to a working musician. The plans take the structural
   pattern — fixed script wordmark, coordinate readout, full-bleed scene behind a
   hero block, sticky player — which is a common editorial/space composition and
   already the direction this page was built in. They do not take its copy, its logo
   artwork, its award badge, or its layout as a facsimile. Every string is Brandon's
   own. Worth saying because the reference's own zoom is a bespoke WebGL scene over
   real photographic 3D map tiles of Gävle and a texture-mapped Earth; matching that
   pixel-for-pixel would mean several MB of new imagery and a much heavier runtime —
   the opposite of what this page needs.

## Running them

Either hand a plan to any agent as-is (they are self-contained — exact values, exact
file paths, exact current-code excerpts), or:

```
/improve-animations execute plans/001-music-hero-cosmic-zoom-scene.md
```
