# 001 — Build the scroll-driven cosmic zoom-out hero scene (Music page)

- **Status**: DONE (2026-09-09)
- **Commit**: 74ea9c1
- **Severity**: HIGH (missed opportunity — the page's headline moment)
- **Category**: 8. Missed opportunities / 5. Performance
- **Estimated scope**: 1 new JS file (~380 lines), 1 CSS block, 1 HTML section. Music page only.

## Problem

The Music page currently spends its best animation in a place nobody sees twice: the
2-second loading curtain. `redesign-assets/js/music-loader.js` renders a city →
orbit ascent, then the curtain lifts and the scene is destroyed:

```js
/* redesign-assets/js/music-loader.js:~215 — current */
function loop(now) {
  if (stopped) return;
  render(now);
  /* keep drawing through the curtain's slide-out; stop only once it's gone */
  if (!loader.isConnected) { finish(); return; }
  raf = requestAnimationFrame(loop);
}
```

Behind it, the page opens on a plain masthead with no motion at all:

```html
<!-- music.redesign.html:61-69 — current -->
<main class="shell">
  <section class="page-top" id="top">
    <a class="back-link" href="index.redesign.html">…</a>
    <span class="kicker stage">Sound — Production Archive</span>
    <h1 class="display d-1 stage">Music</h1>
    <p class="standfirst stage">Three tracks I made outside of engineering…</p>
  </section>
```

The ascent stops at low orbit and ends. There is no hero scene, so the journey the
loader starts is never paid off, and the strongest idea on the page is thrown away
after two seconds.

**Performance context (non-negotiable).** The owner has twice reported this
portfolio feeling laggy. The Photography page was rescued by removing per-frame
layout reads and per-frame DOM writes (`redesign-assets/js/photography.js`), taking
a full-corridor scroll from janky to **0 long frames, worst frame 12 ms**. This new
scene must be built to that same standard or it will undo that work.

## Target

A **scroll-pinned canvas hero** that continues the loader's journey through four
acts as the user scrolls, then hands off to the track ledger.

| Scroll `q` | Act | On screen | `#mx-hero-act` label |
| --- | --- | --- | --- |
| 0.00–0.22 | Orbit | Earth limb filling the lower frame, atmosphere rim, city-light speckle on the terminator, stars | `LOW EARTH ORBIT` |
| 0.22–0.50 | Departure | Earth shrinks to a lit marble; Moon drifts past; sun glare off the left edge | `DEPARTURE — 384 000 KM` |
| 0.50–0.78 | Planets | Earth is a dot; 3 stylised planets pass at different parallax depths (one ringed) | `OUTER SYSTEM` |
| 0.78–1.00 | Milky Way | Planets recede; the star field densifies into a galactic band; hero type fades out | `THE MILKY WAY` |

### Camera model (exact)

A single logarithmic distance scalar. Real "powers of ten" zooms are logarithmic;
a linear one collapses Earth to a dot almost immediately and looks wrong.

```js
var dist = Math.pow(10, q * 3.7);          // 1 → ~5012
var Re   = (H * 1.20) / dist;              // Earth's on-screen radius in px
```

Sanity values on an 870 px-tall viewport — the executor should confirm these:

| `q` | `dist` | `Re` | Reads as |
| --- | --- | --- | --- |
| 0.00 | 1.0 | ~1044 px | limb fills the frame |
| 0.25 | 8.4 | ~124 px | a globe |
| 0.35 | 19.4 | ~54 px | a marble |
| 0.50 | 70.8 | ~15 px | a dot |
| 0.75 | 595 | ~1.8 px | a bright point |
| 1.00 | 5012 | ~0.2 px | gone |

Earth's centre sits below the frame and rises as it shrinks:
`cy = H * (1.10 + 0.34 * q)` clamped so the disc stays visually anchored low-left of centre;
`cx = W * 0.5`.

### Planets (scripted, not simulated)

Scripted keyframes are deterministic, art-directable and cheap. Define exactly
these five entries; do not simulate orbits.

```js
/* q0/q1 = scroll window it is visible; r = peak radius as a fraction of H;
   x/y are fractions of W/H; ring = draw an ellipse ring */
var BODIES = [
  { name:'MOON',    q0:0.24, q1:0.46, xFrom:1.18, xTo:-0.22, y:0.34, r:0.028, hue:'#b9c3ce', ring:false },
  { name:'MARS',    q0:0.46, q1:0.66, xFrom:-0.18, xTo:1.16, y:0.62, r:0.042, hue:'#b2705a', ring:false },
  { name:'SATURN',  q0:0.58, q1:0.82, xFrom:1.22, xTo:-0.26, y:0.40, r:0.085, hue:'#c9b489', ring:true  },
  { name:'NEPTUNE', q0:0.74, q1:0.94, xFrom:-0.20, xTo:1.18, y:0.66, r:0.048, hue:'#6f93bd', ring:false },
  { name:'TITAN',   q0:0.66, q1:0.86, xFrom:0.82,  xTo:0.14, y:0.22, r:0.016, hue:'#a8926b', ring:false }
];
```

Per body, with `t = (q - q0) / (q1 - q0)` clamped to 0–1:

- `alpha = Math.sin(Math.PI * t)` — fades in and out, peaks mid-window.
- `x = W * (xFrom + (xTo - xFrom) * t)`, `y = H * body.y`.
- `radius = H * body.r * (0.55 + 0.45 * Math.sin(Math.PI * t))`.
- Disc: `ctx.arc(x, y, radius, 0, 6.2832)` filled with a radial gradient from
  `body.hue` at `(x - radius*0.35, y - radius*0.35)` to `rgba(4,7,14,1)` at the rim,
  multiplied by `alpha`.
- Terminator: after the disc, fill the same arc with
  `rgba(4,7,14,' + (0.55 * alpha) + ')` clipped to a second arc offset by
  `radius * 0.45` on +x — gives a lit crescent without lighting maths.
- Ring (Saturn only): `ctx.ellipse(x, y, radius * 2.05, radius * 0.42, -0.38, 0, 6.2832)`,
  `lineWidth = Math.max(1, radius * 0.16)`, stroke `rgba(201,180,137,' + (0.5*alpha) + ')`.
- Label: mono 9 px, `letterSpacing` not available on canvas — draw with
  `ctx.font = '9px "IBM Plex Mono", monospace'` and manual per-character advance of
  `+2.4 px`, colour `rgba(176,201,190,' + (0.45 * alpha) + ')`, placed at
  `(x + radius + 14, y)`. Skip the label when `radius < 6`.

### Milky Way band (q ≥ 0.72)

```js
var mwA = smooth(0.72, 0.98, q);            // 0 → 1
ctx.save();
ctx.translate(W * 0.5, H * 0.52);
ctx.rotate(-0.38);                          // radians
var bands = [ [H*0.95, 0.055], [H*0.52, 0.075], [H*0.24, 0.10] ];
for (var i = 0; i < bands.length; i++) {
  var bh = bands[i][0], a = bands[i][1] * mwA;
  var g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  g.addColorStop(0,   'rgba(120,150,200,0)');
  g.addColorStop(0.5, 'rgba(176,196,226,' + a.toFixed(3) + ')');
  g.addColorStop(1,   'rgba(120,150,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-W, -bh / 2, W * 2, bh);
}
ctx.restore();
```

Plus a second precomputed star array `BELT` (140 stars) clustered along the band —
generate with `y` drawn from `(rnd() + rnd() + rnd()) / 3` so it bunches centrally —
drawn inside the same `save/rotate/restore` with alpha `mwA * twinkle`.

### Sun glare (q 0.08 → 0.62)

One radial gradient hotspot centred at `(-W * 0.12, H * 0.30)`, radius `W * 0.75`,
`rgba(255,238,205, 0.10 * seg)` → transparent, where
`seg = smooth(0.08,0.30,q) * (1 - smooth(0.44,0.62,q))`.

### Performance budget (hard ceiling)

| Item | Cap |
| --- | --- |
| Background stars | 260 |
| Belt stars | 140 |
| Bodies | 5 (≤ 4 canvas ops each) |
| Milky Way | 3 gradient fills |
| Sun glare | 1 gradient fill |
| **Total draw ops / frame** | **≈ 450** |

Required techniques, all already proven in this repo:

1. **Never read layout inside rAF.** Cache scroll geometry in `measure()`; update a
   `scrollY` variable from a `{ passive: true }` scroll listener. Copy the pattern at
   `redesign-assets/js/photography.js:~86-110` verbatim in spirit.
2. **Idle skip.** In the loop: if `q === lastQ` and `(tickCount & 3) !== 0`, return
   without rendering (lets twinkle run at ~15 fps while the scene is still, costs
   nothing while scrolling).
3. **Pause when offscreen.** `IntersectionObserver` on `#mx-hero`; when
   `isIntersecting === false`, cancel the rAF. Resume on re-entry.
4. **Pause when hidden.** `document.addEventListener('visibilitychange', …)` —
   same shape as `music-loader.js:~250`.
5. **DPR capped at 2**: `DPR = Math.min(2, window.devicePixelRatio || 1)`.
6. Star/body/belt arrays precomputed **once** with the deterministic `rnd()` LCG
   from `music-loader.js:~40`; never allocate inside the frame loop.

### Scroll length

```css
.mx-hero-scroll { height: calc(100svh * var(--mx-hero-len, 2.6)); }
```

**2.6 viewport-heights, not 4.** Three tracks buried behind four screens of scroll is
hostile; 2.6 gives the journey room while keeping the ledger reachable. The
`--mx-hero-len` custom property is the single knob to retune it.

## Repo conventions to follow

- **No build step, no framework.** Plain ES5-style JS in an IIFE, `var` only, no
  optional chaining, no arrow functions — match `redesign-assets/js/music-loader.js`
  exactly. GSAP is vendored but this scene must **not** use it.
- **Element-guarded modules.** Every JS file starts by querying its root element and
  returning if absent, so it is inert on other pages:
  ```js
  /* redesign-assets/js/music-loader.js:10-15 — the exemplar to copy */
  var loader = document.getElementById('loader');
  if (!loader) return;
  var canvas = loader.querySelector('.mx-scene');
  if (!canvas || !canvas.getContext) return;
  ```
- **Helpers already exist** in `music-loader.js` — reuse the same implementations
  (copy them into the new file; do not import, there is no module system):
  `clamp01(v)`, `seg(a,b,v)`, `smooth(a,b,v)`, and the `rnd()` LCG seeded `20260909`.
- **Easing token**: `--ease-out: cubic-bezier(.16,.84,.44,1)` in
  `redesign-assets/css/core.css:41`. Use it for every CSS transition in this work.
  Do not introduce a second ease-out curve.
- **All CSS scoped to `body.music-page`**, appended inside the existing
  `MUSIC PAGE — "Árstraumur" aesthetic pass` block in
  `redesign-assets/css/core.css` (starts ~line 1340). The rest of the portfolio must
  be visually untouched.
- **Palette** (already defined on `body.music-page`, use the tokens, not literals,
  for CSS; the canvas may use the literals below since canvas cannot read tokens
  cheaply): `--bg-0:#04070e`, `--amber:#8fc7a4`, `--amber-bright:#a9d8bd`,
  `--text-secondary:rgba(199,210,222,.72)`, `--hairline:rgba(154,176,201,.14)`.

## Steps

1. **Create `redesign-assets/js/music-hero.js`.** IIFE, `'use strict'`. Guard on
   `document.getElementById('mx-hero')` and its `canvas.mx-hero__scene`; return if
   either is missing.

2. **Copy in the helpers** `clamp01`, `seg`, `smooth`, `rnd` (LCG seed `20260909`)
   from `music-loader.js` lines ~36–48 and ~58–62.

3. **Precompute fields once**: `STARS` (260 entries `{x,y,r,p,s}` as in
   `music-loader.js:~44`), `BELT` (140 entries, `y` from the 3-sample average
   described above), and the `BODIES` array exactly as specified in **Target**.

4. **Add `resize()`** — cap DPR at 2, size the canvas backing store, `setTransform`.
   Call on load and on a 120 ms-debounced `resize` listener (debounce pattern:
   `redesign-assets/js/photography.js:~300`).

5. **Add `measure()`** — cache `heroTop = rect.top + window.pageYOffset` and
   `heroSpan = Math.max(1, scrollEl.offsetHeight - hero.clientHeight)`. Call it from
   `resize()` and once on `window load`.

6. **Add the scroll cache** — `window.addEventListener('scroll', function(){ scrollY = window.pageYOffset || document.documentElement.scrollTop || 0; }, { passive:true })`.
   `progress()` returns `clamp01((scrollY - heroTop) / heroSpan)` — pure arithmetic,
   **no `getBoundingClientRect` call**.

7. **Write `render(now, q)`** in this draw order: background gradient
   (`#03050b` → `#04070e`) → sun glare → Milky Way band + BELT → STARS → BODIES
   (nearest last) → Earth (disc, terminator, atmosphere rim, city speckle).

8. **Match the loader's final frame at `q = 0`** so the curtain lift is invisible.
   Use these exact values, which are `music-loader.js` at `p = 1`:
   - background gradient `#03050b` (top) → `#04070e` (bottom)
   - `horizonY = H * 0.20`
   - Earth rim inner stroke `rgba(155,205,190,0.55)`, `lineWidth 3.5`
   - Earth rim outer glow `rgba(120,175,205,0.10)`, `lineWidth 19`
   - Earth body radial: `rgba(12,19,30,0.55)` → `rgba(6,10,18,0.9)` at 0.8 → `rgba(4,7,14,1)` at 1
   - atmosphere band height `200`, stops `rgba(143,199,164,0)` → `rgba(143,199,164,0.12)` at 0.62 → `rgba(120,175,205,0.18)` at 1
   - star colour `#e2e9f4`, alpha `starA * twinkle * (0.3 + r * 0.35)`
   - city-light speckle alpha `0.18`
   Blend from this framing into the `dist`-driven camera across `q` 0 → 0.06 so
   there is no visible pop.

9. **Write the loop**: `tick(now)` → schedule next frame first, then
   `q = progress()`; apply the idle skip from **Performance budget** item 2; call
   `render`. Add the IntersectionObserver pause and the `visibilitychange` pause.

10. **Update `#mx-hero-act`** — only when the act index actually changes (compare
    against a `lastAct` variable). Never write to the DOM every frame.

11. **Add the CSS** to `redesign-assets/css/core.css` inside the music-page block:
    ```css
    .mx-hero-scroll{ position:relative; height:calc(100svh * var(--mx-hero-len, 2.6)); }
    .mx-hero{ position:sticky; top:0; height:100svh; overflow:hidden; }
    .mx-hero__scene{ position:absolute; inset:0; width:100%; height:100%; display:block; z-index:0; pointer-events:none; }
    ```

12. **Add the markup** to `music.redesign.html`, immediately after the closing
    `</nav>` of `.mnav` (line ~59) and **before** `<main class="shell">`:
    ```html
    <section class="mx-hero-scroll" id="mx-hero-scroll">
      <div class="mx-hero" id="mx-hero">
        <canvas class="mx-hero__scene" aria-hidden="true"></canvas>
        <p class="mx-hero__act" id="mx-hero-act" aria-live="polite">Low Earth orbit</p>
      </div>
    </section>
    ```
    (The hero's wordmark, tagline and scroll cue are added by plan **002** — leave
    room for them but do not invent them here.)

13. **Add the script tag** in `music.redesign.html` after `music-loader.js`:
    `<script src="redesign-assets/js/music-hero.js"></script>`

14. **Reduced motion.** At the top of the IIFE read
    `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. When true:
    render **one** static frame at `q = 0.42` (Earth as a marble, stars, no belt),
    add class `mx-hero--static` to `#mx-hero`, and return without starting rAF. Add:
    ```css
    @media (prefers-reduced-motion: reduce){
      .mx-hero-scroll{ height:auto; }
      .mx-hero{ position:static; height:auto; min-height:70svh; }
    }
    ```

## Boundaries

- Do **NOT** modify `redesign-assets/js/music-loader.js`, `music.js`, `app.js`,
  `photography.js`, `ring.js`, `hero3d.js`, or `shader-bg.js`.
- Do **NOT** touch `index.redesign.html`, `work.redesign.html`,
  `photography.redesign.html`, `about.redesign.html`, or the original `index.html`.
- Do **NOT** change any `WEBP/…` or `.mp3` path, and do **NOT** add image, video,
  font or texture files. This scene is procedural — zero new media.
- Do **NOT** add dependencies. No three.js, no WebGL, no GSAP for this scene.
- Do **NOT** alter the existing `.mx-*` player, ledger, volume or mini-bar CSS/JS.
- Do **NOT** use `getBoundingClientRect()` anywhere inside the animation frame.
- If the code at a cited line does not match this plan (drift since commit
  `74ea9c1`), **STOP and report** rather than improvising.

## Verification

- **Mechanical**: no build step exists. Serve the repo root and load the page:
  ```bash
  python -m http.server 8899
  ```
  Open `http://127.0.0.1:8899/music.redesign.html`. The browser console must show
  **zero errors**. `document.querySelectorAll('.mx-hero__scene').length` must be `1`.
  Confirm the module is inert elsewhere: load `photography.redesign.html` and
  `about.redesign.html` — still zero console errors.

- **Feel check**:
  - Scroll slowly from the top. Earth must **shrink continuously** — no jump, no pop
    at the moment the loader curtain lifts (act 1 must be pixel-continuous with the
    loader's last frame).
  - Each planet must fade **in and out**, never appear or vanish abruptly at the edge
    of its window.
  - Scroll back up: the scene must run exactly in reverse with no drift or
    accumulated offset. (Scroll-linked scenes that integrate state instead of
    deriving it from `q` fail this — it is the key correctness test.)
  - Fling-scroll the hero hard, then stop: the scene must land where the scrollbar
    says it should, immediately.
  - The act label must change **once** per act, not flicker at boundaries.

- **Performance (this is the gate — the page has a lag history)**:
  In DevTools → Performance, record a 3-second scroll through the whole hero.
  ```js
  // paste in console, then scroll the hero end-to-end
  let f=0,long=0,worst=0,last=performance.now(),s=last;
  (function l(n){const d=n-last;last=n;f++;if(d>24)long++;if(d>worst)worst=d;
    if(n-s<3000)requestAnimationFrame(l);
    else console.log({fps:Math.round(f/3),longFrames:long,worstMs:Math.round(worst)});})(performance.now());
  ```
  **Required: `longFrames` ≤ 2 and `worstMs` ≤ 20.** For reference, the Photography
  corridor scores `longFrames: 0, worstMs: 12` after its optimisation pass. If this
  scene is worse than that, reduce star counts before shipping anything else.
  Also confirm with the hero scrolled fully out of view that the rAF has stopped
  (Performance panel shows no recurring frame work).

- **Reduced motion**: DevTools → Rendering → *Emulate prefers-reduced-motion:
  reduce*, reload. The hero must be a single static frame at normal page height, the
  page must scroll normally, no pinning, and no rAF running.

- **Done when**: the four acts read cleanly on a slow scroll, reverse scroll is
  exact, the frame-timing gate above passes, reduced motion is a static frame, and
  no file outside the three listed in **Steps** has changed.
