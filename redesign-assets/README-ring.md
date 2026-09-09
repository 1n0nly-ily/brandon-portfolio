# The landing ring — how to add / change cards

The rotating carousel on `index.redesign.html` is **data-driven from the HTML**.
The script (`redesign-assets/js/ring.js`) just reads whatever `.ring__item`
elements it finds and solves the geometry for that count. There is no list of
cards to keep in sync anywhere else.

## Add a new project card

1. Open `index.redesign.html`, find `<div class="ring" id="ring">`.
2. Copy one whole `<a class="ring__item"> … </a>` block and paste it as the
   last child (order = display order around the ring).
3. Edit these five things:

   | part | what to put |
   |------|-------------|
   | `href` | where the card links — a section page, or `work.redesign.html#some-id` |
   | `data-name` | the big label (Fraunces) shown at the bottom when this card is front — keep it short |
   | `data-desc` | the 3–5 word line under it (e.g. `Supersonic wake · Mach 3`) |
   | `aria-label` on the `<a>` | full sentence for screen readers |
   | `.ring__media` contents | one `<img src="WEBP/…">` **or** a `<video autoplay muted loop playsinline>` with a `<source>` — use paths that already exist under `WEBP/` |

4. (Optional) renumber the `.ring__tag` values so they read 01, 02, 03…

That's it. Reload — the ring re-spaces itself.

## Removing a card

Delete its `<a class="ring__item">` block. Nothing else.

## "Don't let it get too clustered"

`ring.js` already protects against this:

- **Radius grows with card count** — the ring pushes outward so the *gap between
  cards* stays about the same. More cards ⇒ bigger circle, not tighter packing.
- **Cards shrink past `CFG.refCount`** (currently 9) — gently, so 12–14 cards
  still read fine.
- Cards facing away are non-interactive and dimmed, so only the few near the
  front ever compete for attention.

Practical ceiling: **~14 cards.** Beyond that they're small and far even with the
auto-spacing — better to group them (e.g. a "Projects" card that opens a page
listing many projects) than to keep adding to the ring.

## Tuning the feel

All in one place — the `CFG` object at the top of `redesign-assets/js/ring.js`:

| key | effect |
|-----|--------|
| `idleSpeed` | ambient drift speed (deg/sec) |
| `tilt` | how far the ring lies back (negative = rear edge up) |
| `perspective` | lower = more dramatic depth/foreshortening |
| `cardBaseFrac` / `minCardW` / `maxCardW` | card size |
| `flickDecay` | how long a thrown spin glides (higher = longer) |
| `labelHoldVel` | above this spin speed the bottom label freezes instead of flickering |
