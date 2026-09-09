/* ============================================================
   SHADER GRADIENT  —  flowing fragment-shader field behind the ring
   Raw WebGL, one fullscreen triangle. No dependencies.
   Calm + slow (per the animate skill: background motion is
   near-imperceptible). Freezes under prefers-reduced-motion.
   Falls back silently to the CSS .ring-shader blob field.
   ============================================================ */
(function () {
  var stage = document.querySelector('.ringstage');
  if (!stage) return;

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'ring-shader-gl';
  canvas.setAttribute('aria-hidden', 'true');
  stage.insertBefore(canvas, stage.firstChild);

  var gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false })
        || canvas.getContext('experimental-webgl');
  if (!gl) { canvas.remove(); return; }

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
    'precision highp float;',
    'uniform vec2 uRes; uniform float uTime;',
    // palette
    'const vec3 INK   = vec3(0.031,0.035,0.043);',
    'const vec3 AMBER = vec3(0.851,0.541,0.294);',
    'const vec3 ICE   = vec3(0.436,0.639,0.780);',
    'const vec3 WARM  = vec3(0.941,0.667,0.424);',
    'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}',
    'float fbm(vec2 p){float v=0.,a=0.5;mat2 m=rot(0.6);',
    '  for(int i=0;i<5;i++){v+=a*noise(p);p=m*p*2.02;a*=0.5;}return v;}',
    'void main(){',
    '  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;',
    '  float t=uTime*0.035;',
    // domain warp
    '  vec2 q=vec2(fbm(uv*1.1+vec2(0.,t)), fbm(uv*1.1+vec2(5.2,-t)));',
    '  vec2 r=vec2(fbm(uv*1.4+3.0*q+vec2(1.7,9.2)+t*0.7),',
    '              fbm(uv*1.4+3.0*q+vec2(8.3,2.8)-t*0.6));',
    '  float f=fbm(uv*1.2+2.4*r);',
    // colour build — a visible flowing gradient, still dark enough for the cards
    '  vec3 col=INK;',
    '  col+=AMBER*smoothstep(0.30,1.00,f)*0.50;',
    '  col+=ICE *smoothstep(0.46,1.14,length(r))*0.24;',
    '  col+=WARM*pow(smoothstep(0.54,1.12,f+0.22*r.x),2.0)*0.26;',
    '  col=mix(col, INK, smoothstep(0.55,1.35,length(uv))*0.85);',    // vignette
    '  col+=(hash(gl_FragCoord.xy+uTime)-0.5)*0.014;',                // grain
    '  gl_FragColor=vec4(col,0.86);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { return null; }
    return s;
  }
  var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes');
  var uTime = gl.getUniformLocation(prog, 'uTime');

  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    canvas.width = Math.max(2, w * dpr | 0);
    canvas.height = Math.max(2, h * dpr | 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  stage.classList.add('gl-on');

  var start = performance.now(), raf = 0, running = true;
  function render(now) {
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (running && !reduce) raf = requestAnimationFrame(render);
  }
  render(start);
  if (reduce) { /* single frame only */ }

  if ('IntersectionObserver' in window && !reduce) {
    new IntersectionObserver(function (en) {
      running = en[0].isIntersecting;
      if (running && !raf) { raf = requestAnimationFrame(render); }
      else if (!running && raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.01 }).observe(stage);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!reduce && !raf) { running = true; raf = requestAnimationFrame(render); }
  });
})();
