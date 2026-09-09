/* ============================================================
   MUSIC PAGE — cosmic zoom-out hero  (canvas 2D, no assets)
   Continues the loader's ascent: scroll pulls the camera back
   from low Earth orbit → Earth as a lit marble → outer-system
   planets → the Milky Way, then hands off to the ledger.
   Everything is procedural — a few offscreen textures are baked
   once at load, no image/font/video files.
   Scroll-pinned. Runs only where #mx-hero + its canvas exist.
   Reduced motion → one static frame, no pin, no rAF.
   Low-power devices auto-drop to a lighter render.
   ============================================================ */
(function () {
  'use strict';

  var hero = document.getElementById('mx-hero');
  if (!hero) return;
  var scrollEl = document.getElementById('mx-hero-scroll');
  var canvas = hero.querySelector('.mx-hero__scene');
  if (!scrollEl || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var actEl = document.getElementById('mx-hero-act');

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------- quality tier ---------- */
  var TIER = 'high';
  try {
    var hwc = navigator.hardwareConcurrency || 8;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (hwc <= 3 || (coarse && hwc <= 6)) TIER = 'low';
  } catch (e) {}

  /* ---------- helpers ---------- */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(a, b, v) { return clamp01((v - a) / (b - a)); }
  function smooth(a, b, v) { v = seg(a, b, v); return v * v * (3 - 2 * v); }
  var seed = 20260909;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }
  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, ((n >> 16) & 255) + amt), g = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
    return '#' + (((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
  }

  /* ---------- deterministic fields ---------- */
  var STAR_N = TIER === 'low' ? 150 : 240;
  var STARS = [];
  for (var i = 0; i < STAR_N; i++) STARS.push({ x: rnd(), y: rnd(), r: 0.3 + rnd() * 1.2, p: rnd() * 6.283, s: 0.5 + rnd() * 1.8 });

  /* scripted fly-bys — q0/q1 = scroll window; x fractions of W, y fraction of H;
     r = peak radius as a fraction of H */
  var BODIES = [
    { name: 'MOON',    q0: 0.22, q1: 0.42, xFrom: 1.18,  xTo: -0.20, y: 0.32, r: 0.030, hue: '#9aa3ac' },
    { name: 'MARS',    q0: 0.38, q1: 0.58, xFrom: -0.18, xTo: 1.14,  y: 0.60, r: 0.040, hue: '#a85a42', polar: true, atmo: '210,140,110' },
    { name: 'JUPITER', q0: 0.50, q1: 0.74, xFrom: 1.22,  xTo: -0.24, y: 0.30, r: 0.115, hue: '#b98f63', bands: true, band1: '214,180,140', band2: '150,110,80', spot: true, atmo: '220,190,150' },
    { name: 'SATURN',  q0: 0.62, q1: 0.86, xFrom: -0.22, xTo: 1.18,  y: 0.56, r: 0.082, hue: '#c9b489', bands: true, band1: '216,198,158', band2: '170,150,110', ring: true, atmo: '220,205,160' },
    { name: 'NEPTUNE', q0: 0.76, q1: 0.96, xFrom: 1.20,  xTo: -0.22, y: 0.34, r: 0.050, hue: '#4f7bc4', bands: true, band1: '110,150,210', band2: '60,95,170', atmo: '130,170,230' },
    { name: 'TITAN',   q0: 0.66, q1: 0.84, xFrom: 0.16,  xTo: 0.80,  y: 0.72, r: 0.014, hue: '#a8926b' }
  ];

  var ACTS = ['Low Earth orbit', 'Departure — 384 000 km', 'Outer system', 'The Milky Way'];

  /* ---------- offscreen textures (baked once) ---------- */
  function tex(w, h, paint) {
    var t = document.createElement('canvas');
    t.width = w; t.height = h;
    paint(t.getContext('2d'), w, h);
    return t;
  }
  function blob(g, cx, cy, rad, pts, fill) {
    g.beginPath();
    for (var k = 0; k <= pts; k++) {
      var a = (k / pts) * 6.2832;
      var rr = rad * (0.62 + 0.38 * rnd());
      var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.82;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  var earthTex, cloudTex, nightTex, galaxyTex;
  function bakeTextures() {
    earthTex = tex(1024, 512, function (g, w, h) {
      var og = g.createLinearGradient(0, 0, 0, h);
      og.addColorStop(0, '#0b2236'); og.addColorStop(0.5, '#0e2c46'); og.addColorStop(1, '#0a1d30');
      g.fillStyle = og; g.fillRect(0, 0, w, h);
      var land = ['#2f4a30', '#3a5230', '#4c4a2c', '#5a4a33', '#39543a', '#46422a'];
      try { g.filter = 'blur(2px)'; } catch (e) {}
      for (var c = 0; c < 30; c++) {
        blob(g, rnd() * w, h * (0.12 + rnd() * 0.76), 30 + rnd() * 95, 9 + (rnd() * 5 | 0), land[c % land.length]);
      }
      try { g.filter = 'none'; } catch (e) {}
      /* ice caps */
      var cap = g.createLinearGradient(0, 0, 0, h * 0.16);
      cap.addColorStop(0, 'rgba(226,234,240,0.7)'); cap.addColorStop(1, 'rgba(226,234,240,0)');
      g.fillStyle = cap; g.fillRect(0, 0, w, h * 0.16);
      var cap2 = g.createLinearGradient(0, h, 0, h * 0.84);
      cap2.addColorStop(0, 'rgba(226,234,240,0.7)'); cap2.addColorStop(1, 'rgba(226,234,240,0)');
      g.fillStyle = cap2; g.fillRect(0, h * 0.84, w, h * 0.16);
      /* speckle */
      for (var s = 0; s < 1600; s++) {
        g.fillStyle = 'rgba(255,255,255,' + (0.02 + rnd() * 0.04).toFixed(3) + ')';
        g.fillRect(rnd() * w, rnd() * h, 1, 1);
      }
    });

    nightTex = tex(1024, 512, function (g, w, h) {
      for (var cl = 0; cl < 26; cl++) {
        var cxp = rnd() * w, cyp = h * (0.18 + rnd() * 0.64);
        var dots = 10 + (rnd() * 16 | 0);
        for (var d = 0; d < dots; d++) {
          var dx = cxp + (rnd() - 0.5) * 60, dy = cyp + (rnd() - 0.5) * 44;
          g.fillStyle = 'rgba(255,' + (196 + (rnd() * 40 | 0)) + ',' + (130 + (rnd() * 60 | 0)) + ',' + (0.35 + rnd() * 0.5).toFixed(2) + ')';
          g.fillRect(dx, dy, 1.4, 1.4);
        }
      }
    });

    cloudTex = tex(768, 384, function (g, w, h) {
      try { g.filter = 'blur(7px)'; } catch (e) {}
      for (var n = 0; n < 24; n++) {
        var cxp = rnd() * w, cyp = rnd() * h, rw = 30 + rnd() * 110, rh = 12 + rnd() * 34;
        var cg = g.createRadialGradient(cxp, cyp, 0, cxp, cyp, rw);
        cg.addColorStop(0, 'rgba(244,248,255,' + (0.35 + rnd() * 0.35).toFixed(2) + ')');
        cg.addColorStop(1, 'rgba(244,248,255,0)');
        g.fillStyle = cg;
        g.save(); g.translate(cxp, cyp); g.rotate(rnd() * 3.14); g.scale(1, rh / rw);
        g.beginPath(); g.arc(0, 0, rw, 0, 6.2832); g.fill(); g.restore();
      }
      try { g.filter = 'none'; } catch (e) {}
    });

    galaxyTex = tex(2048, 720, function (g, w, h) {
      var cyy = h * 0.5;
      var og = g.createRadialGradient(w * 0.42, cyy, 0, w * 0.42, cyy, w * 0.42);
      og.addColorStop(0, 'rgba(120,140,195,0.11)');
      og.addColorStop(0.5, 'rgba(88,108,170,0.05)');
      og.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = og; g.fillRect(0, 0, w, h);
      /* broad diffuse band */
      var band = g.createLinearGradient(0, cyy - h * 0.34, 0, cyy + h * 0.34);
      band.addColorStop(0, 'rgba(120,132,182,0)');
      band.addColorStop(0.5, 'rgba(184,186,220,0.14)');
      band.addColorStop(1, 'rgba(120,132,182,0)');
      g.fillStyle = band; g.fillRect(0, cyy - h * 0.34, w, h * 0.68);
      /* bright core */
      g.save(); g.translate(w * 0.42, cyy); g.scale(1, 0.26);
      var bg = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.30);
      bg.addColorStop(0, 'rgba(236,226,240,0.5)');
      bg.addColorStop(0.28, 'rgba(206,196,226,0.24)');
      bg.addColorStop(0.65, 'rgba(150,150,205,0.07)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, w * 0.30, 0, 6.2832); g.fill();
      g.restore();
      /* nebula tints */
      var neb = [['255,120,170', 0.06], ['120,222,210', 0.05], ['255,212,142', 0.055], ['172,142,255', 0.05]];
      for (var nn = 0; nn < 8; nn++) {
        var col = neb[nn % neb.length];
        var nx = rnd() * w, ny = cyy + (rnd() - 0.5) * h * 0.4, nr = w * (0.045 + rnd() * 0.08);
        var ng = g.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ')');
        ng.addColorStop(1, 'rgba(' + col[0] + ',0)');
        g.fillStyle = ng; g.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      }
      /* dust lanes */
      for (var dl = 0; dl < 5; dl++) {
        var dy0 = cyy + (rnd() - 0.5) * h * 0.22;
        var dg = g.createLinearGradient(0, dy0 - 16, 0, dy0 + 16);
        dg.addColorStop(0, 'rgba(0,0,0,0)');
        dg.addColorStop(0.5, 'rgba(3,4,9,0.5)');
        dg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = dg; g.fillRect(0, dy0 - 16, w, 32);
      }
      /* stars bunched along the band */
      for (var st = 0; st < 440; st++) {
        var sy = cyy + ((rnd() + rnd() + rnd()) / 3 - 0.5) * h * 0.72;
        var sr = 0.4 + rnd() * 1.3;
        g.fillStyle = 'rgba(232,236,246,' + (0.22 + rnd() * 0.62).toFixed(2) + ')';
        g.fillRect(rnd() * w, sy, sr, sr);
      }
    });
  }
  bakeTextures();

  /* ---------- sizing ---------- */
  var W = 1, H = 1, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = hero.clientWidth || window.innerWidth;
    H = hero.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    measure();
  }

  /* ---------- scroll geometry — cached, never read layout in the loop ---------- */
  var heroTop = 0, heroSpan = 1;
  var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  function measure() {
    var r = scrollEl.getBoundingClientRect();
    heroTop = r.top + (window.pageYOffset || document.documentElement.scrollTop || 0);
    heroSpan = Math.max(1, scrollEl.offsetHeight - hero.clientHeight);
  }
  window.addEventListener('scroll', function () {
    scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  }, { passive: true });
  function progress() { return clamp01((scrollY - heroTop) / heroSpan); }

  /* ---------- planet render ---------- */
  var sunX = 0, sunY = 0;

  function drawBody(bd, q) {
    if (q < bd.q0 || q > bd.q1) return;
    var t = clamp01((q - bd.q0) / (bd.q1 - bd.q0));
    var al = Math.sin(Math.PI * t);
    if (al < 0.02) return;
    var bx = W * (bd.xFrom + (bd.xTo - bd.xFrom) * t);
    var by = H * bd.y;
    var br = H * bd.r * (0.55 + 0.45 * Math.sin(Math.PI * t));
    var sa = Math.atan2(sunY - by, sunX - bx);
    var lx = bx + Math.cos(sa) * br * 0.55, ly = by + Math.sin(sa) * br * 0.55;
    var hi = TIER === 'high';

    /* back half of the ring */
    if (bd.ring) {
      ctx.save();
      ctx.globalAlpha = 0.32 * al;
      ctx.lineWidth = Math.max(1, br * 0.5);
      ctx.strokeStyle = 'rgba(206,186,146,1)';
      ctx.beginPath(); ctx.ellipse(bx, by, br * 1.95, br * 0.46, -0.36, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    /* disc */
    var pg = ctx.createRadialGradient(lx, ly, br * 0.08, bx, by, br * 1.4);
    pg.addColorStop(0, hexA(lighten(bd.hue, 34), al));
    pg.addColorStop(0.55, hexA(bd.hue, al));
    pg.addColorStop(1, 'rgba(4,7,14,' + al.toFixed(3) + ')');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.clip();
    if (hi && bd.bands && br > 6) {
      for (var k = 0; k < 5; k++) {
        var yy = by - br + (k + 0.5) * (br * 2 / 5);
        ctx.fillStyle = 'rgba(' + (k % 2 ? bd.band1 : bd.band2) + ',' + (0.20 * al).toFixed(3) + ')';
        ctx.fillRect(bx - br, yy - br * 0.15, br * 2, br * 0.3);
      }
      if (bd.spot) {
        ctx.fillStyle = 'rgba(188,92,72,' + (0.5 * al).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(bx + br * 0.22, by + br * 0.18, br * 0.26, br * 0.15, 0.2, 0, 6.2832); ctx.fill();
      }
    }
    if (bd.polar && br > 5) {
      ctx.fillStyle = 'rgba(222,230,236,' + (0.5 * al).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(bx, by - br * 0.8, br * 0.44, br * 0.22, 0, 0, 6.2832); ctx.fill();
    }
    var tg = ctx.createLinearGradient(bx + Math.cos(sa) * br, by + Math.sin(sa) * br, bx - Math.cos(sa) * br, by - Math.sin(sa) * br);
    tg.addColorStop(0, 'rgba(3,5,10,0)');
    tg.addColorStop(0.46, 'rgba(3,5,10,0.10)');
    tg.addColorStop(0.66, 'rgba(2,4,8,0.82)');
    tg.addColorStop(1, 'rgba(2,3,7,0.95)');
    ctx.fillStyle = tg;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    ctx.restore();

    /* front half of the ring + planet shadow across it */
    if (bd.ring) {
      ctx.save();
      ctx.globalAlpha = 0.55 * al;
      ctx.lineWidth = Math.max(1, br * 0.5);
      ctx.strokeStyle = 'rgba(220,202,160,1)';
      ctx.beginPath(); ctx.ellipse(bx, by, br * 1.95, br * 0.46, -0.36, 0, Math.PI); ctx.stroke();
      ctx.globalAlpha = 0.5 * al;
      ctx.fillStyle = 'rgba(2,4,9,1)';
      ctx.beginPath();
      ctx.ellipse(bx - Math.cos(sa) * br * 1.15, by - Math.sin(sa) * br * 0.35, br * 0.6, br * 0.42, -0.36, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* sunward atmosphere rim */
    if (bd.atmo && br > 5) {
      ctx.beginPath(); ctx.arc(bx, by, br, sa - 1.4, sa + 1.4);
      ctx.lineWidth = Math.max(1, br * 0.07);
      ctx.strokeStyle = 'rgba(' + bd.atmo + ',' + (0.5 * al).toFixed(3) + ')';
      ctx.stroke();
    }

    if (br >= 6) {
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(176,201,190,' + (0.45 * al).toFixed(3) + ')';
      var _lx = bx + br + 14, nm = bd.name;
      for (var ci = 0; ci < nm.length; ci++) {
        var ch = nm.charAt(ci);
        ctx.fillText(ch, _lx, by + 3);
        _lx += 2.4 + ctx.measureText(ch).width;
      }
    }
  }

  /* ---------- Earth render ---------- */
  function drawEarth(cx, cy, Re, q) {
    if (Re <= 3) {
      if (Re > 0.06) {
        ctx.globalAlpha = clamp01(Re / 3);
        ctx.fillStyle = '#bcd8e8';
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
        ctx.globalAlpha = 1;
      }
      return;
    }
    var sa = Math.atan2(sunY - cy, sunX - cx);
    var rimA = Re < 6 ? clamp01(Re / 6) : 1;
    var lit = smooth(0, 0.08, q);           /* day-side lighting fades in just after the seam */
    var hi = TIER === 'high';

    /* atmosphere halo behind the disc */
    var halo = ctx.createRadialGradient(cx, cy, Re * 0.86, cx, cy, Re * 1.38);
    halo.addColorStop(0, 'rgba(92,152,212,0)');
    halo.addColorStop(0.45, 'rgba(98,160,216,' + (0.18 * rimA).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(70,120,190,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, Re * 1.38, 0, 6.2832); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Re, 0, 6.2832); ctx.clip();

    /* base ocean, lit toward the sun */
    var lx = cx + Math.cos(sa) * Re * (0.35 + 0.25 * lit), ly = cy + Math.sin(sa) * Re * (0.35 + 0.25 * lit);
    var base = ctx.createRadialGradient(lx, ly, Re * 0.1, cx, cy, Re * 1.5);
    base.addColorStop(0, lit > 0.3 ? '#14425f' : '#0c2438');
    base.addColorStop(0.4, '#0d2b43');
    base.addColorStop(1, '#05121e');
    ctx.fillStyle = base;
    ctx.fillRect(cx - Re, cy - Re, Re * 2, Re * 2);

    /* continents (high tier, while large) */
    if (hi && Re > 22) {
      var pan = ((q * 2.4) % 1) * earthTex.width;
      var dw = Re * 2.3, dh = Re * 2, dx0 = cx - Re * 1.15, dy0 = cy - Re;
      ctx.globalAlpha = 0.9 * (0.35 + 0.65 * lit);
      ctx.drawImage(earthTex, pan - earthTex.width, 0, earthTex.width, earthTex.height, dx0, dy0, dw, dh);
      ctx.drawImage(earthTex, pan, 0, earthTex.width, earthTex.height, dx0, dy0, dw, dh);
      ctx.globalAlpha = 1;
    }

    /* terminator — darken the night hemisphere */
    var tg = ctx.createLinearGradient(cx + Math.cos(sa) * Re, cy + Math.sin(sa) * Re, cx - Math.cos(sa) * Re, cy - Math.sin(sa) * Re);
    var nightK = 0.55 + 0.42 * lit;
    tg.addColorStop(0, 'rgba(3,6,12,0)');
    tg.addColorStop(0.42, 'rgba(3,6,12,' + (0.10 * lit).toFixed(3) + ')');
    tg.addColorStop(0.62, 'rgba(2,4,9,' + (0.88 * nightK).toFixed(3) + ')');
    tg.addColorStop(1, 'rgba(1,2,6,' + (0.96 * nightK).toFixed(3) + ')');
    ctx.fillStyle = tg;
    ctx.fillRect(cx - Re, cy - Re, Re * 2, Re * 2);

    /* clouds (high tier, while large) */
    if (hi && Re > 30) {
      var cpan = ((q * 1.9) % 1) * cloudTex.width;
      var cw = Re * 2.2, cdx = cx - Re * 1.1, cdy = cy - Re;
      ctx.globalAlpha = 0.42 * clamp01(seg(30, H * 0.55, Re));
      ctx.drawImage(cloudTex, cpan - cloudTex.width, 0, cloudTex.width, cloudTex.height, cdx, cdy, cw, Re * 2);
      ctx.drawImage(cloudTex, cpan, 0, cloudTex.width, cloudTex.height, cdx, cdy, cw, Re * 2);
      ctx.globalAlpha = 1;
    }

    /* city lights on the night side */
    if (Re > 16) {
      var npan = ((q * 2.4) % 1) * nightTex.width;
      var nw = Re * 2.3, ndx = cx - Re * 1.15, ndy = cy - Re;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * clamp01(seg(16, H * 0.6, Re));
      ctx.drawImage(nightTex, npan - nightTex.width, 0, nightTex.width, nightTex.height, ndx, ndy, nw, Re * 2);
      ctx.drawImage(nightTex, npan, 0, nightTex.width, nightTex.height, ndx, ndy, nw, Re * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      /* wipe any that landed on the day side */
      var tg2 = ctx.createLinearGradient(cx + Math.cos(sa) * Re, cy + Math.sin(sa) * Re, cx - Math.cos(sa) * Re, cy - Math.sin(sa) * Re);
      tg2.addColorStop(0, 'rgba(3,6,12,0.9)');
      tg2.addColorStop(0.44, 'rgba(3,6,12,' + (0.7 * lit).toFixed(3) + ')');
      tg2.addColorStop(0.6, 'rgba(3,6,12,0)');
      tg2.addColorStop(1, 'rgba(3,6,12,0)');
      ctx.fillStyle = tg2;
      ctx.fillRect(cx - Re, cy - Re, Re * 2, Re * 2);
    }
    ctx.restore();

    /* bright scattering crescent on the sunward limb */
    if (Re > 6) {
      ctx.beginPath(); ctx.arc(cx, cy, Re, sa - 1.5, sa + 1.5);
      ctx.lineWidth = Math.max(1, Re * 0.028);
      ctx.strokeStyle = 'rgba(150,205,225,' + (0.6 * rimA * (0.3 + 0.7 * lit)).toFixed(3) + ')';
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, Re, sa - 1.9, sa + 1.9);
      ctx.lineWidth = Math.max(2, Re * 0.09);
      ctx.strokeStyle = 'rgba(110,170,220,' + (0.13 * rimA).toFixed(3) + ')';
      ctx.stroke();
    }
    /* faint full rim so the disc always reads against black (matches the loader) */
    ctx.beginPath(); ctx.arc(cx, cy, Re, 0, 6.2832);
    ctx.lineWidth = Math.max(0.6, Re * 0.006);
    ctx.strokeStyle = 'rgba(150,200,205,' + (0.28 * rimA).toFixed(3) + ')';
    ctx.stroke();
  }

  /* ---------- full frame ---------- */
  function render(now, q) {
    ctx.clearRect(0, 0, W, H);
    sunX = -W * 0.12; sunY = H * 0.30;

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#03050b');
    bg.addColorStop(1, '#04070e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* camera — logarithmic distance */
    var dist = Math.pow(10, q * 3.7);
    var Re = (H * 1.20) / dist;
    var cx = W * 0.5;
    var cy = H * (1.14 - 0.62 * smooth(0.05, 0.55, q));
    var seam = 1 - seg(0, 0.06, q);
    if (seam > 0) {
      cy = cy * (1 - seam) + (H * 1.18) * seam;
      Re = Re * (1 - seam) + (H * 1.10) * seam;
    }

    /* sun glare off the left edge */
    var sunSeg = smooth(0.08, 0.30, q) * (1 - smooth(0.44, 0.62, q));
    if (sunSeg > 0.002) {
      var sg = ctx.createRadialGradient(-W * 0.12, H * 0.30, 0, -W * 0.12, H * 0.30, W * 0.75);
      sg.addColorStop(0, 'rgba(255,240,210,' + (0.12 * sunSeg).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
    }

    /* Milky Way — one baked texture, rotated, drifting */
    var mwA = smooth(0.52, 0.95, q);
    if (mwA > 0.003) {
      ctx.save();
      ctx.globalAlpha = mwA;
      ctx.translate(W * 0.5, H * 0.50);
      ctx.rotate(-0.42);
      var gW = Math.max(W, H) * 2.6, gH = gW * (galaxyTex.height / galaxyTex.width);
      ctx.drawImage(galaxyTex, -gW * 0.5 - (q - 0.5) * W * 0.35, -gH / 2, gW, gH);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* parallax foreground stars */
    var starA = 0.4 + 0.55 * smooth(0.0, 0.4, q);
    ctx.fillStyle = '#e2e9f4';
    for (var si = 0; si < STARS.length; si++) {
      var s0 = STARS[si];
      var tw = 0.6 + 0.4 * Math.sin(now * 0.001 * s0.s + s0.p);
      ctx.globalAlpha = starA * tw * (0.3 + s0.r * 0.35);
      ctx.fillRect(s0.x * W, s0.y * H, s0.r, s0.r);
    }
    ctx.globalAlpha = 1;

    /* planets (array order = far → near) */
    for (var bi = 0; bi < BODIES.length; bi++) drawBody(BODIES[bi], q);

    /* Earth */
    drawEarth(cx, cy, Re, q);
  }

  /* ---------- loop ----------
     The rAF loop never stops — but render() (the expensive part) is skipped
     whenever the hero is scrolled out of view or the tab is hidden. The gate
     is pure cached arithmetic (no layout reads), so an idle loop costs nothing
     and there is no fragile start/stop to get stuck in the "off" state. */
  var raf = 0, lastQ = -1, tickN = 0, lastAct = -1, isFar = false;
  var probeN = 0, probeSum = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);

    if (document.hidden) { lastQ = -1; return; }
    /* off-screen? keep looping, draw nothing */
    if (scrollY < heroTop - H || scrollY > heroTop + heroSpan + H * 0.6) { lastQ = -1; return; }

    var q = progress();
    tickN++;
    if (q === lastQ && (tickN & 3) !== 0) return;   /* idle: twinkle at ~15fps, else skip */
    lastQ = q;

    var t0 = performance.now();
    render(now, q);
    if (probeN < 32) {
      probeSum += performance.now() - t0;
      probeN++;
      if (probeN === 32 && probeSum / 32 > 6.5) TIER = 'low';   /* runtime downgrade only */
    }

    var act = q < 0.22 ? 0 : q < 0.50 ? 1 : q < 0.78 ? 2 : 3;
    if (act !== lastAct) { lastAct = act; if (actEl) actEl.textContent = ACTS[act]; }

    var far = isFar ? (q > 0.52) : (q > 0.58);
    if (far !== isFar) { hero.classList.toggle('is-far', far); isFar = far; }
  }

  /* ---------- reduced motion: one static frame, no pin, no rAF ---------- */
  if (reduce) {
    hero.classList.add('mx-hero--static');
    resize();
    render(performance.now(), 0.32);
    return;
  }

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(resize, 120);
  }, { passive: true });
  window.addEventListener('load', function () { measure(); });

  resize();
  raf = requestAnimationFrame(frame);

  /* ---------- auto-play: ease the page through the whole journey once,
     right after the loader lifts. Any real scroll / wheel / key / touch
     hands control straight back. Skipped on a repeat visit this session. ---------- */
  var heroSeen = false;
  try { heroSeen = sessionStorage.getItem('mx-hero-seen') === '1'; } catch (e) {}

  if (!heroSeen) {
    var autoRaf = 0, autoOn = false, autoT0 = 0, autoTo = 0, autoExpect = 0;
    var AUTO_DUR = 7200;

    function autoDone() {
      if (!autoOn) return;
      autoOn = false;
      if (autoRaf) cancelAnimationFrame(autoRaf);
      try { sessionStorage.setItem('mx-hero-seen', '1'); } catch (e) {}
      window.removeEventListener('wheel', autoDone);
      window.removeEventListener('touchstart', autoDone);
      window.removeEventListener('keydown', autoKey);
      window.removeEventListener('scroll', autoWatch);
    }
    function autoKey(e) {
      if (e.key === ' ' || e.key === 'Spacebar' ||
          e.key.indexOf('Arrow') === 0 || e.key.indexOf('Page') === 0 ||
          e.key === 'Home' || e.key === 'End') autoDone();
    }
    function autoWatch() {
      /* our own scrollTo keeps actual ≈ autoExpect; a bigger gap = the user grabbed it */
      if (autoOn && Math.abs((window.pageYOffset || 0) - autoExpect) > 16) autoDone();
    }
    function autoTick(now) {
      if (!autoOn) return;
      var e = clamp01((now - autoT0) / AUTO_DUR);
      var k = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;   /* easeInOutQuad */
      autoExpect = autoTo * k;
      window.scrollTo(0, autoExpect);
      if (e >= 1) { autoDone(); return; }
      autoRaf = requestAnimationFrame(autoTick);
    }
    function autoBegin() {
      if ((window.pageYOffset || 0) > 6) { autoDone(); return; }   /* user already moved */
      measure();
      /* land past the hero so it slides away and the masthead is in view */
      autoTo = heroTop + heroSpan + H * 0.55;
      if (autoTo < H) { autoDone(); return; }
      autoT0 = performance.now();
      autoOn = true;
      window.addEventListener('wheel', autoDone, { passive: true });
      window.addEventListener('touchstart', autoDone, { passive: true });
      window.addEventListener('keydown', autoKey);
      window.addEventListener('scroll', autoWatch, { passive: true });
      autoRaf = requestAnimationFrame(autoTick);
    }

    /* roll once the loader curtain is gone */
    var waitCurtain = setInterval(function () {
      if (!document.getElementById('loader')) {
        clearInterval(waitCurtain);
        setTimeout(autoBegin, 450);
      }
    }, 120);
    setTimeout(function () {   /* safety: start anyway if the loader never leaves */
      clearInterval(waitCurtain);
      if (!autoOn && !heroSeen) autoBegin();
    }, 6500);
  }
})();
