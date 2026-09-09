# 002 — Hero layout, type and loader→hero handoff (Music page)

- **Status**: DONE (2026-09-09)
- **Depends on**: 001 (the canvas scene must exist first)
- **Commit**: 74ea9c1
- **Severity**: MEDIUM (cohesion + the seam between two animated systems)
- **Category**: 7. Cohesion & tokens / 3. Physicality & origin
- **Estimated scope**: 1 HTML section, 1 CSS block. Music page only.

## Problem

Once plan 001 lands there is a canvas hero with nothing on it but an act label, and
two separate systems that both claim the top of the page:

```html
<!-- music.redesign.html:21-34 — the loader already owns a signature + tagline -->
<div class="loader loader--center" id="loader" …>
  <canvas class="mx-scene" aria-hidden="true"></canvas>
  <div class="loader__mid">
    <span class="loader__word loader__word--sig"><span>Brandon Yuen</span></span>
    <p class="loader__tag">Beats, flips and loops — made in the margins of engineering.</p>
  </div>
  <span class="loader__coord" aria-hidden="true">EARTH · SYDNEY · 33.8688° S  151.2093° E</span>
```

```html
<!-- music.redesign.html:63-69 — and the masthead repeats the job with no motion -->
<section class="page-top" id="top">
  <span class="kicker stage">Sound — Production Archive</span>
  <h1 class="display d-1 stage">Music</h1>
```

Result: the signature appears, disappears with the curtain, and the page restarts
cold with a different heading in a different typeface. The journey has no landing.

## Target

The hero carries the same composition the loader ends on, so the curtain lift reads
as the camera continuing rather than a scene change — then the type recedes as the
scene travels outward.

### Composition

Left-aligned at `var(--edge)`, vertically centred — the signature is long, and
centring a script wordmark of that length reads as a wedding invitation. Order:

1. `.mx-hero__coord` — mono 9 px, `letter-spacing:.24em`, uppercase,
   `rgba(176,201,190,.5)` — the live coordinate/act readout.
2. `.mx-hero__sig` — **Parisienne**, `clamp(48px, 9.5vw, 118px)`, `line-height:1.12`,
   `rgba(233,239,246,.96)`.
3. `.mx-hero__tag` — **Marcellus**, `clamp(15px, 2.2vw, 21px)`, `line-height:1.5`,
   `rgba(199,210,222,.68)`, `max-width:34ch`.
4. `.mx-hero__cue` — mono 9.5 px, `letter-spacing:.26em`, uppercase, pinned bottom-left,
   **an anchor to `#mx-list`** so the three tracks are always one click away.

`#mx-hero-act` (from 001) sits bottom-right, mono, `rgba(176,201,190,.45)`.

### Type recession (the only new motion here)

The hero block fades and drifts back as the camera leaves the solar system, so the
Milky Way act is uncluttered. Driven by a single class toggle from `music-hero.js`,
**not** per-frame style writes:

```css
.mx-hero__inner{
  transition: opacity .6s var(--ease-out), transform .6s var(--ease-out);
}
.mx-hero.is-far .mx-hero__inner{
  opacity: 0;
  transform: translate3d(0, -18px, 0) scale(.97);
}
```

`music-hero.js` adds `is-far` when `q > 0.58` and removes it below `q > 0.52`
(hysteresis — a single threshold makes the block strobe when the user hovers the
boundary). Compare against a stored boolean and only touch `classList` on change.

Both properties are compositor-only. `--ease-out` is the repo token
`cubic-bezier(.16,.84,.44,1)`; do not introduce a second curve.

### Entrance

The hero type must **not** animate in on load — the loader curtain is already a
1-second entrance, and stacking a second one delays the page for no gain. The block
is simply present at `q = 0`. `.stage`/`.reveal` classes must not be used here.

### Handoff

- The loader's `.loader__coord` string and the hero's `.mx-hero__coord` start
  identical (`EARTH · SYDNEY · 33.8688° S  151.2093° E`) so the readout appears
  continuous through the curtain lift.
- The loader's signature is `clamp(54px, 12vw, 124px)`; the hero's is
  `clamp(48px, 9.5vw, 118px)` — slightly smaller, so the wordmark reads as having
  settled rather than jumping.
