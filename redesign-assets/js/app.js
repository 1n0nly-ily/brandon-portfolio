/* ============================================================
   BRANDON YUEN — REDESIGN  ·  shared behaviour
   Loader · header · scroll reveal · parallax · marquee ·
   scroll-spy · index rows · media guards · music · lightbox
   Every module is guarded by element presence so this one
   file is safe to include on the landing page and every
   section page.
   ============================================================ */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGSAP = typeof window.gsap !== 'undefined';
  var hasST = hasGSAP && typeof window.ScrollTrigger !== 'undefined';
  if (hasST) gsap.registerPlugin(ScrollTrigger);

  var raf = function (fn) { return (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fn); };
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ------------------------------------------------------------
     1 · LOADING CURTAIN
     ------------------------------------------------------------ */
  function initLoader() {
    var loader = document.getElementById('loader');
    if (!loader) { root.classList.remove('is-loading'); return revealStage(); }

    var countEl = loader.querySelector('.loader__count b');
    var barEl = loader.querySelector('.loader__bar');
    var words = loader.querySelectorAll('.loader__word span');
    var statusEl = loader.querySelector('.loader__status');

    document.body.classList.add('loading');

    var seen = false;
    try { seen = sessionStorage.getItem('by_seen') === '1'; } catch (e) {}
    var DUR = (reduce || seen) ? 0.5 : 1.8;

    // wall-clock safety net: never trap the page behind the curtain
    var done = false;
    var _finish = function () { if (done) return; done = true; finish(); };
    setTimeout(_finish, (DUR * 1000) + 2600);

    var state = { n: 0 };
    var stagesAttr = loader.getAttribute('data-stages');
    var stages = stagesAttr ? stagesAttr.split('|') : ['INITIALISING', 'LOADING ASSETS', 'BUILDING LAYOUT', 'COMPOSITING', 'READY'];

    function setStatus(p) {
      if (!statusEl) return;
      statusEl.textContent = stages[Math.min(stages.length - 1, Math.floor(p / 100 * stages.length))];
    }

    function finish() {
      try { sessionStorage.setItem('by_seen', '1'); } catch (e) {}
      document.body.classList.remove('loading');
      loader.classList.add('done');
      if (hasGSAP && !reduce) {
        var tl = gsap.timeline({ onComplete: function () { loader.remove(); } });
        tl.to(loader, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' })
          .add(revealStage, '-=0.5');
      } else {
        loader.style.transition = 'opacity .4s ease';
        loader.style.opacity = '0';
        setTimeout(function () { loader.remove(); }, 420);
        revealStage();
      }
    }

    if (hasGSAP && !reduce) {
      var tl = gsap.timeline();
      tl.to(words, { yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: 0.09 }, 0.1)
        .to(state, {
          n: 100, duration: DUR, ease: 'power2.inOut',
          onUpdate: function () {
            var v = Math.round(state.n);
            if (countEl) countEl.textContent = ('' + v).padStart(3, '0');
            if (barEl) barEl.style.width = v + '%';
            setStatus(v);
          }
        }, 0.15)
        .to({}, { duration: 0.35 })
        .add(_finish);
    } else {
      // no-GSAP / reduced-motion: quick count then drop
      var start = performance.now();
      (function tick(now) {
        var p = Math.min(1, (now - start) / (DUR * 1000));
        var v = Math.round(p * 100);
        if (countEl) countEl.textContent = ('' + v).padStart(3, '0');
        if (barEl) barEl.style.width = v + '%';
        setStatus(v);
        if (p < 1) raf(tick); else _finish();
      })(start);
    }
  }

  /* ------------------------------------------------------------
     2 · STAGED HERO ENTRANCE
     ------------------------------------------------------------ */
  function revealStage() {
    var stage = document.querySelectorAll('.stage');
    if (!stage.length) return;
    stage.forEach(function (el) { el.style.animation = 'none'; }); // take over from the CSS safety net
    if (hasGSAP && !reduce) {
      gsap.fromTo(stage, { opacity: 0, y: 26 }, {
        opacity: 1, y: 0, duration: 1.05, ease: 'power3.out', stagger: 0.08
      });
    } else {
      stage.forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
    }
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  /* ------------------------------------------------------------
     3 · HEADER — scrolled state + mobile menu
     ------------------------------------------------------------ */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (header) {
      var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 36); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    // one button, one position — its label crossfades Menu <-> Close
    // rather than a second "Close" button appearing somewhere else
    var btn = document.querySelector('.hmenu');
    var mnav = document.querySelector('.mnav');
    if (btn && mnav) {
      var open = false;
      var toggle = function (v) {
        open = v;
        mnav.classList.toggle('open', open);
        btn.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.style.overflow = open ? 'hidden' : '';
      };
      btn.addEventListener('click', function () { toggle(!open); });
      mnav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { toggle(false); }); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
    }
  }

  /* ------------------------------------------------------------
     4 · SCROLL REVEAL + PARALLAX
     ------------------------------------------------------------ */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (els.length) {
      if ('IntersectionObserver' in window && !reduce) {
        var io = new IntersectionObserver(function (en) {
          en.forEach(function (e) {
            if (!e.isIntersecting) return;
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        els.forEach(function (el) { io.observe(el); });
        // safety net: anything still hidden after 6s gets shown
        setTimeout(function () { els.forEach(function (el) { el.classList.add('is-in'); }); }, 6000);
      } else {
        els.forEach(function (el) { el.classList.add('is-in'); });
      }
    }

    if (hasST && !reduce) {
      document.querySelectorAll('[data-parallax]').forEach(function (el) {
        var amt = parseFloat(el.getAttribute('data-parallax')) || 12;
        gsap.to(el, {
          yPercent: -amt, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });
    }
  }

  /* ------------------------------------------------------------
     5 · SECTION-PAGE PROGRESS RAIL
     ------------------------------------------------------------ */
  function initRail() {
    var rail = document.querySelector('.railtrack i');
    if (!rail) return;
    var upd = function () {
      var h = document.documentElement;
      var p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
      rail.style.width = Math.max(0, Math.min(1, p)) * 100 + '%';
    };
    window.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  }

  /* ------------------------------------------------------------
     6 · MARQUEE (photography teaser / gallery rows)
     ------------------------------------------------------------ */
  function initMarquee() {
    var rows = document.querySelectorAll('.marq');
    if (!rows.length) return;
    rows.forEach(function (row) {
      var track = row.querySelector('.marq__track');
      if (!track) return;
      // duplicate once for a seamless loop
      track.innerHTML += track.innerHTML;
      var reverse = row.hasAttribute('data-reverse');
      var dist = track.scrollWidth / 2;
      var speed = parseFloat(row.getAttribute('data-speed')) || 38; // seconds for full pass

      if (reduce) return;

      if (hasGSAP) {
        var x = reverse ? [-dist, 0] : [0, -dist];
        var tween = gsap.fromTo(track, { x: x[0] }, { x: x[1], duration: speed, ease: 'none', repeat: -1 });
        row.addEventListener('mouseenter', function () { tween.timeScale(0.15); });
        row.addEventListener('mouseleave', function () { tween.timeScale(1); });
      } else {
        var pos = reverse ? -dist : 0, paused = false, last = performance.now();
        row.addEventListener('mouseenter', function () { paused = true; });
        row.addEventListener('mouseleave', function () { paused = false; });
        (function step(now) {
          var dt = (now - last) / 1000; last = now;
          if (!paused) {
            pos += (reverse ? 1 : -1) * (dist / speed) * dt;
            if (pos <= -dist) pos += dist;
            if (pos >= 0) pos -= dist;
            track.style.transform = 'translateX(' + pos + 'px)';
          }
          raf(step);
        })(last);
      }
    });
  }

  /* ------------------------------------------------------------
     7 · SCROLL-SPY  +  CURRENT-PAGE NAV
     ------------------------------------------------------------ */
  function initSpy() {
    var page = document.body.getAttribute('data-page');
    document.querySelectorAll('.hnav a, .mnav a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (page && (href === page || href === './' + page)) a.setAttribute('aria-current', 'page');
    });

    var spied = document.querySelectorAll('[data-spy]');
    if (!spied.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        document.querySelectorAll('.hnav a[data-spy-target]').forEach(function (a) { a.removeAttribute('aria-current'); });
        var m = document.querySelector('.hnav a[data-spy-target="' + e.target.id + '"]');
        if (m) m.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    spied.forEach(function (s) { io.observe(s); });
  }

  /* ------------------------------------------------------------
     8 · INDEX ROWS — cursor-tracked peek image
     ------------------------------------------------------------ */
  function initIndexRows() {
    if (reduce || !hasGSAP) return;
    document.querySelectorAll('.index-row').forEach(function (row) {
      var peek = row.querySelector('.index-row__peek');
      if (!peek) return;
      row.addEventListener('mousemove', function (e) {
        var r = row.getBoundingClientRect();
        var rel = (e.clientX - r.left) / r.width - 0.5;
        gsap.to(peek, { x: rel * 40, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
      });
      row.addEventListener('mouseleave', function () {
        gsap.to(peek, { x: 0, duration: 0.6, ease: 'power3.out' });
      });
    });
  }

  /* ------------------------------------------------------------
     9 · MEDIA GUARDS (ported from original site)
     ------------------------------------------------------------ */
  function initMediaGuards() {
    document.addEventListener('contextmenu', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    });
    document.querySelectorAll('img,video,audio').forEach(function (el) {
      el.setAttribute('draggable', 'false');
      el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    });
  }

  /* ------------------------------------------------------------
     10 · MUSIC PLAYER  (guarded — only runs where markup exists)
     ------------------------------------------------------------ */
  var TRACKS = [
    { title: 'Winetfye', artist: 'Brandon Yuen', src: 'WEBP/Music Production/winetfyenb-flip.mp3', cover: 'WEBP/Music Production/2.webp' },
    { title: 'Pianoflip', artist: 'Brandon Yuen', src: 'WEBP/Music Production/Pianoflip.mp3', cover: 'WEBP/Music Production/3.webp' },
    { title: 'Pluggnb', artist: 'Brandon Yuen', src: 'WEBP/Music Production/Twice_Fancy_Plug.mp3', cover: 'WEBP/Music Production/4.webp' }
  ];
  function initMusic() {
    var audio = document.getElementById('music-audio');
    var listEl = document.getElementById('track-list');
    if (!audio || !listEl) return;
    var titleEl = document.getElementById('player-title');
    var artistEl = document.getElementById('player-artist');
    var artImg = document.getElementById('player-art-img');
    var fill = document.getElementById('player-progress-fill');
    var bar = document.getElementById('player-progress');
    var btnPlay = document.getElementById('btn-play');
    var iconPlay = document.getElementById('icon-play');
    var iconPause = document.getElementById('icon-pause');
    var btnPrev = document.getElementById('btn-prev');
    var btnNext = document.getElementById('btn-next');
    var idx = 0;

    TRACKS.forEach(function (tk, i) {
      var b = document.createElement('button');
      b.className = 'track-item' + (i === 0 ? ' active' : '');
      b.innerHTML = '<img src="' + tk.cover + '" alt=""><div class="track-item-info"><p class="track-item-title">' + tk.title + '</p><p class="track-item-artist">' + tk.artist + '</p></div>';
      b.addEventListener('click', function () { load(i, true); });
      listEl.appendChild(b);
    });
    function icon() {
      var playing = !audio.paused && !audio.ended;
      if (iconPlay) iconPlay.style.display = playing ? 'none' : 'block';
      if (iconPause) iconPause.style.display = playing ? 'block' : 'none';
    }
    function load(i, autoplay) {
      idx = (i + TRACKS.length) % TRACKS.length;
      var tk = TRACKS[idx];
      audio.src = tk.src;
      if (titleEl) titleEl.textContent = tk.title;
      if (artistEl) artistEl.textContent = tk.artist;
      if (artImg) artImg.src = tk.cover;
      if (fill) fill.style.width = '0%';
      [].forEach.call(listEl.children, function (el, k) { el.classList.toggle('active', k === idx); });
      if (autoplay) audio.play().catch(function () {});
      icon();
    }
    if (btnPlay) btnPlay.addEventListener('click', function () {
      if (!audio.src) load(0, false);
      if (audio.paused) audio.play().catch(function () {}); else audio.pause();
      icon();
    });
    if (btnPrev) btnPrev.addEventListener('click', function () { load(idx - 1, true); });
    if (btnNext) btnNext.addEventListener('click', function () { load(idx + 1, true); });
    audio.addEventListener('ended', function () { load(idx + 1, true); });
    audio.addEventListener('play', icon);
    audio.addEventListener('pause', icon);
    audio.addEventListener('timeupdate', function () {
      if (!audio.duration || !fill) return;
      fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    });
    if (bar) bar.addEventListener('click', function (e) {
      if (!audio.duration) return;
      var r = bar.getBoundingClientRect();
      audio.currentTime = (e.clientX - r.left) / r.width * audio.duration;
    });
    load(0, false);
  }

  /* ------------------------------------------------------------
     11 · LIGHTBOX  (guarded)
     ------------------------------------------------------------ */
  function initLightbox() {
    var tiles = [].slice.call(document.querySelectorAll('[data-lightbox] a, .photo-gallery .photo-tile'));
    var lb = document.getElementById('lightbox');
    if (!tiles.length || !lb) return;
    var imgEl = document.getElementById('lightbox-img');
    var counter = document.getElementById('lightbox-counter');
    var cur = 0;
    function show(i) {
      cur = (i + tiles.length) % tiles.length;
      var im = tiles[cur].querySelector('img');
      imgEl.src = im.src; imgEl.alt = im.alt || '';
      if (counter) counter.textContent = (cur + 1) + ' / ' + tiles.length;
    }
    function open(i) { show(i); lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
    function close() { lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
    tiles.forEach(function (t, i) { t.addEventListener('click', function (e) { e.preventDefault(); open(i); }); });
    var c = document.getElementById('lightbox-close'); if (c) c.addEventListener('click', close);
    var p = document.getElementById('lightbox-prev'); if (p) p.addEventListener('click', function () { show(cur - 1); });
    var n = document.getElementById('lightbox-next'); if (n) n.addEventListener('click', function () { show(cur + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    });
  }

  /* ------------------------------------------------------------
     boot
     ------------------------------------------------------------ */
  ready(function () {
    initHeader();
    initMediaGuards();
    initReveal();
    initRail();
    initMarquee();
    initSpy();
    initIndexRows();
    initMusic();
    initLightbox();
    initLoader(); // last: kicks the entrance
  });
})();
