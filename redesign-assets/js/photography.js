/* ============================================================
   BRANDON YUEN — REDESIGN · PHOTOGRAPHY
   The corridor: 17 frames hung down a receding 3D hall.
   Page scroll flies the camera forward through it; a
   perspective floor + ceiling grid stream past; the whole
   space leans toward the pointer and banks as you go deeper.
   Hover a frame → it steps toward you and squares up.
   Click → full-bleed viewer, corridor pushed back + blurred.
   Reduced motion / no-JS → a plain responsive column.
   ============================================================ */
(function () {
  'use strict';

  var hallScroll = document.getElementById('hall-scroll');
  var hall  = document.getElementById('hall');
  var space = document.getElementById('hall-space');
  var viewer = document.getElementById('viewer');
  if (!hall || !space) return;

  var frames = [].slice.call(space.querySelectorAll('.hframe'));
  var N = frames.length;
  if (!N) return;

  var floor = space.querySelector('.hall__floor');
  var ceil  = space.querySelector('.hall__ceil');
  var capN  = document.getElementById('hall-n');
  var capT  = document.getElementById('hall-t');
  var vImg  = document.getElementById('viewer-img');
  var vNo   = document.getElementById('viewer-no');
  var vId   = document.getElementById('viewer-id');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine   = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  var now = function () { return performance.now(); };
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

  /* ---------- viewer (shared by both modes) ---------- */
  var vIdx = 0, vOpen = false, lastFocus = null;

  function vFill(i, swap) {
    vIdx = (i % N + N) % N;
    var f = frames[vIdx];
    var src = f.getAttribute('data-src');
    var label = f.getAttribute('data-id') || 'Photograph';
    var rot = f.getAttribute('data-rot') || '';
    if (swap) {
      viewer.classList.add('is-swapping');
      setTimeout(function () {
        vImg.src = src; vImg.alt = label;
        if (rot) vImg.setAttribute('data-rot', rot); else vImg.removeAttribute('data-rot');
        viewer.classList.remove('is-swapping');
      }, 140);
    } else {
      vImg.src = src; vImg.alt = label;
      if (rot) vImg.setAttribute('data-rot', rot); else vImg.removeAttribute('data-rot');
    }
    if (vNo) vNo.textContent = pad(vIdx + 1) + ' / ' + N;
    if (vId) vId.textContent = label;
    try { history.replaceState(null, '', '#frame-' + (vIdx + 1)); } catch (e) {}
  }
  function vLoad(i) {
    if (vOpen) return;
    lastFocus = document.activeElement;
    vFill(i, false);
    document.body.classList.add('viewer-open');
    viewer.classList.add('open');
    viewer.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    vOpen = true;
    var cb = viewer.querySelector('.viewer__close'); if (cb) cb.focus();
  }
  function vClose() {
    vOpen = false;
    viewer.classList.remove('open');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('viewer-open');
    document.documentElement.style.overflow = '';
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function vStep(d) { vFill(vIdx + d, true); }

  if (viewer) {
    viewer.addEventListener('click', function (e) {
      if (e.target === viewer || e.target.classList.contains('viewer__stage')) vClose();
    });
    var cB = viewer.querySelector('.viewer__close');
    var pB = viewer.querySelector('.viewer__nav--prev');
    var nB = viewer.querySelector('.viewer__nav--next');
    if (cB) cB.addEventListener('click', vClose);
    if (pB) pB.addEventListener('click', function () { vStep(-1); });
    if (nB) nB.addEventListener('click', function () { vStep(1); });

    var tsX = 0, tsY = 0;
    viewer.addEventListener('touchstart', function (e) {
      tsX = e.touches[0].clientX; tsY = e.touches[0].clientY;
    }, { passive: true });
    viewer.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - tsX, dy = e.changedTouches[0].clientY - tsY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) vStep(dx < 0 ? 1 : -1);
      else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) vClose();
    }, { passive: true });
  }
  document.addEventListener('keydown', function (e) {
    if (!vOpen) return;
    if (e.key === 'Escape') vClose();
    else if (e.key === 'ArrowLeft') vStep(-1);
    else if (e.key === 'ArrowRight') vStep(1);
  });
  frames.forEach(function (f) {
    f.addEventListener('click', function (e) { e.preventDefault(); });   /* real open happens at hall level */
  });

  var mHash = /^#frame-(\d+)$/.exec(location.hash || '');
  function openFromHash() {
    if (mHash) { var k = parseInt(mHash[1], 10) - 1; if (k >= 0 && k < N) vLoad(k); }
  }

  /* ---------- flat fallback ---------- */
  if (reduce) { hall.classList.add('hall--flat'); openFromHash(); return; }

  /* ---------- the corridor ---------- */
  var CFG = {
    gap: 660,          /* Z between frames */
    camLead: 560,      /* how far ahead the camera starts */
    camTail: 560,      /* travel past the last frame */
    passStart: 560,    /* ez at which a frame starts peeling to its side */
    exitTwist: 42,     /* deg a frame turns away as you pass it */
    hoverZ: 150,
    tiltMax: 6,        /* pointer lean */
    spinMax: 10,       /* whole lane banks as you go deeper */
    intent: 80,
    farCull: 3400,     /* frames deeper than this aren't drawn at all */
    flyEase: 0.12, tiltEase: 0.08, hzEase: 0.16
  };

  var fw = 300, fh = 400, totalZ = 1;
  var fly = -CFG.camLead, flyT = -CFG.camLead;
  var tiltX = 0, tiltY = 0, spin = 0, lastSpin = 0;
  var pIn = false, pX = 0.5, pY = 0.5;
  var hot = -1, nearIdx = -1, capIdx = -1;
  var pCentre = false;                 /* pointer in the central band → step the focused frame up */
  var hz = frames.map(function () { return 0; });
  var running = true;

  /* --- perf: cache scroll geometry so tick() never reads layout --- */
  var TILE = 121;                      /* one grid cell (matches the CSS repeat) */
  var scrollBase = 0, scrollSpan = 1;
  var scrollY = window.pageYOffset || 0;
  var lastFlow = null, lastSpaceT = '';
  /* last written per-frame state — only touch the DOM when it actually changes */
  var lastT = new Array(N), lastO = new Array(N), lastV = new Array(N);

  function measure() {
    var r = hallScroll ? hallScroll.getBoundingClientRect() : { top: 0, height: 0 };
    scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    scrollBase = r.top + scrollY;
    scrollSpan = Math.max(1, (hallScroll ? hallScroll.offsetHeight : 0) - hall.clientHeight);
  }
  window.addEventListener('scroll', function () {
    scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  }, { passive: true });

  var META = frames.map(function (_, i) {
    return {
      side: (i % 2 === 0) ? -1 : 1,   /* which way it peels off as you pass */
      y: ((i % 3) - 1) * 26,
      z: i * CFG.gap
    };
  });

  function layout() {
    var vw = hall.clientWidth, vh = hall.clientHeight;
    fw = Math.max(200, Math.min(470, vw * 0.30));
    fh = fw;                                   /* square cards — consistent for every photo */
    if (fh > vh * 0.84) { fh = vh * 0.84; fw = fh; }
    frames.forEach(function (f) {
      f.style.setProperty('--fw', fw + 'px');
      f.style.setProperty('--fh', fh + 'px');
    });
    totalZ = (N - 1) * CFG.gap + CFG.camTail;
    if (hallScroll) hallScroll.style.height = (vh + totalZ * 0.82) + 'px';
    /* force every frame to repaint its transform next tick */
    for (var i = 0; i < N; i++) { lastT[i] = lastO[i] = lastV[i] = null; }
    lastSpaceT = ''; lastFlow = null;
    measure();
    if (capN) capN.textContent = pad(1) + ' / ' + N;     /* right even if photos were added */
  }

  function progress() {
    return clamp((scrollY - scrollBase) / scrollSpan, 0, 1);
  }

  function render() {
    /* whole lane leans to the pointer + banks with depth — one composited write */
    var st = 'rotateX(' + (tiltX * 100 | 0) / 100 + 'deg) rotateY(' + ((tiltY + spin) * 100 | 0) / 100 + 'deg)';
    if (st !== lastSpaceT) { space.style.transform = st; lastSpaceT = st; }

    /* streaming floor/ceil grid — a composited translate on a child, no repaint */
    var flow = (((fly * 0.7) % TILE) + TILE) % TILE;
    var fq = (flow * 10 | 0) / 10;
    if (fq !== lastFlow) {
      var fv = (-fq).toFixed(1) + 'px';
      if (floor) floor.style.setProperty('--flow', fv);
      if (ceil) ceil.style.setProperty('--flow', fv);
      lastFlow = fq;
    }

    var exitX = fw * 1.85;
    var nearest = -1, nearestAbs = 1e9;
    for (var i = 0; i < N; i++) {
      var m = META[i], f = frames[i];
      var ez = m.z - fly;                          /* distance ahead of the camera */

      /* only ~6 frames deep are ever on screen — cull the rest so the
         per-frame cost stays flat no matter how many photos exist */
      if (ez < -CFG.camLead - 120 || ez > CFG.farCull) {
        if (lastV[i] !== 'h') { f.style.visibility = 'hidden'; lastV[i] = 'h'; }
        continue;
      }
      if (lastV[i] !== 'v') { f.style.visibility = 'visible'; lastV[i] = 'v'; }

      /* 0 while far down the lane → 1 once fully passed behind the camera */
      var pass = clamp((CFG.passStart - ez) / (CFG.passStart + CFG.camLead), 0, 1);
      var e = pass * pass;                         /* ease-in the peel */
      var hv = hz[i];                              /* hover step toward camera */

      var x = m.side * exitX * e;
      var yaw = m.side * CFG.exitTwist * e + (tiltY + spin) * -0.15;
      var zc = -ez + hv;
      var t =
        'translate3d(' + (x * 10 | 0) / 10 + 'px,' + ((m.y - hv * 0.12) * 10 | 0) / 10 + 'px,' + (zc * 10 | 0) / 10 + 'px) ' +
        'rotateY(' + (yaw * 100 | 0) / 100 + 'deg)';
      if (t !== lastT[i]) { f.style.transform = t; lastT[i] = t; }

      var op = 1;
      if (ez < 0) op = clamp((ez + CFG.camLead + 120) / (CFG.camLead + 60), 0, 1);
      if (ez > totalZ - 260) op = Math.min(op, clamp((totalZ + 200 - ez) / 460, 0, 1));
      if (ez > CFG.farCull - 700) op = Math.min(op, clamp((CFG.farCull - ez) / 700, 0, 1));
      var oq = (op * 100 | 0) / 100;
      if (oq !== lastO[i]) { f.style.opacity = oq; lastO[i] = oq; }

      var hotNow = (i === nearIdx && hv > 14);
      if (hotNow !== (f._hot === true)) { f.classList.toggle('is-hot', hotNow); f._hot = hotNow; }

      if (ez > -70 && Math.abs(ez) < nearestAbs) { nearestAbs = Math.abs(ez); nearest = i; }
    }
    nearIdx = nearest;

    if (capN && nearest !== -1 && nearest !== capIdx) {
      capIdx = nearest;
      capN.textContent = pad(nearest + 1) + ' / ' + N;
      if (capT) capT.textContent = frames[nearest].getAttribute('data-id');
    }
  }

  var isDeep = false;

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);

    var prog = progress();
    flyT = -CFG.camLead + prog * (totalZ + CFG.camLead);
    spin = (prog - 0.15) * CFG.spinMax;      /* starts near straight, banks as you go deeper */

    var df = flyT - fly;
    if (Math.abs(df) < 0.15) fly = flyT; else fly += df * CFG.flyEase;

    var deepNow = prog > 0.02;
    if (deepNow !== isDeep) { hall.classList.toggle('is-deep', deepNow); isDeep = deepNow; }

    var ty = (pIn && fine) ? (pX - 0.5) * 2 * CFG.tiltMax : 0;
    var tx = (pIn && fine) ? -(pY - 0.5) * 2 * CFG.tiltMax * 0.7 : 0;
    tiltX += (tx - tiltX) * CFG.tiltEase;
    tiltY += (ty - tiltY) * CFG.tiltEase;

    /* the frame in front of you steps up whenever the pointer is in the central band */
    hot = (pCentre && nearIdx !== -1) ? nearIdx : -1;
    var hzMoving = false;
    for (var i = 0; i < N; i++) {
      var tgt = (i === hot) ? CFG.hoverZ : 0;
      var d = tgt - hz[i];
      if (Math.abs(d) < 0.4) hz[i] = tgt; else { hz[i] += d * CFG.hzEase; hzMoving = true; }
    }

    /* idle: nothing is actually moving → skip the render entirely */
    var settled =
      fly === flyT &&
      Math.abs(spin - lastSpin) < 0.002 &&
      Math.abs(tx - tiltX) < 0.004 && Math.abs(ty - tiltY) < 0.004 &&
      !hzMoving;
    if (settled && capIdx !== -1) return;
    lastSpin = spin;

    render();
  }

  var hallRect = null;
  function refreshHallRect() { hallRect = hall.getBoundingClientRect(); }
  hall.addEventListener('pointermove', function (e) {
    if (!hallRect) refreshHallRect();
    pX = (e.clientX - hallRect.left) / hallRect.width;
    pY = (e.clientY - hallRect.top) / hallRect.height;
    pIn = true;
    pCentre = pX > 0.24 && pX < 0.76 && pY > 0.18 && pY < 0.9;
  }, { passive: true });
  hall.addEventListener('pointerleave', function () { pIn = false; pCentre = false; }, { passive: true });

  /* click / tap anywhere on the focused frame opens it */
  var downX = 0, downY = 0;
  hall.addEventListener('pointerdown', function (e) { downX = e.clientX; downY = e.clientY; });
  hall.addEventListener('pointerup', function (e) {
    var moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    if (moved > 10 || nearIdx === -1) return;
    var r = hall.getBoundingClientRect();
    var cx = (e.clientX - r.left) / r.width, cy = (e.clientY - r.top) / r.height;
    if (cx > 0.2 && cx < 0.8 && cy > 0.12 && cy < 0.92) vLoad(nearIdx);
  });

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { layout(); refreshHallRect(); }, 120);
  }, { passive: true });
  window.addEventListener('load', function () { measure(); refreshHallRect(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; requestAnimationFrame(tick); }
  });

  layout();
  refreshHallRect();
  requestAnimationFrame(tick);
  openFromHash();
})();