- Keep `.page-top` and its `<h1>Music</h1>` **below** the hero. It is the page's real
  heading for assistive tech and search; the script signature is decorative and is
  not a heading. Do not delete it and do not promote the signature to `<h1>`.

### On "copy the reference site"

The reference is a real musician's site. What this plan takes is the **structural
pattern** — fixed script wordmark, coordinate readout, full-bleed scene behind a
hero block, sticky player — which is a common editorial/space-site composition and
is already the direction this page has been built in. What it does not take: their
copy, their name and logo artwork, their award badge, or their page as a facsimile.
Every string here is the owner's own.

## Repo conventions to follow

- **Scope everything to `body.music-page`.** Append to the existing block
  `MUSIC PAGE — "Árstraumur" aesthetic pass` in `redesign-assets/css/core.css`
  (~line 1340). Nothing outside the Music page may change appearance.
- **Fonts are already loaded** on this page — do not add a `<link>`:
  ```html
  <!-- music.redesign.html:16 -->
  …family=Fraunces…&family=IBM+Plex+Mono…&family=Marcellus&family=Parisienne&family=Plus+Jakarta+Sans…
  ```
- **Exemplar for the script + serif pairing to imitate** —
  `redesign-assets/css/core.css`, `.loader__word--sig span` and `.loader__tag`
  (~lines 1390–1400). Match their colours and stacks exactly:
  `'Parisienne', 'Snell Roundhand', cursive` and
  `'Marcellus', 'Times New Roman', serif`.
- **Tokens, not literals**, for anything with a token: `var(--edge)`,
  `var(--font-mono)`, `var(--ease-out)`, `var(--amber-bright)`.
- **Class-toggle, not per-frame writes** — the pattern already used at
  `redesign-assets/js/photography.js` for `is-deep`: compare to a cached boolean,
  toggle only on change.

## Steps

1. In `music.redesign.html`, extend the `#mx-hero` markup created by plan 001 so it
   reads exactly:
   ```html
   <section class="mx-hero-scroll" id="mx-hero-scroll">
     <div class="mx-hero" id="mx-hero">
       <canvas class="mx-hero__scene" aria-hidden="true"></canvas>
       <div class="mx-hero__inner">
         <span class="mx-hero__coord" aria-hidden="true">EARTH &middot; SYDNEY &middot; 33.8688&deg; S&nbsp;&nbsp;151.2093&deg; E</span>
         <span class="mx-hero__sig">Brandon Yuen</span>
         <p class="mx-hero__tag">Beats, flips and loops — made in the margins of engineering.</p>
       </div>
       <a class="mx-hero__cue" href="#mx-list">Scroll &mdash; or skip to the music</a>
       <p class="mx-hero__act" id="mx-hero-act" aria-live="polite">Low Earth orbit</p>
     </div>
   </section>
   ```

2. Confirm `id="mx-list"` exists on the track `<ol>` (it does —
   `music.redesign.html:~79`) so the cue anchor resolves.

3. Add to `redesign-assets/css/core.css` inside the music-page block:
   ```css
   .mx-hero__inner{
     position:absolute; left:var(--edge); top:50%; transform:translateY(-50%);
     z-index:2; max-width:min(46ch, 78vw);
     display:flex; flex-direction:column; gap:clamp(12px,2.2vh,22px);
     transition:opacity .6s var(--ease-out), transform .6s var(--ease-out);
   }
   .mx-hero.is-far .mx-hero__inner{ opacity:0; transform:translateY(-50%) translate3d(0,-18px,0) scale(.97); }
   .mx-hero__coord{
     font-family:var(--font-mono); font-size:9px; letter-spacing:.24em;
     text-transform:uppercase; color:rgba(176,201,190,.5);
   }
   .mx-hero__sig{
     font-family:'Parisienne','Snell Roundhand',cursive;
     font-size:clamp(48px,9.5vw,118px); line-height:1.12; letter-spacing:0;
     color:rgba(233,239,246,.96);
   }
   .mx-hero__tag{
     font-family:'Marcellus','Times New Roman',serif;
     font-size:clamp(15px,2.2vw,21px); line-height:1.5;
     color:rgba(199,210,222,.68); max-width:34ch;
   }
   .mx-hero__cue{
     position:absolute; left:var(--edge); bottom:clamp(24px,5vh,52px); z-index:2;
     font-family:var(--font-mono); font-size:9.5px; letter-spacing:.26em;
     text-transform:uppercase; color:var(--text-tertiary);
     transition:color .25s var(--ease-out);
   }
   .mx-hero__cue:hover{ color:var(--amber-bright); }
   .mx-hero__act{
     position:absolute; right:var(--edge); bottom:clamp(24px,5vh,52px); z-index:2;
     font-family:var(--font-mono); font-size:9px; letter-spacing:.24em;
     text-transform:uppercase; color:rgba(176,201,190,.45); margin:0;
   }
   @media (max-width:640px){
     .mx-hero__act{ display:none; }          /* cue alone on small screens */
   }
   ```
   Note the `is-far` transform repeats `translateY(-50%)` — the base centring
   transform must be preserved or the block will jump on the first toggle.

