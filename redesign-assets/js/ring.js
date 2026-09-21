/* ============================================================
   RING  —  the rotating 3D media carousel that acts as the index
   ------------------------------------------------------------
   Behaviour (v8):
   • Idle: slow continuous drift.
   • Hover LEFT half of the ring (away from any card) → spins one way;
     hover RIGHT half → spins the other way (a jog-wheel), winding up
     to speed rather than snapping there.
   • Hover one of the 3 cards nearest the viewer for ~100ms → it glides
     to the centre and holds for ~1.8s, then releases and resumes
     drifting. The 100ms dwell (and the fact the target is only ever
     re-read on real pointer movement, never merely because the ring
     turned under a still cursor) is what stops this from thrashing.
   • Up to 2 more cards past those 3 (5 total) are ALSO clickable —
     they just don't auto-centre on hover, only on click.
   • DRAG to spin freely — 1:1 tracking + release momentum.
   • CLICK any clickable card:
       – if it isn't dead-centre → glides to the centre and holds.
       – if it's already centre (including mid-hold) → warp transition
         (zoom + light-speed streaks) and navigate in.
   • ArrowLeft/Right step one card. Drag releases a parked/held card.
   • Card size + ring radius scale with viewport WIDTH, so widening
     the window widens the wheel; same proportions on phones.

   If left/right ever feels reversed, flip CFG.hoverDir below (±1).

   ADD A CARD: copy one <a class="ring__item"> block in
   index.html (order = wheel position). Set
   href / data-name / data-desc / aria-label / media.
   See redesign-assets/README-ring.md.
   ============================================================ */
