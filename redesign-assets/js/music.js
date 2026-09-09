/* ============================================================
   MUSIC  —  "three-track visual archive"
   A ledger of rows. Click a row → it opens in place into a
   now-playing panel with a live, audio-reactive canvas waveform.
   No autoplay. Keyboard + touch. Honours prefers-reduced-motion.
   Element-guarded: does nothing on pages without #mx-list.
   ============================================================ */
(function () {
  'use strict';

  var list = document.getElementById('mx-list');
  if (!list) return;
  var tracks = [].slice.call(list.querySelectorAll('.mx-track'));
  if (!tracks.length) return;

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* waveform palette — pulled from CSS so the music page's sage theme
     (or any future theme) drives the canvas without touching JS */
  function cssv(name, fb) {
    try { var v = getComputedStyle(document.body).getPropertyValue(name).trim(); return v || fb; }
    catch (e) { return fb; }
  }
  var WC = {
    played: cssv('--wave-played', 'rgba(240,170,108,0.98)'),
    mid: cssv('--wave-mid', 'rgba(217,138,75,0.95)'),
    deep: cssv('--wave-deep', 'rgba(138,82,34,0.85)'),
    un: cssv('--wave-un', 'rgba(237,234,226,0.14)'),
    glow: cssv('--wave-glow', 'rgba(240,170,108,0.28)'),
    head: cssv('--wave-head', 'rgba(245,190,140,0.95)')
  };

  var AC = window.AudioContext || window.webkitAudioContext;
  var audio = new Audio();
  audio.preload = 'metadata';

  var actx = null, analyser = null, srcNode = null, freqBuf = null;
  var active = -1;                 // index of the open row, -1 = none
  var pendingSeek = -1;            // ratio to apply once the media can seek
  var rafId = 0;
  var peaks = {};                  // idx -> Float32Array  |  null (decode failed)
  var durs = {};                   // idx -> seconds
  var blobUrls = {};               // idx -> object URL (fully seekable copy)

  /* ---------- persistent volume ---------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var vol = Math.max(0, Math.min(1, parseFloat(lsGet('mx-vol', '0.8')) || 0.8));
  var muted = lsGet('mx-vol-muted', '0') === '1';
  audio.volume = muted ? 0 : vol;
  var volEl = null, volRange = null, volPct = null;

  /* ---------- helpers ---------- */

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function canSeek() {
    return audio.duration && isFinite(audio.duration) && audio.seekable && audio.seekable.length > 0;
  }
  function seekRatio(ratio) {
    ratio = Math.max(0, Math.min(1, ratio));
    if (canSeek()) {
      try { audio.currentTime = ratio * audio.duration; drawNow(); return; }
      catch (e) {}
    }
    pendingSeek = ratio;                       // apply once the media can seek
    if (active >= 0 && blobUrls[active] && audio.src !== blobUrls[active]) swapToBlob(active);
    else { try { audio.load(); } catch (e) {} }
  }
  function nudge(seconds) {
    if (!canSeek()) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
    drawNow();
  }

  /* ---------- build each row's player panel (enhancement only) ---------- */

  tracks.forEach(function (li, i) {
    var name = li.getAttribute('data-title') || 'Track';
    var cover = li.getAttribute('data-cover') || '';
    var note = li.getAttribute('data-note') || '';
    var head = li.querySelector('.mx-track__head');

    var wrap = document.createElement('div');
    wrap.className = 'mx-track__panelwrap';
    wrap.innerHTML =
      '<div class="mx-track__panel" id="' + li.id + '-panel" role="region" aria-label="' + esc(name) + ' player">' +
        '<div class="mx-track__inner">' +
          '<div class="mx-cover"><img alt="" loading="lazy" decoding="async" draggable="false" src="' + esc(cover) + '"></div>' +
          '<div class="mx-stage">' +
            '<div class="mx-row">' +
              '<div class="mx-transport-row">' +
                '<button class="mx-tbtn mx-tbtn--prev" type="button" aria-label="Previous track"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M13 3 6 8l7 5z" fill="currentColor"/></svg></button>' +
                '<button class="mx-play" type="button" aria-label="Play ' + esc(name) + '">' +
                  '<svg class="mx-ic mx-ic-play" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 3l9 5-9 5z" fill="currentColor"/></svg>' +
                  '<svg class="mx-ic mx-ic-pause" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" hidden><rect x="4" y="3" width="3.2" height="10" fill="currentColor"/><rect x="8.8" y="3" width="3.2" height="10" fill="currentColor"/></svg>' +
                '</button>' +
                '<button class="mx-tbtn mx-tbtn--next" type="button" aria-label="Next track"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3v10M3 3l7 5-7 5z" fill="currentColor"/></svg></button>' +
              '</div>' +
              '<div class="mx-wave" role="slider" tabindex="0" aria-label="Seek ' + esc(name) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00">' +
                '<canvas></canvas>' +
                '<div class="mx-bar"><span class="mx-bar__fill"></span></div>' +
                '<span class="mx-wave__load" hidden>Reading waveform</span>' +
              '</div>' +
            '</div>' +
            '<div class="mx-transport">' +
              '<span class="mx-time"><b class="mx-cur">0:00</b> / <span class="mx-total">--:--</span></span>' +
              (note ? '<span class="mx-note">' + esc(note) + '</span>' : '<span></span>') +
              '<button class="mx-clear" type="button">Clear</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    li.appendChild(wrap);

    head.setAttribute('aria-controls', li.id + '-panel');
    if (!head.getAttribute('aria-label')) head.setAttribute('aria-label', name + ' — play and expand');

    /* --- wire the row --- */
    var wave = li.querySelector('.mx-wave');
    if (reduce) wave.classList.add('is-bare');   // static bar, no canvas motion

    head.addEventListener('click', function () {
      if (active === i) { togglePlay(); }
      else { select(i, true); }
    });

    li.querySelector('.mx-play').addEventListener('click', function (e) {
      e.stopPropagation();
      if (active !== i) select(i, true); else togglePlay();
    });

    li.querySelector('.mx-tbtn--prev').addEventListener('click', function (e) {
      e.stopPropagation();
      select((i - 1 + tracks.length) % tracks.length, true, false);
    });
    li.querySelector('.mx-tbtn--next').addEventListener('click', function (e) {
      e.stopPropagation();
      select((i + 1) % tracks.length, true, false);
    });

    li.querySelector('.mx-clear').addEventListener('click', function (e) {
      e.stopPropagation();
      clear();
    });

    /* seek by pointer anywhere on the waveform / bar */
    function seekFromEvent(e) {
      var r = wave.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      seekRatio(Math.max(0, Math.min(1, x / r.width)));
    }
    wave.addEventListener('pointerdown', function (e) {
      if (active !== i) { select(i, false); }
      seekFromEvent(e);
      var move = function (ev) { seekFromEvent(ev); };
      var up = function () {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    /* keyboard on the waveform slider */
    wave.addEventListener('keydown', function (e) {
      if (active !== i) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(5); }
      else if (e.key === 'Home') { e.preventDefault(); seekRatio(0); }
      else if (e.key === 'End') { e.preventDefault(); seekRatio(0.999); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'PageUp') { e.preventDefault(); nudge(15); }
      else if (e.key === 'PageDown') { e.preventDefault(); nudge(-15); }
    });

    /* fill this row's duration in the ledger as soon as we know it */
    prefetchDuration(i);
  });

  /* ---------- ambient backdrop (blurred cover art of the open track) ---------- */
  var amb = document.createElement('div');
  amb.className = 'mx-amb';
  amb.setAttribute('aria-hidden', 'true');
  amb.innerHTML = '<img alt="" decoding="async">';
  document.body.appendChild(amb);
  var ambImg = amb.querySelector('img');
  function setAmb(i) {
    var c = tracks[i].getAttribute('data-cover');
    if (c && ambImg.getAttribute('src') !== c) ambImg.src = c;
    amb.classList.add('is-on');
  }
  function clearAmb() { amb.classList.remove('is-on'); }

  /* ---------- page-level volume control (below the ledger) ---------- */
  volEl = document.createElement('div');
  volEl.className = 'mx-vol' + (muted ? ' is-muted' : '');
  volEl.innerHTML =
    '<span class="mx-vol__label">Vol</span>' +
    '<input type="range" min="0" max="100" step="1" aria-label="Volume">' +
    '<span class="mx-vol__pct"></span>' +
    '<button class="mx-vol__mute" type="button">' + (muted ? 'Unmute' : 'Mute') + '</button>';
  list.insertAdjacentElement('afterend', volEl);
  volRange = volEl.querySelector('input');
  volPct = volEl.querySelector('.mx-vol__pct');
  var volMute = volEl.querySelector('.mx-vol__mute');

  function paintVol() {
    var pct = Math.round(vol * 100);
    volRange.value = pct;
    volRange.style.setProperty('--v', pct + '%');
    volPct.textContent = pct + '%';
    volEl.classList.toggle('is-muted', muted);
    volMute.textContent = muted ? 'Unmute' : 'Mute';
  }
  function setVol(v, fromUser) {
    vol = Math.max(0, Math.min(1, v));
    if (fromUser && vol > 0) muted = false;
    audio.volume = muted ? 0 : vol;
    lsSet('mx-vol', vol.toFixed(2));
    lsSet('mx-vol-muted', muted ? '1' : '0');
    paintVol();
  }
  function toggleMute() {
    muted = !muted;
    audio.volume = muted ? 0 : vol;
    lsSet('mx-vol-muted', muted ? '1' : '0');
    paintVol();
  }
  volRange.addEventListener('input', function () { setVol(this.value / 100, true); });
  volMute.addEventListener('click', toggleMute);
  paintVol();

  /* ---------- sticky "onboard audio" mini-bar ---------- */
  var mbar = document.createElement('div');
  mbar.className = 'mx-minibar';
  mbar.innerHTML =
    '<button class="mx-minibar__pp" type="button" aria-label="Pause">' +
      '<svg class="mb-play" viewBox="0 0 16 16" aria-hidden="true" hidden><path d="M4 3l9 5-9 5z" fill="currentColor"/></svg>' +
      '<svg class="mb-pause" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3.2" height="10" fill="currentColor"/><rect x="8.8" y="3" width="3.2" height="10" fill="currentColor"/></svg>' +
    '</button>' +
    '<span class="mx-minibar__eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
    '<button class="mx-minibar__title" type="button"><b></b><span></span></button>' +
    '<button class="mx-minibar__toggle" type="button" aria-label="Jump to player">&#9650;</button>';
  document.body.appendChild(mbar);
  var mbN = mbar.querySelector('.mx-minibar__title b');
  var mbT = mbar.querySelector('.mx-minibar__title span');
  var mbPlay = mbar.querySelector('.mb-play');
  var mbPause = mbar.querySelector('.mb-pause');

  function jumpToPlayer() {
    if (active >= 0) tracks[active].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  mbar.querySelector('.mx-minibar__pp').addEventListener('click', togglePlay);
  mbar.querySelector('.mx-minibar__title').addEventListener('click', jumpToPlayer);
  mbar.querySelector('.mx-minibar__toggle').addEventListener('click', jumpToPlayer);

  var rowVisible = tracks.map(function () { return true; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        var k = tracks.indexOf(en.target);
        if (k >= 0) rowVisible[k] = en.isIntersecting;
      });
      paintMinibar();
    }, { threshold: 0.12 });
    tracks.forEach(function (li) { io.observe(li); });
  }

  function paintMinibar() {
    if (active < 0) { mbar.classList.remove('is-shown', 'is-playing'); return; }
    var li = tracks[active];
    mbN.textContent = li.querySelector('.mx-track__n').textContent + ' ';
    mbT.textContent = li.getAttribute('data-title') || '';
    var playing = !audio.paused && !audio.ended;
    mbar.classList.toggle('is-playing', playing);
    if (mbPlay) mbPlay.hidden = playing;
    if (mbPause) mbPause.hidden = !playing;
    mbar.querySelector('.mx-minibar__pp').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    var onScreen = rowVisible[active];
    mbar.classList.toggle('is-shown', !onScreen);
    mbar.classList.toggle('at-player', onScreen);
  }

  /* ---------- audio graph (lazy, created on first gesture) ---------- */

  function ensureCtx() {
    if (actx || !AC) return;
    try {
      actx = new AC();
      srcNode = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      freqBuf = new Uint8Array(analyser.frequencyBinCount);
      srcNode.connect(analyser);
      analyser.connect(actx.destination);
    } catch (e) { actx = null; analyser = null; }
  }

  /* ---------- waveform peaks ---------- */

  function prefetchDuration(i) {
    // a cheap metadata-only probe so the ledger shows real run times
    var a = document.createElement('audio');
    a.preload = 'metadata';
    a.src = tracks[i].getAttribute('data-src');
    a.addEventListener('loadedmetadata', function () {
      durs[i] = a.duration;
      var d = tracks[i].querySelector('[data-dur]');
      if (d) d.textContent = fmt(a.duration);
      if (active === i) setTotal(i);
    });
  }

  function computePeaks(buf, n) {
    var chs = Math.min(2, buf.numberOfChannels);
    var len = buf.length;
    var block = Math.floor(len / n) || 1;
    var out = new Float32Array(n);
    var max = 0.0001;
    for (var b = 0; b < n; b++) {
      var start = b * block, sum = 0, cnt = 0;
      for (var c = 0; c < chs; c++) {
        var data = buf.getChannelData(c);
        for (var k = 0; k < block && start + k < len; k++) {
          var v = data[start + k]; sum += v * v; cnt++;
        }
      }
      var rms = Math.sqrt(sum / (cnt || 1));
      out[b] = rms;
      if (rms > max) max = rms;
    }
    for (var j = 0; j < n; j++) out[j] = Math.pow(out[j] / max, 0.85);  // gentle curve
    return out;
  }

  function loadPeaks(i, cb) {
    if (peaks[i] !== undefined) return cb(peaks[i]);
    var li = tracks[i];
    var loadEl = li.querySelector('.mx-wave__load');
    var wave = li.querySelector('.mx-wave');
    if (loadEl) loadEl.hidden = false;

    fetch(li.getAttribute('data-src'))
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) {
        /* a same-origin blob URL is always fully seekable — swap the
           streaming file src for it so scrubbing works on any host,
           and reuse the exact same bytes for the waveform decode */
        if (!blobUrls[i]) {
          try {
            blobUrls[i] = URL.createObjectURL(new Blob([ab.slice(0)], { type: 'audio/mpeg' }));
            /* swap now only if it won't interrupt anything audible */
            if (active === i && (audio.paused || audio.currentTime < 1)) swapToBlob(i);
          } catch (e) {}
        }
        if (reduce || !AC) { throw 'skip-decode'; }
        ensureCtx();
        var ctx = actx || new AC();
        return ctx.decodeAudioData(ab);
      })
      .then(function (audioBuf) {
        peaks[i] = computePeaks(audioBuf, 160);
        durs[i] = audioBuf.duration;
        if (loadEl) loadEl.hidden = true;
        var d = li.querySelector('[data-dur]');
        if (d) d.textContent = fmt(audioBuf.duration);
        if (active === i) { setTotal(i); drawNow(); }
        cb(peaks[i]);
      })
      .catch(function () {
        peaks[i] = null;                 // no waveform → plain bar
        if (loadEl) loadEl.hidden = true;
        wave.classList.add('is-bare');
        cb(null);
      });
  }

  /* replace the streaming src with the fully-seekable blob, keeping
     playback position and state */
  function swapToBlob(i) {
    if (!blobUrls[i] || active !== i) return;
    if (audio.src === blobUrls[i]) return;
    var t = audio.currentTime || 0;
    var wasPlaying = !audio.paused;
    audio.src = blobUrls[i];
    var apply = function () {
      audio.removeEventListener('loadedmetadata', apply);
      try { audio.currentTime = t; } catch (e) {}
      if (wasPlaying) audio.play().catch(function () {});
      flushPendingSeek();
    };
    audio.addEventListener('loadedmetadata', apply);
    try { audio.load(); } catch (e) {}
  }

  /* ---------- drawing ---------- */

  function grads(cv, ctx, h) {
    if (cv._gh === h && cv._gp) return;
    var p = ctx.createLinearGradient(0, 0, 0, h);
    p.addColorStop(0, WC.played);
    p.addColorStop(0.5, WC.mid);
    p.addColorStop(1, WC.deep);
    var u = ctx.createLinearGradient(0, 0, 0, h);
    u.addColorStop(0, WC.un);
    u.addColorStop(1, WC.un);
    cv._gp = p; cv._gu = u; cv._gh = h;
  }

  function draw(i, played, live) {
    var li = tracks[i];
    var cv = li.querySelector('canvas');
    if (!cv || li.querySelector('.mx-wave').classList.contains('is-bare')) return;
    var pk = peaks[i];
    if (!pk) return;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv._gh = -1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    grads(cv, ctx, h);

    var lall = live ? live.all : 0;
    var lhi = live ? live.hi : 0;
    var n = pk.length, gap = 2;
    var bw = Math.max(1, (w - gap * (n - 1)) / n);
    var mid = h * 0.52;                       /* bias up a touch so the reflection has room */
    var px = Math.max(0, Math.min(w, played * w));

    for (var k = 0; k < n; k++) {
      var x = k * (bw + gap);
      var cxb = x + bw / 2;
      var isPlayed = cxb <= px;
      var near = 1 - Math.min(1, Math.abs(cxb - px) / (h * 0.9));   /* 1 at the playhead */
      var bh = Math.max(2, pk[k] * (h * 0.82));
      if (isPlayed) bh *= 1 + lall * 0.18 + near * lhi * 0.5;
      bh = Math.min(h * 0.94, bh);

      ctx.fillStyle = isPlayed ? cv._gp : cv._gu;
      ctx.fillRect(x, mid - bh / 2, bw, bh);

      /* faint mirrored nub under the bar */
      ctx.globalAlpha = isPlayed ? 0.20 : 0.06;
      ctx.fillRect(x, mid + bh / 2 + 2, bw, Math.min(bh * 0.42, h * 0.26));
      ctx.globalAlpha = 1;
    }

    /* playhead — soft radial bloom + crisp filament */
    var g = ctx.createRadialGradient(px, mid, 0, px, mid, h * 0.9);
    g.addColorStop(0, WC.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.7 + lall * 0.3;
    ctx.fillStyle = g;
    ctx.fillRect(px - h, 0, h * 2, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = WC.head;
    ctx.fillRect(px - 0.75, h * 0.06, 1.5, h * 0.88);
  }

  function setTotal(i) {
    var li = tracks[i];
    var t = li.querySelector('.mx-total');
    if (t) t.textContent = fmt(durs[i] || audio.duration || 0);
  }

  function drawNow() {
    if (active < 0) return;
    var li = tracks[active];
    var d = durs[active] || audio.duration || 0;
    var played = d ? (audio.currentTime / d) : 0;
    draw(active, played, 0);
    var cur = li.querySelector('.mx-cur'); if (cur) cur.textContent = fmt(audio.currentTime);
    var fill = li.querySelector('.mx-bar__fill'); if (fill) fill.style.width = (played * 100) + '%';
    var wave = li.querySelector('.mx-wave');
    if (wave) {
      var pct = Math.round(played * 100);
      wave.setAttribute('aria-valuenow', pct);
      wave.setAttribute('aria-valuetext', fmt(audio.currentTime) + ' of ' + fmt(d));
    }
  }

  function frame() {
    if (active < 0) { rafId = 0; return; }
    var d = durs[active] || audio.duration || 0;
    var played = d ? (audio.currentTime / d) : 0;
    var live = null;
    if (analyser && !audio.paused) {
      analyser.getByteFrequencyData(freqBuf);
      var lo = 0, hi = 0, i;
      for (i = 0; i < 12; i++) lo += freqBuf[i];
      for (i = 40; i < 130; i++) hi += freqBuf[i];
      live = { all: (lo / 12) / 255, hi: (hi / 90) / 255 };
    }
    draw(active, played, live);
    var li = tracks[active];
    var cur = li.querySelector('.mx-cur'); if (cur) cur.textContent = fmt(audio.currentTime);
    var fill = li.querySelector('.mx-bar__fill'); if (fill) fill.style.width = (played * 100) + '%';
    var wave = li.querySelector('.mx-wave');
    if (wave) { wave.setAttribute('aria-valuenow', Math.round(played * 100)); }

    if (!audio.paused) rafId = requestAnimationFrame(frame);
    else { rafId = 0; }
  }

  function startLoop() { if (!rafId) rafId = requestAnimationFrame(frame); }

  /* ---------- transport ---------- */

  function syncIcons() {
    var playing = !audio.paused && !audio.ended && active >= 0;
    tracks.forEach(function (li, i) {
      var on = (i === active && playing);
      var g = li.querySelector('.mx-track__glyph');
      if (g) g.innerHTML = on ? '&#10073;&#10073;' : '&#9654;';
      var pb = li.querySelector('.mx-play');
      if (pb) {
        var ip = pb.querySelector('.mx-ic-play'), ipa = pb.querySelector('.mx-ic-pause');
        if (ip) ip.hidden = on;
        if (ipa) ipa.hidden = !on;
        pb.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + (tracks[i].getAttribute('data-title') || 'track'));
        pb.classList.toggle('is-playing', on);
      }
      li.classList.toggle('is-playing', on);
    });
    paintMinibar();
  }

  function togglePlay() {
    if (active < 0) return;
    if (actx && actx.state === 'suspended') actx.resume();
    if (audio.paused) audio.play().catch(function () {}); else audio.pause();
  }

  function select(i, play, moveFocus) {
    ensureCtx();
    if (actx && actx.state === 'suspended') actx.resume();

    if (active === i) { if (play) togglePlay(); return; }

    // close the previous row
    if (active >= 0) {
      tracks[active].classList.remove('is-active');
      var ph = tracks[active].querySelector('.mx-track__head');
      if (ph) ph.setAttribute('aria-expanded', 'false');
    }

    active = i;
    var li = tracks[i];
    li.classList.add('is-active');
    list.classList.add('has-active');
    li.querySelector('.mx-track__head').setAttribute('aria-expanded', 'true');

    pendingSeek = -1;
    audio.src = blobUrls[i] || li.getAttribute('data-src');
    try { audio.load(); } catch (e) {}   // pull metadata so scrubbing works before first play
    try { audio.currentTime = 0; } catch (e) {}
    setTotal(i);
    drawNow();

    loadPeaks(i, function () { if (active === i) drawNow(); });
    setAmb(i);

    if (play) {
      audio.play().catch(function () {});
    }
    if (moveFocus) {
      var h = li.querySelector('.mx-track__head');
      if (h) h.focus();
    }
    syncIcons();
  }

  function clear() {
    if (active < 0) return;
    var prev = active;
    audio.pause();
    try { audio.currentTime = 0; } catch (e) {}
    var li = tracks[prev];
    li.classList.remove('is-active');
    li.querySelector('.mx-track__head').setAttribute('aria-expanded', 'false');
    list.classList.remove('has-active');
    active = -1;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    clearAmb();
    syncIcons();
    var h = li.querySelector('.mx-track__head');
    if (h) h.focus();
  }

  /* ---------- audio element events ---------- */

  audio.addEventListener('play', function () { syncIcons(); startLoop(); });
  audio.addEventListener('pause', function () { syncIcons(); drawNow(); });
  audio.addEventListener('ended', function () {
    // roll to the next track, keep playing — feels like a continuous set
    var next = (active + 1) % tracks.length;
    if (next === 0) { clear(); }           // stop cleanly at the end of the set
    else select(next, true);
  });
  function flushPendingSeek() {
    if (pendingSeek >= 0 && canSeek()) {
      var r = pendingSeek; pendingSeek = -1;
      try { audio.currentTime = r * audio.duration; } catch (e) {}
      drawNow();
    }
  }
  audio.addEventListener('loadedmetadata', function () {
    if (active >= 0) { durs[active] = audio.duration; setTotal(active); drawNow(); }
    flushPendingSeek();
  });
  audio.addEventListener('loadeddata', flushPendingSeek);
  audio.addEventListener('canplay', flushPendingSeek);
  audio.addEventListener('timeupdate', function () {
    if (rafId) return;                     // rAF loop already covers it while playing
    drawNow();
  });

  /* ---------- global keyboard ---------- */

  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    // volume — works whether or not a track is open
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setVol(vol + 0.05, true); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setVol(vol - 0.05, true); return; }
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMute(); return; }

    if (active < 0) return;
    // let the waveform slider handle its own arrows when it's focused
    var onWave = t && t.classList && t.classList.contains('mx-wave');

    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'Escape') { e.preventDefault(); clear(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select((active - 1 + tracks.length) % tracks.length, true, true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); select((active + 1) % tracks.length, true, true); }
    else if (!onWave && e.key === 'ArrowLeft') { e.preventDefault(); nudge(-5); }
    else if (!onWave && e.key === 'ArrowRight') { e.preventDefault(); nudge(5); }
  });

  /* ---------- resize ---------- */

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { if (active >= 0) drawNow(); }, 120);
  });

  /* pause the loop when the tab is hidden */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    else if (!document.hidden && active >= 0 && !audio.paused) startLoop();
  });

  syncIcons();
})();
