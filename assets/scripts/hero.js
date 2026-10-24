// Home hero: an iris lit by a slit lamp. The beam follows the pointer while it is over the eye, and sweeps
// by itself the rest of the time; light reaching the pupil makes it constrict after a short latency, then
// dilate again slowly: the pupillary light reflex. A small pupillometer traces the diameter over time.
// Dust floating in the dark room shows in the beam (as in a real slit lamp, the Tyndall effect) and
// flees the pointer; the background drawing (light brought to a focus) is lit where the beam passes and
// bends around the pointer as seen through a magnifying lens. A click on the eye fires a flash, as a
// fundus camera does: the pupil closes at once. Scrolling down, the eye comes closer and the dust
// flies past, as if one went into the pupil. A button pauses it all.
// Drawn in two passes, so that a modest phone keeps up: the room and the iris (one pass over the
// screen), then the specks of dust as small points (a few hundred, instead of working out the dust at
// every pixel).
// WebGL only; without it, or with reduced motion, the pre-rendered poster stays in place.
(() => {
  const stage = document.querySelector('[data-iris]');
  if (!stage) {
    return;
  }
  const hero = stage.closest('section') || stage;
  const canvas = stage.querySelector('canvas');
  const poster = stage.querySelector('.hero__poster') || canvas;
  const readout = document.querySelector('[data-pupil-mm]');
  const trace = document.querySelector('[data-pupil-trace]');
  const playButton = document.querySelector('[data-iris-play]');
  const drawingLayer = stage.querySelector('.hero__drawing');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) {
    return;
  }
  const hasDerivatives = Boolean(gl.getExtension('OES_standard_derivatives'));

  // ---------- The room and the iris ----------
  const VERTEX = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;
  const FRAGMENT = `${hasDerivatives ? '#extension GL_OES_standard_derivatives : enable\n' : ''}
    precision highp float;
    uniform sampler2D uIris;
    uniform vec2 uRes;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uPupil;
    uniform float uBeamX;
    uniform float uBeamW;
    uniform float uBeam;
    uniform vec2 uTilt;
    uniform vec3 uBg;
    uniform sampler2D uDraw;
    uniform float uDrawOn;
    uniform vec4 uDrawBox;
    uniform vec2 uMouse;
    uniform float uMouseOn;
    uniform float uZoom;
    uniform float uFlash;

    const float TAU = 6.2831853;

    float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

    void main() {
      vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
      vec2 d = (frag - uCenter) / uRadius;
      float r = length(d);
      float aa = 1.4 / uRadius;

      // Slit beam: crisp edges, plus light scattered around it.
      float bx = abs(frag.x - uBeamX) / uBeamW;
      float slit = smoothstep(1.0, 0.6, bx) * uBeam;
      float halo = exp(-bx * bx * 0.045) * uBeam;
      float spill = exp(-bx * bx * 0.012) * uBeam;

      // Background: the dark room, faintly lit around the eye by the beam.
      vec3 col = uBg + vec3(0.05, 0.075, 0.11) * (0.55 * slit + 0.3 * halo) * (1.0 - smoothstep(1.0, 1.9, r));
      float inPupil = 0.0;

      if (r < 1.06) {
        // Iris unrolled in polar coordinates; the seam of atan is avoided by using the smoother of two parametrisations.
        float u1 = atan(d.y, d.x) / TAU + 0.5;
        float u = u1;
        ${hasDerivatives ? 'float u2 = fract(u1 + 0.5) - 0.5; if (fwidth(u2) < fwidth(u1)) { u = u2; }' : ''}
        float span = 1.0 - uPupil;
        float t = clamp((r - uPupil) / span, 0.0, 1.0);
        vec3 albedo = texture2D(uIris, vec2(u, t)).rgb;

        // Relief: the lighter strands stand up. The slope is read one pixel away along x and y
        // (texture coordinates moved with the Jacobian of the polar mapping).
        float r2 = max(r * r, 1e-4);
        vec2 jx = vec2(-d.y / r2 / TAU, d.x / max(r, 1e-3) / span) / uRadius;
        vec2 jy = vec2(d.x / r2 / TAU, d.y / max(r, 1e-3) / span) / uRadius;
        float h = luma(albedo);
        float hx = luma(texture2D(uIris, vec2(u, t) + jx * 1.5).rgb) - h;
        float hy = luma(texture2D(uIris, vec2(u, t) + jy * 1.5).rgb) - h;
        // The iris is slightly domed towards the pupil.
        vec3 n = normalize(vec3(-hx * 5.0 - d.x * 0.12, -hy * 5.0 - d.y * 0.12, 1.0));

        // Room light from the window (upper left), and the slit lamp from the side, a little above.
        vec3 toWindow = normalize(vec3(-0.45, -0.55, 0.7));
        vec3 toLamp = normalize(vec3(-0.62, -0.12, 0.78));
        float room = 0.5 + 0.36 * max(dot(n, toWindow), 0.0);
        float lamp = max(dot(n, toLamp), 0.0) / 0.78;
        float light = room + lamp * (1.55 * slit + 0.38 * spill + 0.16 * halo);
        // Hollows (crypts, furrows) keep a little shadow.
        light *= 0.82 + 0.18 * smoothstep(0.05, 0.35, h);
        vec3 iris = albedo * light;

        // Pupil: absolute black.
        inPupil = smoothstep(uPupil + aa, uPupil - aa, r);
        iris = mix(iris, vec3(0.0), inPupil);

        // Soft limbus into the dark surround.
        col = mix(col, iris, smoothstep(1.03, 0.965, r));
      }

      // The background drawing, out of the eye: bent around the pointer as through a small lens (it is
      // read closer to the pointer), with no edge and no change of light; lit where the slit beam
      // crosses it.
      vec2 toMouse = frag - uMouse;
      float mouseDistance = length(toMouse);
      float lensR = uRadius / uZoom * 0.36;
      float k = clamp(mouseDistance / lensR, 0.0, 1.0);
      float bend = (1.0 - smoothstep(0.55, 1.0, k)) * uMouseOn;
      vec2 seen = uMouse + toMouse * mix(1.0, 0.6 + 0.4 * k * k, bend);
      // Coming closer: the drawing is read nearer the centre of the eye.
      seen = uCenter + (seen - uCenter) / uZoom;
      vec2 duv = (seen - uDrawBox.xy) / uDrawBox.zw;
      float inBox = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
      float ink = texture2D(uDraw, duv).a * inBox * uDrawOn;
      float outOfEye = smoothstep(1.087, 1.348, r);
      col += vec3(0.42, 0.55, 0.78) * ink * outOfEye * (0.09 + 0.5 * halo);

      // Highlights roll off instead of clipping.
      col = 1.0 - exp(-col * 1.25);

      if (r < 1.06) {
        // Cornea: the slit reflected as a thin bright line, bent by the dome...
        float shift = uRadius * (0.09 + 0.02 * uTilt.x);
        float bend = d.y * d.y * uRadius * 0.07;
        float line = exp(-pow((frag.x - uBeamX - shift + bend) / (uRadius * 0.007), 2.0));
        float onCornea = smoothstep(1.04, 0.92, r);
        col += vec3(0.92, 0.96, 1.0) * line * onCornea * uBeam * 0.75;
        // ...the window, a small rounded pane with a soft glow, moving slightly with the pointer...
        vec2 w = d - vec2(-0.43, -0.47) - uTilt * 0.025;
        float box = length(max(abs(w) - vec2(0.026, 0.012), 0.0)) - 0.016;
        float pane = smoothstep(0.01, -0.004, box);
        col += vec3(0.55, 0.62, 0.7) * exp(-max(box, 0.0) * 70.0) * 0.1;
        col = mix(col, vec3(0.97, 0.98, 1.0), pane * (0.72 + 0.26 * smoothstep(0.03, -0.03, w.y)));
        // ...and a faint sheen along the upper rim of the cornea.
        float rim = smoothstep(0.86, 1.0, r) * smoothstep(1.06, 0.99, r) * smoothstep(0.3, -0.8, d.y);
        col += vec3(0.5, 0.62, 0.78) * rim * 0.05;
      }

      // The flash of the camera: everything white for an instant.
      col = mix(col, vec3(0.97, 0.98, 1.0), uFlash * 0.82);

      // Vignette; a little dither against banding (none in the pupil, which stays pure black).
      vec2 q = frag / uRes - 0.5;
      col *= 1.0 - dot(q, q) * 0.55;
      col += (fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0 * (1.0 - inPupil);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ---------- The dust, as points ----------
  // Each speck has its place in a grid (a cell, a random offset); it drifts around it, is pushed away
  // by the pointer, twinkles, and shines in the beam and around the pointer, faintly elsewhere. When
  // the eye comes closer, the dust is spread and enlarged with it. It is added to the picture as light
  // through the same roll-off (screen blending).
  const DUST_VERTEX = `
    attribute vec2 aCell;
    attribute vec2 aRand;
    attribute vec4 aLayer;
    uniform vec2 uRes;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uDpr;
    uniform float uTime;
    uniform float uZoom;
    uniform vec2 uMouse;
    uniform float uMouseOn;
    uniform float uBeamX;
    uniform float uBeamW;
    uniform float uBeam;
    uniform float uFlash;
    varying float vLight;
    varying float vRadius;

    const float TAU = 6.2831853;

    void main() {
      float cell = aLayer.x * uDpr;
      float size = aLayer.y * uDpr;
      float speed = aLayer.z;
      vec2 drift = vec2(sin(uTime * speed + aRand.x * TAU), cos(uTime * speed * 0.8 + aRand.y * TAU)) * 0.3;
      vec2 pos = (aCell + 0.5 + (aRand - 0.5) * 0.5 + drift) * cell;
      vec2 away = pos - uMouse;
      float push = exp(-dot(away, away) / (cell * cell * 3.0)) * uMouseOn;
      pos += normalize(away + 0.001) * push * cell * 0.9;
      float twinkle = 0.55 + 0.45 * sin(uTime * (1.3 + aRand.x * 2.0) + aRand.y * 40.0);
      vec2 screen = uCenter + (pos - uCenter) * uZoom;
      float bx = abs(screen.x - uBeamX) / uBeamW;
      float halo = exp(-bx * bx * 0.045) * uBeam;
      float spill = exp(-bx * bx * 0.012) * uBeam;
      vec2 toMouse = screen - uMouse;
      float around = exp(-dot(toMouse, toMouse) / pow(uRadius * 0.5, 2.0)) * uMouseOn;
      float lit = 0.05 + 1.5 * halo * halo + 0.4 * spill * spill + 1.9 * around;
      vec2 q = screen / uRes - 0.5;
      vLight = aLayer.w * twinkle * lit * (1.0 - dot(q, q) * 0.55) * (1.0 - uFlash * 0.82);
      vRadius = size * uZoom;
      gl_PointSize = 2.0 * vRadius + 2.0;
      gl_Position = vec4(screen.x / uRes.x * 2.0 - 1.0, 1.0 - screen.y / uRes.y * 2.0, 0.0, 1.0);
    }
  `;
  const DUST_FRAGMENT = `
    precision mediump float;
    varying float vLight;
    varying float vRadius;

    void main() {
      float distance = length(gl_PointCoord - 0.5) * (2.0 * vRadius + 2.0);
      vec3 light = vec3(0.95, 0.9, 0.8) * vLight * (1.0 - smoothstep(0.0, vRadius, distance));
      gl_FragColor = vec4(1.0 - exp(-light * 1.25), 1.0);
    }
  `;
  // The four layers of dust: three depths in focus, and a few large motes close to the lens, out of
  // focus (soft discs). Cell and size in points.
  const DUST_LAYERS = [
    { cell: 64, size: 1.9, speed: 0.21, seed: 3.1, weight: 1 },
    { cell: 108, size: 2.7, speed: 0.15, seed: 11.7, weight: 0.8 },
    { cell: 176, size: 3.8, speed: 0.1, seed: 29.3, weight: 0.55 },
    { cell: 300, size: 11, speed: 0.06, seed: 47.9, weight: 0.22 },
  ];

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  // Attribute slots are fixed: 0 for the screen pass, 1 to 3 for the dust. The programs are only
  // checked once the iris is loaded: meanwhile the browser compiles them on the side and the page
  // goes on loading (checked at once, the page waited 65 to 115 ms for them).
  const link = (vertex, fragment, attributes) => {
    const linked = gl.createProgram();
    gl.attachShader(linked, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(linked, compile(gl.FRAGMENT_SHADER, fragment));
    attributes.forEach((name, index) => gl.bindAttribLocation(linked, index, name));
    gl.linkProgram(linked);
    return linked;
  };
  const program = link(VERTEX, FRAGMENT, ['aPos']);
  const dustProgram = link(DUST_VERTEX, DUST_FRAGMENT, ['aUnused', 'aCell', 'aRand', 'aLayer']);
  // (Sent at once: Firefox otherwise keeps them until they are asked for, and compiles them then.)
  gl.flush();
  const linkedAt = performance.now();
  // Where the browser can tell whether they are compiled yet (Chrome, Edge), they are asked for only
  // when they are (each question waits for the graphics process: asked once the iris is there);
  // elsewhere (Firefox), a quarter of a second after they were given, time enough to compile them.
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const whenCompiled = () => new Promise((resolve) => {
    const check = () => {
      const isDone = parallel
        ? [program, dustProgram].every((linked) => gl.getProgramParameter(linked, parallel.COMPLETION_STATUS_KHR))
        : performance.now() - linkedAt > 250;
      if (isDone) {
        resolve();
      } else {
        window.setTimeout(check, 50);
      }
    };
    check();
  });

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const dustBuffer = gl.createBuffer();
  let dustCount = 0;

  const uniforms = (linked, names) => Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(linked, `u${name[0].toUpperCase()}${name.slice(1)}`)]));
  let U = null;
  let D = null;
  // A program that does not compile (an old graphics chip) leaves the poster in place.
  const prepare = () => {
    if (![program, dustProgram].every((linked) => gl.getProgramParameter(linked, gl.LINK_STATUS))) {
      return false;
    }
    U = uniforms(program, ['res', 'center', 'radius', 'pupil', 'beamX', 'beamW', 'beam', 'tilt', 'bg', 'draw', 'drawOn', 'drawBox', 'mouse', 'mouseOn', 'zoom', 'flash', 'iris']);
    D = uniforms(dustProgram, ['res', 'center', 'radius', 'dpr', 'time', 'zoom', 'mouse', 'mouseOn', 'beamX', 'beamW', 'beam', 'flash']);
    gl.useProgram(program);
    gl.uniform1i(U.iris, 0);
    gl.uniform1f(U.drawOn, 0);
    return true;
  };

  // ---------- Quality ----------
  // The iris is drawn at each refresh of the screen, at most 1.75 pixel per point (phones start at
  // 1.5). When the frames come later than the screen asks for them (a modest graphics chip, an old
  // computer), it is drawn a step less finely, so that it stays fluid; it goes back up when there is
  // room again, never above a step found too slow. (Drawn only at every other refresh of a 120 Hz
  // screen, its frames came unevenly in Firefox: a frame early, the next one late.)
  const isTouch = window.matchMedia('(hover: none)').matches;
  const MAX_SCALE = Math.min(window.devicePixelRatio || 1, 1.75);
  const MIN_SCALE = Math.min(MAX_SCALE, Math.max(0.75, MAX_SCALE / 2));
  const START_SCALE = isTouch ? Math.min(MAX_SCALE, 1.5) : MAX_SCALE;
  const WINDOW = 60;
  const quality = { scale: START_SCALE, ceiling: MAX_SCALE, intervals: [], shortest: [], easyWindows: 0, settleUntil: 0 };

  // ---------- Geometry ----------
  const geometry = { width: 0, height: 0, dpr: 1, cx: 0, cy: 0, radius: 0, drawBox: [0, 0, 1, 1], heroHeight: 1 };

  // The dust of the whole canvas, cell by cell (the same pseudo-random field as before, made once).
  const fract = (x) => x - Math.floor(x);
  const hash = (x, y) => {
    let px = fract(x * 123.34);
    let py = fract(y * 456.21);
    const dot = px * (px + 45.32) + py * (py + 45.32);
    px += dot;
    py += dot;
    return fract(px * py);
  };
  const buildDust = () => {
    const data = [];
    DUST_LAYERS.forEach(({ cell, size, speed, seed, weight }) => {
      const step = cell * geometry.dpr;
      const columns = Math.ceil(geometry.width / step) + 1;
      const rows = Math.ceil(geometry.height / step) + 1;
      for (let j = -1; j <= rows; j += 1) {
        for (let i = -1; i <= columns; i += 1) {
          const b = hash(i + seed + 17.17, j + seed + 17.17);
          // About one cell in two holds a speck.
          if (b >= 0.5) {
            data.push(i, j, hash(i + seed, j + seed), b, cell, size, speed, weight);
          }
        }
      }
    });
    dustCount = data.length / 8;
    gl.bindBuffer(gl.ARRAY_BUFFER, dustBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  };

  const layout = () => {
    const rect = stage.getBoundingClientRect();
    geometry.dpr = quality.scale;
    geometry.width = Math.max(1, Math.round(rect.width * geometry.dpr));
    geometry.height = Math.max(1, Math.round(rect.height * geometry.dpr));
    // (Setting the size of a canvas clears it: only when it changes.)
    if (canvas.width !== geometry.width || canvas.height !== geometry.height) {
      canvas.width = geometry.width;
      canvas.height = geometry.height;
    }
    geometry.heroHeight = Math.max(1, hero.offsetHeight);
    // The iris is drawn exactly over the poster, which CSS places (iris radius = 46 % of the poster).
    const box = poster.getBoundingClientRect();
    geometry.cx = (box.left - rect.left + box.width / 2) * geometry.dpr;
    geometry.cy = (box.top - rect.top + box.height / 2) * geometry.dpr;
    geometry.radius = box.width * 0.46 * geometry.dpr;
    const drawingWidth = box.width * 2.015 * geometry.dpr;
    geometry.drawBox = [geometry.cx - drawingWidth * 0.775, geometry.cy - drawingWidth * 0.3125, drawingWidth, drawingWidth * 0.625];
    gl.viewport(0, 0, geometry.width, geometry.height);
    buildDust();
  };

  // Scrolling the hero away brings the eye closer: it grows, drifts toward the middle and rises more
  // slowly than the page (decorative; the page scrolls as usual). The scroll offset is kept from the
  // scroll event and the height of the hero from its last measure: a frame reads no layout.
  let scrollTop = window.scrollY;
  window.addEventListener('scroll', () => {
    scrollTop = window.scrollY;
  }, { passive: true });
  const view = { cx: 0, cy: 0, radius: 0, zoom: 1 };
  const updateView = () => {
    const progress = reduceMotion ? 0 : Math.min(1, Math.max(0, scrollTop / geometry.heroHeight));
    view.zoom = 1 + 1.9 * progress * progress;
    view.cx = geometry.cx + (geometry.width / 2 - geometry.cx) * progress * 0.45;
    view.cy = geometry.cy + (reduceMotion ? 0 : Math.min(scrollTop, geometry.heroHeight) * geometry.dpr * 0.42);
    view.radius = geometry.radius * view.zoom;
  };

  // ---------- Pupil physiology ----------
  const IRIS_MM = 12;
  const PUPIL_DARK = 0.47;
  const PUPIL_LIGHT = 0.2;
  const LATENCY = 0.24;
  // The pointer drives the beam only over the eye (iris radius x EYE_ZONE); elsewhere the beam sweeps by itself.
  const EYE_ZONE = 1.15;
  // After a touch drag, the beam stays where the finger left it for a moment.
  const TOUCH_HOLD = 2.5;
  const state = {
    pupil: PUPIL_DARK * 0.86,
    beamX: 0,
    beamTarget: 0,
    beam: 0,
    beamWanted: 0,
    tiltX: 0,
    tiltY: 0,
    drivenUntil: -1,
    lightHistory: [],
    samples: [],
    mouseX: -9999,
    mouseY: -9999,
    mouseOn: 0,
    mouseWanted: 0,
    mouseUntil: Infinity,
    isPaused: false,
    flash: 0,
    flashAt: -9,
  };
  const FLASH_LENGTH = 0.18;

  const lightOnPupil = (now) => {
    const beamHalf = view.radius * 0.07;
    const pupilPx = state.pupil * view.radius;
    const distance = Math.abs(state.beamX - view.cx);
    const overlap = Math.min(1, Math.max(0, (beamHalf + pupilPx - distance) / (2 * Math.min(beamHalf, pupilPx))));
    // A flash lights the whole pupil, more than the beam.
    const flash = now - state.flashAt < FLASH_LENGTH ? 1.25 : 0;
    state.lightHistory.push([now, Math.max(overlap * state.beam, flash)]);
    while (state.lightHistory.length > 2 && state.lightHistory[1][0] <= now - LATENCY) {
      state.lightHistory.shift();
    }
    // Light seen LATENCY seconds ago drives the iris now.
    return state.lightHistory[0][0] <= now - LATENCY ? state.lightHistory[0][1] : 0;
  };

  // ---------- Texture ----------
  const texture = gl.createTexture();
  const image = new Image();
  image.decoding = 'async';
  image.src = stage.dataset.iris;

  // ---------- Background drawing ----------
  // Handed to the graphics chip once the programs are ready; the CSS drawing gives way only once the
  // canvas shows it.
  const drawTexture = gl.createTexture();
  const drawingImage = new Image();
  drawingImage.decoding = 'async';
  drawingImage.src = stage.dataset.drawing || '';
  const drawingLoaded = new Promise((resolve) => {
    drawingImage.addEventListener('load', resolve, { once: true });
  });
  let isLive = false;
  let isDrawingUp = false;
  const revealDrawing = () => {
    if (isLive && isDrawingUp) {
      drawingLayer?.classList.add('is-drawn-by-webgl');
    }
  };
  const uploadDrawing = () => {
    const raster = document.createElement('canvas');
    raster.width = 2048;
    raster.height = 1280;
    const context = raster.getContext('2d');
    context.drawImage(drawingImage, 0, 0, raster.width, raster.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, drawTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(program);
    gl.uniform1i(U.draw, 1);
    gl.uniform1f(U.drawOn, 1);
    isDrawingUp = true;
    revealDrawing();
    if (reduceMotion && isReady) {
      renderStill();
    }
  };

  // ---------- Pupillometer ----------
  const traceContext = trace ? trace.getContext('2d') : null;
  const drawTrace = (now) => {
    if (!traceContext) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = trace.clientWidth * dpr;
    const h = trace.clientHeight * dpr;
    if (trace.width !== w || trace.height !== h) {
      trace.width = w;
      trace.height = h;
    }
    const ctx = traceContext;
    ctx.clearRect(0, 0, w, h);
    const span = 8;
    const toX = (time) => w - ((now - time) / span) * w;
    const toY = (mm) => h - ((mm - 1.5) / 5) * h;
    // Light stimulus band.
    ctx.fillStyle = 'rgba(239, 178, 74, 0.22)';
    state.samples.forEach(([time, , light], index) => {
      if (light > 0.05 && index > 0) {
        const x0 = toX(state.samples[index - 1][0]);
        ctx.fillRect(x0, 0, Math.max(1, toX(time) - x0 + 0.5), h);
      }
    });
    // Diameter curve.
    ctx.beginPath();
    state.samples.forEach(([time, mm], index) => {
      const x = toX(time);
      const y = toY(mm);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = 'rgba(168, 200, 243, 0.95)';
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke();
  };

  // ---------- Drawing ----------
  const draw = (now, values) => {
    // The room and the iris.
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    [1, 2, 3].forEach((slot) => gl.disableVertexAttribArray(slot));
    gl.uniform2f(U.res, geometry.width, geometry.height);
    gl.uniform2f(U.center, values.cx, values.cy);
    gl.uniform1f(U.radius, values.radius);
    gl.uniform1f(U.pupil, values.pupil);
    gl.uniform1f(U.beamX, values.beamX);
    gl.uniform1f(U.beamW, values.radius * 0.07);
    gl.uniform1f(U.beam, values.beam);
    gl.uniform2f(U.tilt, values.tiltX, values.tiltY);
    gl.uniform4f(U.drawBox, ...geometry.drawBox);
    gl.uniform2f(U.mouse, state.mouseX, state.mouseY);
    gl.uniform1f(U.mouseOn, state.mouseOn);
    gl.uniform1f(U.zoom, view.zoom);
    gl.uniform1f(U.flash, state.flash);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // The dust.
    gl.useProgram(dustProgram);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dustBuffer);
    [[1, 2, 0], [2, 2, 8], [3, 4, 16]].forEach(([slot, size, offset]) => {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, size, gl.FLOAT, false, 32, offset);
    });
    gl.uniform2f(D.res, geometry.width, geometry.height);
    gl.uniform2f(D.center, values.cx, values.cy);
    gl.uniform1f(D.radius, values.radius);
    gl.uniform1f(D.dpr, geometry.dpr);
    gl.uniform1f(D.time, now - startedAt);
    gl.uniform1f(D.zoom, view.zoom);
    gl.uniform2f(D.mouse, state.mouseX, state.mouseY);
    gl.uniform1f(D.mouseOn, state.mouseOn);
    gl.uniform1f(D.beamX, values.beamX);
    gl.uniform1f(D.beamW, values.radius * 0.07);
    gl.uniform1f(D.beam, values.beam);
    gl.uniform1f(D.flash, state.flash);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, dustCount);
    gl.disable(gl.BLEND);
  };

  // ---------- Loop ----------
  let last = performance.now() / 1000;
  let isReady = false;
  let isRunning = false;
  let isVisible = true;
  // Wide screens put the eye out of focus once the hero is mostly left behind (site.css): blurred,
  // it rests instead of being drawn again for nothing at every frame.
  let isAway = false;
  const blursAway = window.matchMedia('(min-width: 861px)');
  let lastReadout = 0;
  let lastTrace = 0;
  const startedAt = last;
  quality.settleUntil = startedAt + 1.5;
  const isResting = () => !isVisible || document.hidden || state.isPaused || (isAway && blursAway.matches);
  const warm = { frames: 0, steady: 0, since: 0 };
  const goLive = () => {
    isLive = true;
    stage.classList.add('is-live');
    revealDrawing();
  };

  const rescale = (scale) => {
    const ratio = scale / quality.scale;
    quality.scale = scale;
    state.beamX *= ratio;
    state.beamTarget *= ratio;
    state.mouseX *= ratio;
    state.mouseY *= ratio;
    layout();
  };
  // About every second (WINDOW frames), the frames are looked at, once the page has loaded (until
  // then its own work holds them up). The refresh of the screen is the shortest time between frames
  // over the last few seconds (a phone changes it by itself, lower when nothing is touched), read on
  // the quickest tenth of each second rather than on its single shortest time: a browser now and then
  // gives two frames closer together (Firefox on a computer: one in a few hundred), and such a lone
  // pair made every frame look late, the iris drawn coarser for nothing. Late: half again that time;
  // a frame held more than six times as long is the page at work (a script, an image), not the iris
  // drawn too finely, and does not count. Too many late frames and the iris is drawn a step less
  // finely; five quiet seconds in a row and it is drawn finer again.
  const adapt = (interval, now) => {
    if (now < quality.settleUntil || document.readyState !== 'complete') {
      return;
    }
    quality.intervals.push(interval);
    if (quality.intervals.length < WINDOW) {
      return;
    }
    const sorted = [...quality.intervals].sort((a, b) => a - b);
    quality.shortest = [...quality.shortest.slice(-4), Math.max(4, sorted[Math.floor(WINDOW / 10)])];
    const refresh = Math.min(...quality.shortest);
    const late = quality.intervals.filter((each) => each > refresh * 1.45 && each < refresh * 6).length;
    quality.intervals = [];
    const isStruggling = late > WINDOW * 0.2;
    const isEasy = late < WINDOW * 0.03;
    quality.easyWindows = isEasy ? quality.easyWindows + 1 : 0;
    if (isStruggling && quality.scale > MIN_SCALE) {
      quality.ceiling = Math.max(MIN_SCALE, quality.scale * 0.92);
      rescale(Math.max(MIN_SCALE, quality.scale * 0.8));
      quality.settleUntil = now + 0.6;
    } else if (quality.easyWindows >= 5 && quality.scale < quality.ceiling) {
      quality.easyWindows = 0;
      rescale(Math.min(quality.ceiling, quality.scale * 1.1));
      quality.settleUntil = now + 0.6;
    }
  };

  const frame = () => {
    if (isResting()) {
      isRunning = false;
      return;
    }
    const now = performance.now() / 1000;
    const interval = now - last;
    const dt = Math.min(0.05, interval);
    adapt(interval * 1000, now);
    last = now;
    updateView();

    // Idle: the beam sweeps slowly across the eye, so the reflex shows itself.
    const isIdle = now > state.drivenUntil;
    if (isIdle) {
      const t = now - startedAt;
      state.beamTarget = view.cx + Math.sin(t * 0.42) * view.radius * 1.25;
      state.beamWanted = 1;
    }
    state.flash += (0 - state.flash) * (1 - Math.exp(-dt * 6));
    state.beamX += (state.beamTarget - state.beamX) * (1 - Math.exp(-dt * (isIdle ? 2.2 : 9)));
    state.beam += (state.beamWanted - state.beam) * (1 - Math.exp(-dt * 4));
    // After a touch, the lens and the push on the dust fade out.
    if (now > state.mouseUntil) {
      state.mouseWanted = 0;
    }
    state.mouseOn += (state.mouseWanted - state.mouseOn) * (1 - Math.exp(-dt * 5));
    state.tiltX += (((state.beamX - view.cx) / Math.max(1, view.radius)) * 0.5 - state.tiltX) * (1 - Math.exp(-dt * 3));

    // Constriction is fast, dilation slow; a light physiological unrest (hippus) remains.
    const light = lightOnPupil(now);
    const target = PUPIL_DARK + (PUPIL_LIGHT - PUPIL_DARK) * Math.min(1, light * 1.1) + Math.sin(now * 1.7) * 0.004;
    const rate = target < state.pupil ? 3.4 : 0.85;
    state.pupil += (target - state.pupil) * (1 - Math.exp(-dt * rate));

    const mm = state.pupil * IRIS_MM;
    state.samples.push([now, mm, light]);
    while (state.samples.length && state.samples[0][0] < now - 8.5) {
      state.samples.shift();
    }

    draw(now, { cx: view.cx, cy: view.cy, radius: view.radius, pupil: state.pupil, beamX: state.beamX, beam: state.beam, tiltX: state.tiltX, tiltY: state.tiltY });

    // The trace and the figure of the pupillometer change slowly: drawn 30 and 8 times a second.
    if (now - lastTrace > 0.032) {
      drawTrace(now);
      lastTrace = now;
    }
    if (readout && now - lastReadout > 0.12) {
      readout.textContent = mm.toFixed(1).replace('.', ',');
      lastReadout = now;
    }
    // Warming up (see the start): the canvas shows once a few frames have come at the pace of the
    // screen, or after a second whatever the page is doing.
    if (!isLive) {
      warm.frames += 1;
      warm.steady = interval < 0.034 ? warm.steady + 1 : 0;
      if ((warm.frames >= 8 && warm.steady >= 4) || now - warm.since > 1) {
        goLive();
      }
    }
    window.requestAnimationFrame(frame);
  };

  // Animated only once the texture is there, and never with reduced motion.
  const start = () => {
    if (isReady && !reduceMotion && !isRunning && !isResting()) {
      isRunning = true;
      last = performance.now() / 1000;
      if (!isLive) {
        Object.assign(warm, { frames: 0, steady: 0, since: last });
      }
      window.requestAnimationFrame(frame);
    }
  };

  const renderStill = () => {
    layout();
    updateView();
    state.beamX = geometry.cx - geometry.radius * 1.4;
    draw(startedAt, { cx: geometry.cx, cy: geometry.cy, radius: geometry.radius, pupil: 0.36, beamX: state.beamX, beam: 0.7, tiltX: 0, tiltY: 0 });
  };

  // ---------- Start ----------
  // The iris is decoded aside (decode, createImageBitmap) while the programs compile. Its first frames are
  // then drawn while the canvas is still clear: the graphics chip readies its textures and programs
  // meanwhile, a hitch the eye showed as it came in. The canvas fades in over the poster once frames
  // come at the pace of the screen (the frame loop), the drawing as soon as both are ready.
  const irisLoaded = new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', reject, { once: true });
  });
  const irisSource = irisLoaded
    .then(() => (image.decode ? image.decode().catch(() => {}) : null))
    .then(() => (window.createImageBitmap ? window.createImageBitmap(image).catch(() => image) : image));
  const glReady = irisSource.then((source) => whenCompiled().then(() => source)).then((source) => {
    if (!prepare()) {
      throw new Error('The iris programs did not compile.');
    }
    return source;
  });
  Promise.all([drawingLoaded, glReady]).then(uploadDrawing, () => {});
  glReady.then((source) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    if (source !== image) {
      source.close();
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, hasDerivatives ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (hasDerivatives) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    // Sharper fibres seen at a slant; phones keep it lighter.
    const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (anisotropic) {
      const max = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(isTouch ? 4 : 8, max));
    }
    const hex = getComputedStyle(stage).getPropertyValue('--c-iris-bg').trim().replace('#', '') || '07101d';
    // Inverse of the shader's tone mapping, so that the background keeps its CSS colour.
    const channel = (index) => -Math.log(1 - parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255) / 1.25;
    gl.useProgram(program);
    gl.uniform3f(U.bg, channel(0), channel(1), channel(2));
    layout();
    state.beamX = geometry.cx - geometry.radius * 1.6;
    state.beamTarget = state.beamX;
    isReady = true;

    if (reduceMotion) {
      renderStill();
      goLive();
      return;
    }
    start();
  }).catch(() => {
    // No iris (no image, or programs the graphics chip refuses): the poster stays, without a pause
    // button that would pause nothing.
    if (playButton) {
      playButton.hidden = true;
    }
  });

  // ---------- Interaction ----------
  hero.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) * geometry.dpr;
    const y = (event.clientY - rect.top) * geometry.dpr;
    const now = performance.now() / 1000;
    state.mouseX = x;
    state.mouseY = y;
    state.mouseWanted = 1;
    state.mouseUntil = event.pointerType === 'touch' ? now + TOUCH_HOLD : Infinity;
    updateView();
    const isOverEye = Math.hypot(x - view.cx, y - view.cy) < view.radius * EYE_ZONE;
    if (!isOverEye) {
      state.drivenUntil = Math.min(state.drivenUntil, now);
      return;
    }
    state.beamTarget = x;
    state.tiltY = (y / Math.max(1, geometry.height) - 0.5) * 0.6;
    state.beamWanted = 1;
    state.drivenUntil = event.pointerType === 'touch' ? now + TOUCH_HOLD : Infinity;
    start();
  });
  hero.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') {
      state.drivenUntil = performance.now() / 1000;
      state.mouseWanted = 0;
    }
  });
  // A click (or a tap) on the eye: the flash of a fundus camera.
  hero.addEventListener('click', (event) => {
    if (reduceMotion || state.isPaused || !isReady || event.target.closest('a, button, .hud')) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) * geometry.dpr;
    const y = (event.clientY - rect.top) * geometry.dpr;
    updateView();
    if (Math.hypot(x - view.cx, y - view.cy) > view.radius * EYE_ZONE) {
      return;
    }
    state.flash = 1;
    state.flashAt = performance.now() / 1000;
    start();
  });

  // ---------- Pause ----------
  if (playButton && !reduceMotion) {
    playButton.hidden = false;
    playButton.addEventListener('click', () => {
      state.isPaused = !state.isPaused;
      hero.classList.toggle('is-paused', state.isPaused);
      playButton.classList.toggle('is-paused', state.isPaused);
      playButton.setAttribute('aria-label', state.isPaused ? "Reprendre l'animation de l'œil" : "Mettre en pause l'animation de l'œil");
      start();
    });
  }
  // The size of the hero changes (window, fonts, enlarged text): measured again.
  const remeasure = () => {
    layout();
    if (reduceMotion && isReady) {
      renderStill();
    }
  };
  if ('ResizeObserver' in window) {
    new ResizeObserver(remeasure).observe(stage);
  } else {
    window.addEventListener('resize', remeasure);
  }
  if ('ViewWatcher' in window) {
    new ViewWatcher(([entry]) => {
      isVisible = entry.isIntersecting;
      isAway = entry.intersectionRatio < 0.45 && entry.boundingClientRect.top < 0;
      start();
    }, { threshold: [0, 0.45, 1] }).observe(hero);
  }
  blursAway.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
})();