(function () {
  var stage = document.querySelector('.ringstage');
  if (!stage) return;

  var CFG = {
    idleSpeed:   4.0,     // deg/sec ambient drift
    hoverSpeed:  20.0,    // deg/sec at the far left/right edge of the ring
    hoverDir:    1,       // +1 or -1 — flip this if left/right feels backwards
    hoverAccel:  1.5,     // how fast the hover speed spools up (lower = more of a wind-up)
    restSpeed:   1.8,     // deg/sec crawl near centre / when the pointer holds still
    restDelay:   340,     // ms of no movement before easing to restSpeed
    approach:    3.2,     // how fast vel eases toward its target (crawl / idle / release)
    snapEase:    12,      // how fast a clicked/hovered card glides to centre — quick, not a slow drift
    holdMs:      1800,    // how long a centred card stays parked before it resumes drifting
    hoverCentreCos: 0.42, // hovering a card THIS close to front auto-centres it (~3 cards)
    hoverCentreDelay: 50, // ms the pointer must sit on that card before it commits (thrash guard)
    tilt:        -16,     // deg — ring tips so the back cards stay partly visible
    cardCounter: 0.55,    // how much each card un-tilts (1 = fully square to viewer)
    perspective: 1180,
    cardAspect:  1.0,     // 1 = square. Set 0.5625 for 16:9.
    cardWidthFrac:0.205,  // card width as a fraction of viewport width
    radiusFrac:  0.32,    // ring radius as a fraction of viewport width (min)
    refCount:    11,      // card count the size/spacing is tuned for; more cards shrink them a touch
    minCardW:    120,
    maxCardW:    360,
    chordFrac:   1.28,    // neighbour spacing vs card width — >1 leaves a small gap, <1 overlaps
    clickCos:    0.12,    // cards this close to front take clicks (~5 of them) — wider
                          // than the 3 that auto-centre on hover, so cards further
                          // round start responding sooner as they rotate in
    centreCos:   0.985,   // a card this front-facing counts as "centred"
    labelHoldVel:110,
    hysteresis:  0.05,
    flickDecay:  0.945,
    warpMs:      950      // length of the warp-into-card transition
  };

  var viewport = stage.querySelector('.ring-viewport');
  var ring     = stage.querySelector('.ring');
  var items    = [].slice.call(ring.querySelectorAll('.ring__item'));
  var labelEl  = stage.querySelector('.ring-label');
  var nameEl   = stage.querySelector('.ring-label__name');
  var descEl   = stage.querySelector('.ring-label__desc');
  var noEl     = stage.querySelector('.ring-label__no');
  var N = items.length;
  if (!N) return;
  // footer numbers come from wheel position, so they can never drift from the label counter
  items.forEach(function (it, i) {
    var tag = it.querySelector('.ring__tag');
    if (tag) tag.textContent = (i < 9 ? '0' : '') + (i + 1);
  });

  var step = 360 / N;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = matchMedia('(pointer:fine)').matches;
  var now = function () { return performance.now(); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var cosAt = function (i, r) { return Math.cos((i * step + r) * Math.PI / 180); };
  var shortDelta = function (a, b) { return ((a - b + 540) % 360) - 180; };

  stage.style.setProperty('--persp', CFG.perspective + 'px');
  stage.style.setProperty('--tiltX', CFG.tilt + 'deg');
  stage.style.setProperty('--cardTilt', (CFG.tilt * -CFG.cardCounter) + 'deg');

  /* ---- geometry — everything scales with viewport WIDTH ---- */
  // The clickable element (.ring__item, the <a> itself) is deliberately
  // BIGGER than the visible card (.ring__card, centred inside it) — wider
  // on the sides than top/bottom, since a card rotated a few degrees off
  // dead-centre gets keystoned by the 3D perspective toward its outer edge.
  // This makes the real anchor's hit-test box generous, rather than relying
  // on a separate pseudo-element pad layered on top of it.
  var radius = 420, itemW = 260, itemH = 260, DRAG_SENS = 0.35;
  function layout() {
    var vw = stage.clientWidth, vh = stage.clientHeight;
    var shrink = Math.pow(CFG.refCount / Math.max(N, CFG.refCount), 0.35);
    var cw = Math.max(CFG.minCardW, Math.min(CFG.maxCardW, vw * CFG.cardWidthFrac * shrink));
    var ch = cw * CFG.cardAspect;
    if (ch > vh * 0.60) { ch = vh * 0.60; cw = ch / CFG.cardAspect; }
    itemW = cw; itemH = ch;   // the visible card size — used for ring spacing below

    var chordR = (cw * CFG.chordFrac) / (2 * Math.sin(Math.PI / N));
    radius = Math.max(chordR, vw * CFG.radiusFrac, 210);
    DRAG_SENS = Math.min(0.6, 150 / radius);
    ring.style.setProperty('--r', radius + 'px');

    var padX = Math.min(100, Math.max(44, cw * 0.34));   // generous on the sides
    var padY = Math.min(46, Math.max(22, cw * 0.16));    // less needed top/bottom
    var hitW = cw + padX * 2, hitH = ch + padY * 2;

    items.forEach(function (it, i) {
      it.style.setProperty('--iw', hitW + 'px');
      it.style.setProperty('--ih', hitH + 'px');
      it.style.setProperty('--cw', cw + 'px');
      it.style.setProperty('--ch', ch + 'px');
      it.style.transform = 'rotateY(' + (i * step) + 'deg) translateZ(' + radius + 'px)';
    });
  }

  /* ---- state ----------------------------------------------- */
  var rot = 0, vel = 0;
  var dragging = false;
  var overStage = false;
  var pendIdx = -1;
  var pendSince = 0;            // when pendIdx last changed — debounces hover-to-centre
  var pointerX = 0.5;          // 0..1 across the stage, for the hover jog-wheel
  var lastMoveT = 0;
  var focusIdx = 0;
  var snapIdx = -1;            // a card clicked-to-centre and held
  var releaseTimer = null, releaseArmedFor = -1;
  var warping = false;
  var IDLE = reduce ? 0 : CFG.idleSpeed;

  function clearRelease() { clearTimeout(releaseTimer); releaseTimer = null; releaseArmedFor = -1; }
  function armRelease(idx) {
    releaseArmedFor = idx;
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(function () {
      if (snapIdx === idx && !warping) snapIdx = -1;   // let it drift again
    }, CFG.holdMs);
  }

  function argMaxCos() {
    var best = 0, bc = -Infinity;
    for (var i = 0; i < N; i++) { var c = cosAt(i, rot); if (c > bc) { bc = c; best = i; } }
    return best;
  }

  function commitFocus(i) {
    if (i === focusIdx || i < 0) return;
    focusIdx = i;
    var it = items[i];
    labelEl.classList.add('swapping');
    clearTimeout(commitFocus._t);
    commitFocus._t = setTimeout(function () {
      nameEl.textContent = it.getAttribute('data-name') || '';
      descEl.textContent = it.getAttribute('data-desc') || '';
      if (noEl) noEl.textContent = pad(i + 1) + ' / ' + pad(N);
      labelEl.classList.remove('swapping');
    }, 160);
  }

  /* ---- loop ---------------------------------------------- */
  var lastT = now(), raf = 0;
  function frame(t) {
    var dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;

    if (warping || dragging) {
      /* rot held (drag writes it directly) */
    } else if (snapIdx >= 0) {
      rot += shortDelta(-snapIdx * step, rot) * Math.min(1, dt * CFG.snapEase);
      vel = 0;
    } else if (reduce) {
      vel *= Math.pow(0.90, dt * 60);
      rot += vel * dt;
    } else {
      var target = IDLE, easeRate = CFG.approach;
      if (overStage) {
        if ((t - lastMoveT) > CFG.restDelay) {
          target = CFG.restSpeed * (vel >= 0 ? 1 : -1) || CFG.restSpeed;
        } else {
          // jog-wheel: side of the ring the cursor is on sets the direction,
          // distance from centre sets the speed — the middle band is slow.
          // Uses a slower ease-rate than everything else so it visibly
          // winds up to speed instead of snapping there.
          var s = (pointerX - 0.5) * 2;                     // -1 (left) .. +1 (right)
          var mag = Math.min(1, Math.abs(s));
          target = CFG.hoverDir * -Math.sign(s || 1) * (CFG.restSpeed + mag * (CFG.hoverSpeed - CFG.restSpeed));
          easeRate = CFG.hoverAccel;
        }
      }
      if (Math.abs(vel) > Math.abs(target) + 40) vel *= Math.pow(CFG.flickDecay, dt * 60);
      vel += (target - vel) * Math.min(1, dt * easeRate);
      rot += vel * dt;
    }
    rot = ((rot % 360) + 360) % 360;
    ring.style.setProperty('--rot', rot.toFixed(3) + 'deg');

    for (var i = 0; i < N; i++) {
      var c = cosAt(i, rot);
      var f = clamp01((c + 0.4) / 1.4);
      var it = items[i];
      it.style.setProperty('--f', f.toFixed(3));
      // only the 3 cards nearest the viewer (front + its two immediate
      // neighbours) take clicks — everything further round is inert, so
      // a card you can barely see edge-on can't steal a click
      var hittable = !warping && c > CFG.clickCos;
      it.style.pointerEvents = hittable ? 'auto' : 'none';
      it.classList.toggle('is-clickable', hittable);
      it.classList.toggle('is-near', c > CFG.clickCos);
      it.classList.toggle('is-centred', c > CFG.centreCos);
      var v = it.querySelector('video');
      if (v) {
        if (c > 0.06) { if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
        else if (!v.paused) v.pause();
      }
    }

    // hovering one of the 3 nearest cards for a moment auto-centres it —
    // gated on real pointer movement (pendIdx only changes on pointermove)
    // and a short dwell, so the ring turning under a still cursor can never
    // re-trigger this on its own
    if (!dragging && !warping && pendIdx >= 0 && snapIdx !== pendIdx &&
        cosAt(pendIdx, rot) > CFG.hoverCentreCos && (t - pendSince) > CFG.hoverCentreDelay) {
      clearRelease();
      snapIdx = pendIdx;
    }

    // a held card that has actually arrived at centre starts its hold clock
    if (snapIdx >= 0 && releaseArmedFor !== snapIdx && cosAt(snapIdx, rot) >= CFG.centreCos) {
      armRelease(snapIdx);
    }

    if (Math.abs(vel) <= CFG.labelHoldVel || snapIdx >= 0) {
      var cand = snapIdx >= 0 ? snapIdx : argMaxCos();
      if (cand !== focusIdx && (cosAt(cand, rot) - cosAt(focusIdx, rot)) > CFG.hysteresis) commitFocus(cand);
      else if (snapIdx >= 0 && cand !== focusIdx) commitFocus(cand);
    }
    for (var k = 0; k < N; k++) {
      items[k].classList.toggle('is-front', k === focusIdx);
      items[k].classList.toggle('is-hover', k === pendIdx && cosAt(k, rot) > CFG.clickCos);
    }

    raf = requestAnimationFrame(frame);
  }

  /* ---- drag + hover ------------------------------------- */
  var grabX = 0, grabRot = 0, moved = 0, hist = [], grabId = 0, captured = false;

  viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });
  viewport.addEventListener('pointerenter', function () { overStage = true; lastMoveT = now(); });
  viewport.addEventListener('pointerleave', function () { overStage = false; pendIdx = -1; });

  viewport.addEventListener('pointerdown', function (e) {
    if (warping) return;
    dragging = true; moved = 0; pendIdx = -1; snapIdx = -1;   // a drag releases a held card
    clearRelease();
    grabX = e.clientX; grabRot = rot; vel = 0;
    grabId = e.pointerId; captured = false;
    hist = [{ x: e.clientX, t: now() }];
  });

  viewport.addEventListener('pointermove', function (e) {
    if (dragging) {
      if (e.buttons === 0) { endDrag(); return; }
      // NET displacement from the press point — not a running sum of every
      // micro-jitter the mouse/trackpad reports, which was falsely reading
      // as "you dragged" on an ordinary still click and swallowing it
      moved = Math.max(moved, Math.abs(e.clientX - grabX));
      // Only capture the pointer once this is really a drag. Capturing on
      // pointerdown re-targets the click event to the viewport, so a plain
      // click on a card never reached the card's own click handler.
      if (!captured && moved > 4) {
        captured = true;
        viewport.classList.add('dragging');
        try { viewport.setPointerCapture(grabId); } catch (x) {}
      }
      if (!captured) return;
      rot = grabRot + (e.clientX - grabX) * DRAG_SENS;
      hist.push({ x: e.clientX, t: now() });
      if (hist.length > 6) hist.shift();
      return;
    }
    if (!finePointer) return;
    lastMoveT = now();
    var rect = stage.getBoundingClientRect();
    pointerX = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var card = el && el.closest ? el.closest('.ring__item') : null;
    var newIdx = card ? items.indexOf(card) : -1;
    if (newIdx !== pendIdx) { pendIdx = newIdx; pendSince = now(); }
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (captured) { try { viewport.releasePointerCapture(grabId); } catch (x) {} }
    captured = false;
    viewport.classList.remove('dragging');
    var a = hist[0], b = hist[hist.length - 1];
    if (a && b && b.t > a.t) {
      var pxs = (b.x - a.x) / ((b.t - a.t) / 1000);
      vel = Math.max(-1400, Math.min(1400, pxs * DRAG_SENS));
    }
    hist = [];
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('blur', endDrag);

  /* ---- click: centre + hold, then warp-in --------------------- */
  items.forEach(function (it, i) {
    it.addEventListener('click', function (e) {
      e.preventDefault();
      if (moved > 8 || warping) return;          // that was a drag, not a click
      flashCard(it);
      if (cosAt(i, rot) >= CFG.centreCos || (snapIdx === i && Math.abs(shortDelta(-i * step, rot)) < 2)) {
        warpInto(it, i);                          // already centred → go in
      } else {
        clearRelease();
        snapIdx = i;                              // glide to centre and hold
      }
    });
  });

  function flashCard(it) {
    it.classList.remove('is-flash'); void it.offsetWidth;  // restart the animation if clicked again quickly
    it.classList.add('is-flash');
    setTimeout(function () { it.classList.remove('is-flash'); }, 560);
  }

  /* ---- keyboard step (visible prev/next buttons were removed —
     clicking any card now does that job; arrow keys still work) ------ */
  function stepTo(dir) {
    clearRelease();
    snapIdx = ((argMaxCos() + dir) % N + N) % N;
    vel = 0;
  }

  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'listbox');
  viewport.setAttribute('aria-label', 'Portfolio sections — rotate to browse, Enter to open');
  viewport.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { stepTo(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { stepTo(1); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      var idx = focusIdx;
      if (cosAt(idx, rot) >= CFG.centreCos) warpInto(items[idx], idx);
      else snapIdx = idx;
      e.preventDefault();
    }
  });

  /* ============================================================
     WARP-INTO-CARD TRANSITION  (zoom + light-speed streaks)
     ============================================================ */
  function warpInto(it, i) {
    var href = it.getAttribute('href');
    if (!href || warping) return;
    clearRelease();
    warping = true;
    snapIdx = i;

    if (reduce) {
      document.body.style.transition = 'opacity .22s ease';
      document.body.style.opacity = '0';
      setTimeout(function () { location.href = href; }, 230);
      return;
    }

    var media = it.querySelector('.ring__media');
    var r = media.getBoundingClientRect();
    var ov = document.createElement('div');
    ov.className = 'warp';
    var cv = document.createElement('canvas');
    cv.className = 'warp-canvas';
    ov.appendChild(cv);

    var card = media.cloneNode(true);
    card.className = 'warp-card';
    card.style.left = r.left + 'px';
    card.style.top = r.top + 'px';
    card.style.width = r.width + 'px';
    card.style.height = r.height + 'px';
    card.style.setProperty('--dx', (window.innerWidth / 2 - (r.left + r.width / 2)) + 'px');
    card.style.setProperty('--dy', (window.innerHeight / 2 - (r.top + r.height / 2)) + 'px');
    ov.appendChild(card);
    document.body.appendChild(ov);

    runWarpCanvas(cv, CFG.warpMs);
    requestAnimationFrame(function () {
      ov.classList.add('go');
      card.classList.add('go');
    });
    setTimeout(function () { location.href = href; }, CFG.warpMs);
  }

  function runWarpCanvas(cv, ms) {
    var ctx = cv.getContext('2d');
    var w = cv.width = window.innerWidth, h = cv.height = window.innerHeight;
    var cx = w / 2, cy = h / 2, maxR = Math.hypot(w, h);
    var streaks = [];
    for (var i = 0; i < 260; i++) {
      streaks.push({ a: Math.random() * Math.PI * 2, r: Math.random() * maxR * 0.28, v: 0.4 + Math.random() * 2.2 });
    }
    var t0 = performance.now();
    (function loop(t) {
      var k = (t - t0) / ms;                          // 0..1
      ctx.fillStyle = 'rgba(8,9,11,' + (0.22 + 0.55 * k) + ')';
      ctx.fillRect(0, 0, w, h);
      var accel = 1 + k * k * 26;                      // ease-in — "launch"
      ctx.lineCap = 'round';
      for (var i = 0; i < streaks.length; i++) {
        var s = streaks[i];
        var r0 = s.r;
        s.r += s.v * accel;
        var far = Math.min(1, s.r / (maxR * 0.9));
        var x0 = cx + Math.cos(s.a) * r0, y0 = cy + Math.sin(s.a) * r0;
        var x1 = cx + Math.cos(s.a) * s.r, y1 = cy + Math.sin(s.a) * s.r;
        ctx.strokeStyle = 'rgba(255,' + (206 - far * 60 | 0) + ',' + (150 + far * 50 | 0) + ',' + (0.12 + far * 0.7) + ')';
        ctx.lineWidth = 0.5 + far * 2.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        if (s.r > maxR) { s.r = 0; }
      }
      if (k < 1.1) requestAnimationFrame(loop);
    })(t0);
  }

  /* ---- boot ------------------------------------------- */
  window.addEventListener('resize', layout);
  layout();
  nameEl.textContent = items[0].getAttribute('data-name') || '';
  descEl.textContent = items[0].getAttribute('data-desc') || '';
  if (noEl) noEl.textContent = '01 / ' + pad(N);
  raf = requestAnimationFrame(frame);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { if (!raf) { lastT = now(); raf = requestAnimationFrame(frame); } }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.02 }).observe(stage);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) { lastT = now(); raf = requestAnimationFrame(frame); }
  });
})();