4. In `redesign-assets/js/music-hero.js` (from plan 001), inside the loop after `q`
   is computed, add hysteresis-guarded class toggling:
   ```js
   var far = isFar ? (q > 0.52) : (q > 0.58);
   if (far !== isFar) { hero.classList.toggle('is-far', far); isFar = far; }
   ```
   Declare `var isFar = false;` alongside the other state variables.

5. Reduced motion — append to the existing reduced-motion block:
   ```css
   @media (prefers-reduced-motion: reduce){
     .mx-hero__inner{ transition:none; }
     .mx-hero.is-far .mx-hero__inner{ opacity:1; transform:translateY(-50%); }
     .mx-hero__cue{ position:static; margin-top:20px; display:inline-block; }
   }
   ```

6. Verify the sticky mini-bar does not collide: `.mx-minibar` only gets `.is-shown`
   when a track is active and its row is off-screen, so it cannot appear during the
   hero. No change needed — confirm by inspection, do not edit `music.js`.

## Boundaries

- Do **NOT** delete or restructure `.page-top`, and do **NOT** change
  `<h1 class="display d-1 stage">Music</h1>` — it stays as the page heading, below
  the hero.
- Do **NOT** modify `redesign-assets/js/music.js`, `music-loader.js` or `app.js`.
- Do **NOT** add fonts, `<link>` tags, images or any other asset.
- Do **NOT** apply `.stage` or `.reveal` to the hero block — no entrance animation.
- Do **NOT** change styling outside `body.music-page`.
- Do **NOT** reproduce copy, names, logos or imagery from the reference site.
- If the code at a cited line does not match this plan (drift since commit
  `74ea9c1`), **STOP and report**.

## Verification

- **Mechanical**: serve the repo (`python -m http.server 8899`) and load
  `music.redesign.html`. Zero console errors. `document.querySelectorAll('h1').length`
  is still `1` and its text is still `Music`.

- **Feel check**:
  - Reload with a cleared session (`sessionStorage.removeItem('by_seen')`) so the
    full loader plays. At the moment the curtain lifts, the signature and the
    coordinate line must appear to **stay put and settle**, not cut to a new layout.
    Step through it in DevTools → Animations at 10 % speed and watch the seam.
  - Scroll to `q ≈ 0.55`: the hero block fades and drifts up **once**, smoothly.
  - Park the scroll exactly on the boundary and jog up and down 20 px repeatedly —
    the block must **not** strobe (this is what the 0.52/0.58 hysteresis buys).
  - Click *Scroll — or skip to the music*: the page jumps to the ledger.
  - Tab through the page: focus order is header → hero cue → back-link → tracks, and
    the cue shows a visible focus ring (inherited from
    `core.css:63` `:focus-visible`).

- **Performance**: re-run the frame-timing snippet from plan 001 while scrolling the
  hero. Adding this plan must not regress it — still **`longFrames` ≤ 2,
  `worstMs` ≤ 20**. If `is-far` is being toggled every frame instead of on change,
  this is where it shows up.

- **Reduced motion**: emulate *prefers-reduced-motion: reduce*. The hero is a static
  frame at normal page height, the type is fully visible and never fades, and the
  cue sits in normal flow.

- **Done when**: the curtain-to-hero seam is invisible at 10 % playback, the type
  recession is smooth and non-strobing, the skip link works, `<h1>Music</h1>` is
  intact below the hero, and no file outside `music.redesign.html`,
  `redesign-assets/css/core.css` and `redesign-assets/js/music-hero.js` has changed.
