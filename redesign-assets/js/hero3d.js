/* ============================================================
   HERO 3D CENTREPIECE  —  orbital wireframe (Three.js r128)
   Draggable, inertial, auto-rotating. Pure geometry, no assets.
   Degrades to a static SVG (.hero__fallback) if WebGL/RM blocks it.
   ============================================================ */
(function () {
  var mount = document.getElementById('hero-canvas');
  if (!mount || typeof THREE === 'undefined') return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return; // CSS hides the canvas + shows fallback

  // --- WebGL capability probe -------------------------------------------------
  try {
    var test = document.createElement('canvas');
    if (!(test.getContext('webgl') || test.getContext('experimental-webgl'))) return;
  } catch (e) { return; }

  var W = mount.clientWidth || window.innerWidth;
  var H = mount.clientHeight || window.innerHeight;

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  mount.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
  camera.position.set(0, 0.6, 9.4);

  var rig = new THREE.Group();          // everything we spin
  scene.add(rig);
  rig.rotation.x = 0.42;

  var AMBER = 0xF0AA6C, ICE = 0x6FA3C7, INK = 0x8A8880;

  // --- core sphere (the "body") --------------------------------------------
  var sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.7, 2),
    new THREE.MeshBasicMaterial({ color: INK, wireframe: true, transparent: true, opacity: 0.22 })
  );
  rig.add(sphere);

  var glow = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.72, 2),
    new THREE.MeshBasicMaterial({ color: AMBER, wireframe: true, transparent: true, opacity: 0.06 })
  );
  rig.add(glow);

  // --- orbital rings -------------------------------------------------------
  var rings = [];
  var ringDefs = [
    { r: 2.7, tilt: [0.0, 0.0, 0.0], color: AMBER, op: 0.55 },
    { r: 3.5, tilt: [1.15, 0.4, 0.2], color: ICE, op: 0.32 },
    { r: 4.35, tilt: [-0.7, -0.5, 0.6], color: INK, op: 0.30 }
  ];
  ringDefs.forEach(function (d) {
    var g = new THREE.TorusGeometry(d.r, 0.006, 8, 220);
    var m = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: d.op });
    var ring = new THREE.Mesh(g, m);
    ring.rotation.set(d.tilt[0], d.tilt[1], d.tilt[2]);
    rig.add(ring);

    // a travelling "object" on each orbit
    var dotColor = d.color === INK ? ICE : d.color;
    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshBasicMaterial({ color: dotColor })
    );
    var halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({ color: dotColor, transparent: true, opacity: 0.18 })
    );
    var orbit = new THREE.Group();
    orbit.rotation.copy(ring.rotation);
    orbit.add(dot); orbit.add(halo);
    rig.add(orbit);
    rings.push({ ring: ring, orbit: orbit, radius: d.r, speed: 0.16 + Math.random() * 0.2, phase: Math.random() * Math.PI * 2, dot: dot, halo: halo });
  });

  // --- debris field (points) -------------------------------------------------
  var count = 320;
  var pos = new Float32Array(count * 3);
  for (var i = 0; i < count; i++) {
    var rr = 2.2 + Math.random() * 3.4;
    var th = Math.random() * Math.PI * 2;
    var ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = rr * Math.cos(ph) * 0.5;
    pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
  }
  var pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var points = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xEDEAE2, size: 0.018, transparent: true, opacity: 0.5, sizeAttenuation: true }));
  rig.add(points);

  // --- interaction: drag to spin, with inertia -----------------------------
  var dragging = false, lastX = 0, lastY = 0;
  var velX = 0, velY = 0;          // user-imparted angular velocity
  var autoY = 0.0016;             // idle auto-rotation
  var targetTiltX = 0.42;

  function down(x, y) { dragging = true; lastX = x; lastY = y; velX = velY = 0; mount.style.cursor = 'grabbing'; }
  function move(x, y) {
    if (!dragging) return;
    var dx = (x - lastX), dy = (y - lastY);
    lastX = x; lastY = y;
    velY = dx * 0.0045;
    velX = dy * 0.0035;
    rig.rotation.y += velY;
    rig.rotation.x = THREE.MathUtils.clamp(rig.rotation.x + velX, -0.4, 1.3);
  }
  function up() { dragging = false; mount.style.cursor = 'grab'; }

  mount.style.cursor = 'grab';
  renderer.domElement.addEventListener('mousedown', function (e) { down(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', up);
  renderer.domElement.addEventListener('touchstart', function (e) { var t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove', function (e) { if (dragging && e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  window.addEventListener('touchend', up);

  // pointer parallax when not dragging
  var px = 0, py = 0;
  if (window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('mousemove', function (e) {
      px = (e.clientX / window.innerWidth - 0.5);
      py = (e.clientY / window.innerHeight - 0.5);
    });
  }

  // --- run / pause ---------------------------------------------------------
  var running = true, t0 = performance.now();
  var vis = new IntersectionObserver(function (en) { running = en[0].isIntersecting; if (running) loop(); }, { threshold: 0.01 });
  vis.observe(mount);
  document.addEventListener('visibilitychange', function () { running = !document.hidden; if (running) loop(); });

  function resize() {
    W = mount.clientWidth; H = mount.clientHeight;
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }
  window.addEventListener('resize', resize);

  var raf = 0;
  function loop() {
    cancelAnimationFrame(raf);
    if (!running) return;
    raf = requestAnimationFrame(loop);
    var t = (performance.now() - t0) / 1000;

    if (!dragging) {
      rig.rotation.y += autoY + velY;
      rig.rotation.x += (targetTiltX + py * 0.15 - rig.rotation.x) * 0.03 + velX;
      velY *= 0.94; velX *= 0.9;                 // inertial decay
      rig.rotation.z += (px * 0.12 - rig.rotation.z) * 0.03;
    }

    sphere.rotation.y -= 0.0016;
    glow.rotation.y += 0.0022;
    points.rotation.y += 0.0006;

    rings.forEach(function (o) {
      var a = o.phase + t * o.speed;
      o.dot.position.set(Math.cos(a) * o.radius, 0, Math.sin(a) * o.radius);
      o.halo.position.copy(o.dot.position);
      o.halo.scale.setScalar(1 + Math.sin(t * 3 + o.phase) * 0.25);
    });

    renderer.render(scene, camera);
  }

  // reveal once the first frame is painted
  requestAnimationFrame(function () {
    loop();
    requestAnimationFrame(function () { mount.classList.add('ready'); });
  });
})();
