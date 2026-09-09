/* ============================================================
   MUSIC PAGE — orbital-ascent loader scene  (canvas 2D, no assets)
   A night-city grid the camera pulls back from, out to a planet
   in a starfield. Driven by the real load %  (reads .loader__bar).
   Scoped: only runs where  #loader .mx-scene  exists (the music page).
   Reduced motion → one calm static frame, no animation.
   ============================================================ */
(function () {
  'use strict';

  var loader = document.getElementById('loader');
  if (!loader) return;
  var canvas = loader.querySelector('.mx-scene');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* the scene runs on its own eased clock, paced to match app.js's curtain
     (0.5s on a repeat visit, ~1.8s first time) — a hair longer so it fully
     resolves to orbit before the curtain lifts. */
  var seen = false;
  try { seen = sessionStorage.getItem('by_seen') === '1'; } catch (e) {}
  var DUR = (reduce || seen) ? 700 : 2100;
  var clockStart = 0;

  /* ---------- sizing ---------- */
  var W = 1, H = 1, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = loader.clientWidth || window.innerWidth;
    H = loader.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------- deterministic field data ---------- */
  var seed = 20260909;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

  var STARS = [];
  for (var i = 0; i < 200; i++) STARS.push({ x: rnd(), y: rnd(), r: 0.3 + rnd() * 1.2, p: rnd() * 6.283, s: 0.5 + rnd() * 1.8 });

  /* buildings live on lateral lane L (-1..1) at depth D (0 near .. 1 far) */
  var CITY = [];
  for (var b = 0; b < 150; b++) {
    CITY.push({
      lane: (rnd() * 2 - 1),
      depth: rnd(),
      w: 6 + rnd() * 16,
      h: 10 + rnd() * 46,
      warm: rnd() < 0.62,
      lights: 1 + (rnd() * 4 | 0),
      ph: rnd() * 6.283
    });
  }
  CITY.sort(function (a, c) { return c.depth - a.depth; });   /* far first */

  /* ---------- helpers ---------- */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(a, b, v) { return clamp01((v - a) / (b - a)); }
  function smooth(a, b, v) { v = seg(a, b, v); return v * v * (3 - 2 * v); }

  var scroll = 0;
  var stopped = false, raf = 0;

  function loadFrac(now) {
    if (reduce) return 1;
    if (!clockStart) clockStart = now + 120;                  /* small grace so app.js can attach */
    var e = clamp01((now - clockStart) / DUR);
    return e * e * (3 - 2 * e);                               /* smoothstep */
  }

  /* projection: a point at lateral `lane` and depth `d` -> screen x/y/scale.
     horizon rises and the ground compresses as `alt` (0 street → 1 orbit) grows.
     `curve` bows the ground into a planet limb near the end. */
  function project(lane, d, horizonY, groundY, alt, curve) {
    var f = 1 - d;                                   /* 1 near, 0 at horizon */
    var y = horizonY + (groundY - horizonY) * (f * f);
    var spread = 40 + (groundY - horizonY) * 1.7 * (f * f);
    var x = W * 0.5 + lane * spread;
    y += curve * Math.pow((x - W * 0.5) / (W * 0.5 + 1), 2) * (0.35 + f * 0.65);
    return { x: x, y: y, k: 0.12 + f * (1.4 - alt) };
  }

  function render(now) {
    var p = loadFrac(now);
    /* altitude 0 (street) → 1 (orbit); most of the climb is the back half */
    var alt = smooth(0.04, 0.98, p);
    var alt2 = alt * alt;

    if (!reduce) {
      scroll += (0.010 + (1 - alt) * 0.03);
      if (scroll > 1) scroll -= 1;
    }

    ctx.clearRect(0, 0, W, H);

    /* space ground */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#03050b');
    bg.addColorStop(1, '#04070e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* horizon starts low (city sits in the bottom third, wordmark clear) and
       rises high late in the climb so it never parks behind the wordmark */
    var horizonY = H * (0.78 - smooth(0.16, 1, p) * 0.58);
    /* the ground's NEAR edge climbs toward the horizon as we ascend, so the
       whole city compresses into a shrinking band at the limb instead of
       streaking long lines up past the wordmark */
    var groundY = (H * 1.16) + (horizonY + H * 0.30 - H * 1.16) * smooth(0.12, 0.82, p);
    var curve = smooth(0.34, 1, p) * (H * 0.95);

    /* ---- stars fade in with altitude ---- */
    var starA = reduce ? 0.8 : smooth(0.28, 0.82, p);
    if (starA > 0.001) {
      ctx.fillStyle = '#e2e9f4';
      for (var s = 0; s < STARS.length; s++) {
        var st = STARS[s];
        var tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(now * 0.001 * st.s + st.p);
        ctx.globalAlpha = starA * tw * (0.3 + st.r * 0.35);
        var sy = st.y * Math.min(horizonY, H * 0.9);
        ctx.fillRect(st.x * W, sy, st.r, st.r);
      }
      ctx.globalAlpha = 1;
    }

    /* ---- atmosphere band along the horizon ---- */
    var atmoA = reduce ? 0.7 : smooth(0.3, 0.8, p);
    if (atmoA > 0.001) {
      var ah = 80 + alt * 120;
      var ag = ctx.createLinearGradient(0, horizonY - ah, 0, horizonY + ah * 0.35);
      ag.addColorStop(0, 'rgba(143,199,164,0)');
      ag.addColorStop(0.62, 'rgba(143,199,164,' + (0.12 * atmoA).toFixed(3) + ')');
      ag.addColorStop(1, 'rgba(120,175,205,' + (0.18 * atmoA).toFixed(3) + ')');
      ctx.fillStyle = ag;
      ctx.fillRect(-2, horizonY - ah, W + 4, ah * 1.35 + 2);
    }

    /* ---- the city grid + buildings (dims into surface speckle) ---- */
    var cityA = reduce ? 0.22 : (1 - smooth(0.52, 0.96, p) * 0.82);
    if (cityA > 0.02) {
      /* lateral grid lines — stop short of the horizon so nothing sprays
         out from behind the wordmark; fade with distance */
      ctx.lineWidth = 1;
      for (var g = -6; g <= 6; g++) {
        var lane = g / 6;
        var a = project(lane, 0.02, horizonY, groundY, alt, curve);
        var z = project(lane, 0.74, horizonY, groundY, alt, curve);
        ctx.strokeStyle = 'rgba(150,182,178,' + (0.15 * cityA).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke();
      }
      /* depth rings (scrolling toward camera → sense of flight) */
      for (var r = 0; r < 14; r++) {
        var d = ((r / 14) + scroll) % 1;
        if (d > 0.82) continue;
        var l0 = project(-1.2, d, horizonY, groundY, alt, curve);
        var l1 = project(1.2, d, horizonY, groundY, alt, curve);
        var rowA = Math.pow(1 - d, 1.8) * 0.3 * cityA;
        ctx.strokeStyle = 'rgba(150,182,178,' + rowA.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.stroke();
      }
      /* buildings */
      for (var c = 0; c < CITY.length; c++) {
        var bd = CITY[c];
        var d2 = (bd.depth + scroll * 0.7) % 1;
        var pr = project(bd.lane, d2, horizonY, groundY, alt, curve);
        if (pr.y < horizonY + 2 || pr.y > H + 40) continue;
        var bw = bd.w * pr.k, bh = bd.h * pr.k;
        if (bh < 0.6) continue;
        var near = 1 - d2;
        ctx.fillStyle = 'rgba(20,30,44,' + (0.72 * cityA * near).toFixed(3) + ')';
        ctx.fillRect(pr.x - bw / 2, pr.y - bh, bw, bh);
        /* window lights */
        var lc = bd.warm ? '240,186,128' : '155,210,184';
        var flick = 0.72 + 0.28 * Math.sin(now * 0.004 + bd.ph);
        ctx.fillStyle = 'rgba(' + lc + ',' + Math.min(1, cityA * near * flick).toFixed(3) + ')';
        for (var wl = 0; wl < bd.lights; wl++) {
          var lx = pr.x - bw / 2 + bw * ((wl + 0.5) / bd.lights);
          var ly = pr.y - bh * (0.25 + 0.6 * ((wl * 37 % 5) / 5));
          var ps = Math.max(0.7, 1.4 * pr.k);
          ctx.fillRect(lx - ps / 2, ly - ps / 2, ps, ps);
        }
      }
    }

    /* ---- planet limb rising from below ---- */
    var limbA = reduce ? 1 : smooth(0.42, 0.9, p);
    if (limbA > 0.001) {
      var cx = W * 0.5;
      var R = W * (2.4 - alt2 * 1.3);
      var cy = horizonY + R * 0.9;
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      var pg = ctx.createRadialGradient(cx, cy - R * 0.35, R * 0.15, cx, cy, R);
      pg.addColorStop(0, 'rgba(12,19,30,' + (0.55 * limbA).toFixed(3) + ')');
      pg.addColorStop(0.8, 'rgba(6,10,18,' + (0.9 * limbA).toFixed(3) + ')');
      pg.addColorStop(1, 'rgba(4,7,14,' + limbA.toFixed(3) + ')');
      ctx.fillStyle = pg;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
      /* rim light */
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.04, Math.PI * 1.96);
      ctx.lineWidth = 1.5 + alt * 2;
      ctx.strokeStyle = 'rgba(155,205,190,' + (0.55 * limbA).toFixed(3) + ')';
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.04, Math.PI * 1.96);
      ctx.lineWidth = 7 + alt * 12;
      ctx.strokeStyle = 'rgba(120,175,205,' + (0.10 * limbA).toFixed(3) + ')';
      ctx.stroke();
    }

    if (!reduce && p > 0.8) loader.classList.add('is-orbit');
  }

  function loop(now) {
    if (stopped) return;
    render(now);
    /* keep drawing through the curtain's slide-out; stop only once it's gone */
    if (!loader.isConnected) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }

  function finish() {
    if (stopped) return;
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }

  if (reduce) { render(performance.now()); loader.classList.add('is-orbit'); return; }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else if (!stopped && !raf) raf = requestAnimationFrame(loop);
  });

  /* safety: if the curtain never lifts, bail after 12s */
  setTimeout(finish, 12000);
  raf = requestAnimationFrame(loop);
})();
