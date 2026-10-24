// The eye in three dimensions, drawn in fine lines like the drawings of the site.
// Surgeries page (data-eye3d="zones", on the night): behind the head of the page, every 3 s it turns
// to show where the next operation acts, and that part lights up in the colour of the operation
// (lens, cornea, eyelids, retina) together with its entry in the index; pointing or focusing an
// entry shows its part. A button pauses it.
// 404 page (data-eye3d="look", on the paper): the eye searches the missing page for 4 s, then looks
// at the pointer; only the globe turns, behind its lids.
// Three.js r185 (assets/vendor/three), loaded once the page itself has loaded. Without WebGL 2
// nothing changes on the page. Proportions in millimetres, from _build/eye.js (adult eye). Drawn as
// finely as the graphics chip allows (fineness.js).
import { fineness } from './fineness.js';

const stage = document.querySelector('[data-eye3d]');

const hasWebGL2 = () => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch (error) {
    return false;
  }
};

if (stage && hasWebGL2()) {
  const begin = () => import('../vendor/three/three.module.min.js').then(build).catch(() => {});
  const whenIdle = (task) => ('requestIdleCallback' in window ? window.requestIdleCallback(task, { timeout: 1500 }) : window.setTimeout(task, 300));
  if (document.readyState === 'complete') {
    whenIdle(begin);
  } else {
    window.addEventListener('load', () => whenIdle(begin), { once: true });
  }
}

function build(THREE) {
  const TAU = Math.PI * 2;
  const deg = (value) => (value * Math.PI) / 180;
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => new THREE.Color((css.getPropertyValue(name) || fallback).trim());
  const isLook = stage.dataset.eye3d === 'look';
  // On the night the lines are light added to the dark; on the paper, ink laid on the page.
  const BLENDING = isLook ? THREE.NormalBlending : THREE.AdditiveBlending;

  // ---------- Colours: the lines in light blue, each operation in its own colour ----------
  const BASE = isLook ? token('--c-blue', '#1d4fa3') : token('--c-sky', '#a8c8f3');
  // Lit lines add up where they cross: the colours of the site are taken a little deeper and more
  // saturated here, so that a lit part keeps its colour instead of turning white.
  const deeper = (color) => color.offsetHSL(0, 0.12, -0.1);
  const ZONES = {
    cataracte: deeper(token('--c-amber', '#f0c27a')),
    laser: deeper(token('--c-violet', '#c4b5fd')),
    paupieres: deeper(token('--c-rose', '#f3a99c')),
    ivt: deeper(token('--c-teal', '#80d4d9')),
  };
  const ORDER = ['cataracte', 'laser', 'paupieres', 'ivt'];
  // How the eye turns to show each part (degrees; positive yaw = looking to the right, away from
  // the title): the lens and the cornea from the side, the eyelids almost from the front, the
  // retina from behind (the eye then looks to the left, its back towards the right).
  const POSES = {
    cataracte: { yaw: 56, pitch: 8 },
    laser: { yaw: 80, pitch: 4 },
    paupieres: { yaw: 18, pitch: 4 },
    ivt: { yaw: -142, pitch: 12 },
  };
  const STEP_SECONDS = 3;
  const LINE_OPACITY = isLook ? 0.34 : 0.2;
  const LINE_OPACITY_LIT = 0.85;

  // ---------- Eye proportions (mm), as in _build/eye.js ----------
  // Lathe space: the optical axis is Y, the front of the eye towards +Y, r the distance to the axis.
  const R = 12;
  const RC = 7.8;
  const HL = 5.85;
  const limbusA = Math.sqrt(R * R - HL * HL);
  const corneaCentreA = limbusA - Math.sqrt(RC * RC - HL * HL);
  const apexA = corneaCentreA + RC;
  const RA = 10;
  const RP = 5.2;
  const HA = 4.75;
  const lensFrontA = apexA - 3.0;
  const lensFrontCentreA = lensFrontA - RA;
  const lensEquatorA = lensFrontCentreA + Math.sqrt(RA * RA - HA * HA);
  const lensBackA = lensEquatorA - (RP - Math.sqrt(RP * RP - HA * HA));
  const lensBackCentreA = lensBackA + RP;
  const RETINA = R - 0.85 - 0.32 - 0.32;
  const ORA = 58;

  const arc = (count, from, to, point) => Array.from({ length: count + 1 }, (_, i) => point(from + ((to - from) * i) / count));
  const profiles = {
    sclera: arc(40, Math.asin(HL / R), Math.PI, (t) => [R * Math.sin(t), R * Math.cos(t)]),
    cornea: arc(18, 0, Math.asin(HL / RC), (t) => [RC * Math.sin(t), corneaCentreA + RC * Math.cos(t)]),
    lens: [
      ...arc(14, 0, Math.asin(HA / RA), (t) => [RA * Math.sin(t), lensFrontCentreA + RA * Math.cos(t)]),
      ...arc(14, Math.asin(HA / RP), 0, (t) => [RP * Math.sin(t), lensBackCentreA - RP * Math.cos(t)]).slice(1),
    ],
    retina: arc(30, deg(ORA), Math.PI, (t) => [RETINA * Math.sin(t), RETINA * Math.cos(t)]),
    iris: arc(10, 0, 1, (t) => [1.9 + t * 3.8, lensFrontA + 0.32 - t * 0.5]),
  };

  // ---------- Line helpers (pairs of points for LineSegments) ----------
  const meridians = (profile, count, phase = 0) => {
    const points = [];
    for (let k = 0; k < count; k++) {
      const phi = phase + (k / count) * TAU;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      for (let i = 0; i < profile.length - 1; i++) {
        const [r0, a0] = profile[i];
        const [r1, a1] = profile[i + 1];
        points.push(r0 * c, a0, r0 * s, r1 * c, a1, r1 * s);
      }
    }
    return points;
  };
  const ring = (r, a, segments = 96) => {
    const points = [];
    for (let i = 0; i < segments; i++) {
      const p0 = (i / segments) * TAU;
      const p1 = ((i + 1) / segments) * TAU;
      points.push(r * Math.cos(p0), a, r * Math.sin(p0), r * Math.cos(p1), a, r * Math.sin(p1));
    }
    return points;
  };
  const along = (profile, t) => {
    const i = Math.min(profile.length - 2, Math.floor(t * (profile.length - 1)));
    const f = t * (profile.length - 1) - i;
    return [profile[i][0] + (profile[i + 1][0] - profile[i][0]) * f, profile[i][1] + (profile[i + 1][1] - profile[i][1]) * f];
  };
  const parallels = (profile, ts) => ts.flatMap((t) => {
    const [r, a] = along(profile, t);
    return ring(r, a);
  });
  const radial = (count, inner, outer) => {
    const points = [];
    for (let k = 0; k < count; k++) {
      const phi = (k / count) * TAU + Math.sin(k * 2.3) * 0.04;
      points.push(inner[0] * Math.cos(phi), inner[1], inner[0] * Math.sin(phi), outer[0] * Math.cos(phi), outer[1], outer[0] * Math.sin(phi));
    }
    return points;
  };
  // A point on the inner retina, from its direction (lathe space, unit vector).
  const onRetina = (direction, inset = 0) => direction.clone().normalize().multiplyScalar(RETINA - inset);

  // ---------- Materials ----------
  const lineMaterial = () => new THREE.LineBasicMaterial({
    color: BASE.clone(),
    transparent: true,
    opacity: LINE_OPACITY,
    blending: BLENDING,
    depthWrite: false,
  });
  // Surfaces glow on their edges only (fresnel), like glass seen against the light.
  const glowMaterial = ({ side = THREE.FrontSide, power = 2.6, intensity = 0.32 } = {}) => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: BASE.clone() },
      uIntensity: { value: intensity },
      uPower: { value: power },
      uFade: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;
      uniform float uFade;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, uPower);
        float alpha = clamp(rim * uIntensity * uFade, 0.0, 1.0);
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side,
    transparent: true,
    blending: BLENDING,
    depthWrite: false,
  });

  const lines = (points, material) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geometry, material);
  };
  const lathe = (profile, material, segments = 72) => new THREE.Mesh(
    new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(Math.max(r, 0.0001), a)), segments),
    material,
  );

  // ---------- The eye ----------
  const eye = new THREE.Group();
  const parts = {};
  const addPart = (name, objects) => {
    const group = new THREE.Group();
    objects.forEach((object) => group.add(object));
    eye.add(group);
    parts[name] = { group, lines: objects.filter((o) => o.isLineSegments), glows: objects.filter((o) => o.isMesh), lit: 0 };
  };

  // Sclera: meridians and a few parallels, the limbus ring; its surface glows at the edges.
  addPart('sclera', [
    lines([...meridians(profiles.sclera, 20, 0.08), ...parallels(profiles.sclera, [0.2, 0.42, 0.62, 0.82]), ...ring(HL, limbusA)], lineMaterial()),
    lathe(profiles.sclera, glowMaterial({ power: 2.4, intensity: 0.4 })),
  ]);
  // Cornea (refractive surgery).
  addPart('laser', [
    lines([...meridians(profiles.cornea, 14, 0.2), ...parallels(profiles.cornea, [0.35, 0.7]), ...ring(HL, limbusA)], lineMaterial()),
    lathe(profiles.cornea, glowMaterial({ power: 1.8, intensity: 0.5, side: THREE.DoubleSide })),
  ]);
  // Iris and pupil.
  addPart('iris', [
    lines([
      ...radial(48, profiles.iris[0], profiles.iris[profiles.iris.length - 1]),
      ...ring(profiles.iris[0][0], profiles.iris[0][1], 64),
      ...ring(3.2, lensFrontA + 0.1, 72),
      ...ring(profiles.iris[profiles.iris.length - 1][0], profiles.iris[profiles.iris.length - 1][1], 96),
    ], lineMaterial()),
  ]);
  // Looking at the visitor, the eye has its black pupil.
  if (isLook) {
    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(profiles.iris[0][0], 48),
      new THREE.MeshBasicMaterial({ color: token('--c-ink', '#0d1a2b'), transparent: true, opacity: 0, depthWrite: false }),
    );
    pupil.rotation.x = -Math.PI / 2;
    pupil.position.y = profiles.iris[0][1] + 0.02;
    parts.iris.group.add(pupil);
    parts.iris.pupil = pupil;
  }
  // Lens (cataract).
  addPart('cataracte', [
    lines([...meridians(profiles.lens, 16, 0.1), ...ring(HA, lensEquatorA), ...parallels(profiles.lens, [0.25, 0.75])], lineMaterial()),
    lathe(profiles.lens, glowMaterial({ power: 1.6, intensity: 0.55, side: THREE.DoubleSide })),
  ]);

  // Retina (intravitreal injections): its inner wall, the macula, the optic disc and its vessels.
  const back = new THREE.Vector3(0, -1, 0);
  // The optic disc is 16° from the back pole, on the side of the nose (here +X).
  const disc = new THREE.Vector3(Math.sin(deg(16)), -Math.cos(deg(16)), 0);
  const vessel = (to, steps = 22, bulge = 0.12) => {
    const end = to.clone().normalize();
    const start = disc.clone();
    const points = [];
    let previous = onRetina(start, 0.08);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const direction = start.clone().lerp(end, t).normalize();
      const side = new THREE.Vector3().crossVectors(direction, end).normalize();
      direction.addScaledVector(side, Math.sin(t * Math.PI) * bulge + Math.sin(t * 9 + steps) * 0.012).normalize();
      const point = onRetina(direction, 0.08);
      points.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
      previous = point;
    }
    return points;
  };
  const maculaRing = [];
  for (let i = 0; i < 64; i++) {
    const p0 = (i / 64) * TAU;
    const p1 = ((i + 1) / 64) * TAU;
    const at = (p) => onRetina(new THREE.Vector3(Math.cos(p) * 0.24, -1, Math.sin(p) * 0.24), 0.06);
    const a = at(p0);
    const b = at(p1);
    maculaRing.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  addPart('ivt', [
    lines([
      ...meridians(profiles.retina, 14, 0.3),
      ...parallels(profiles.retina, [0.35, 0.7]),
      ...maculaRing,
      ...vessel(new THREE.Vector3(-0.9, -0.55, 0.85)),
      ...vessel(new THREE.Vector3(-0.9, -0.55, -0.85)),
      ...vessel(new THREE.Vector3(0.75, -0.2, 0.7), 18, -0.1),
      ...vessel(new THREE.Vector3(0.75, -0.2, -0.7), 18, -0.1),
    ], lineMaterial()),
    lathe(profiles.retina, glowMaterial({ side: THREE.BackSide, power: 1.4, intensity: 0.32 })),
  ]);

  // Optic nerve, leaving the back of the eye on the side of the nose.
  const nerve = new THREE.Group();
  const nerveLength = 9;
  const nerveRadius = 1.6;
  const nervePoints = [];
  for (let k = 0; k < 10; k++) {
    const phi = (k / 10) * TAU;
    nervePoints.push(nerveRadius * Math.cos(phi), 0, nerveRadius * Math.sin(phi), nerveRadius * 0.92 * Math.cos(phi), -nerveLength, nerveRadius * 0.92 * Math.sin(phi));
  }
  nerve.add(lines([...nervePoints, ...ring(nerveRadius, 0, 48), ...ring(nerveRadius * 0.92, -nerveLength, 48)], lineMaterial()));
  nerve.position.copy(disc.clone().multiplyScalar(R - 0.3));
  nerve.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), disc.clone().add(new THREE.Vector3(0.12, 0, 0)).normalize());
  addPart('nerve', [nerve]);
  parts.nerve.lines = nerve.children;

  // The optical axis: the eye's own front is +Y in lathe space; turned so that it faces +Z.
  eye.rotation.x = Math.PI / 2;

  // Eyelids (eyelid surgery): two translucent shells in front of the globe, with the almond opening
  // between their margins; their surface glows at the edges, their margins and fold are drawn.
  const LID_R = 12.9;
  const HALF_WIDTH = 11.6;
  const upperMargin = (x) => 5.4 * Math.max(0, 1 - (x / HALF_WIDTH) ** 2) ** 0.8 - 0.3;
  const lowerMargin = (x) => -4.2 * Math.max(0, 1 - (x / HALF_WIDTH) ** 2) ** 0.9 - 0.3;
  const onLid = (x, y, lift = 0) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0, (LID_R + lift) ** 2 - x * x - y * y)));
  const curve = (fn, lift = 0, from = -HALF_WIDTH, to = HALF_WIDTH, steps = 48) => {
    const points = [];
    for (let i = 0; i < steps; i++) {
      const x0 = from + ((to - from) * i) / steps;
      const x1 = from + ((to - from) * (i + 1)) / steps;
      const a = onLid(x0, fn(x0), lift);
      const b = onLid(x1, fn(x1), lift);
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    return points;
  };
  const lidsShell = new THREE.Mesh(
    new THREE.SphereGeometry(LID_R, 72, 48, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.12, Math.PI * 0.76),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: BASE.clone() },
        uIntensity: { value: 0.32 },
        uFade: { value: 0 },
        uHalfWidth: { value: HALF_WIDTH },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vLocal = position;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = -viewPosition.xyz;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uFade;
        uniform float uHalfWidth;
        varying vec3 vLocal;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float u = clamp(1.0 - pow(vLocal.x / uHalfWidth, 2.0), 0.0, 1.0);
          float upper = 5.4 * pow(u, 0.8) - 0.3;
          float lower = -4.2 * pow(u, 0.9) - 0.3;
          // The almond opening between the margins, crisp; the shell fades away from the eye.
          float opening = step(lower, vLocal.y) * step(vLocal.y, upper) * step(abs(vLocal.x), uHalfWidth);
          float front = smoothstep(2.0, 7.5, vLocal.z);
          float reach = 1.0 - smoothstep(9.0, 12.4, abs(vLocal.y));
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float rim = 0.25 + 0.75 * pow(1.0 - facing, 1.6);
          float alpha = (1.0 - opening) * front * reach * rim * uIntensity * uFade;
          gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      blending: BLENDING,
      depthWrite: false,
    }),
  );
  // (SphereGeometry: x = -cos(phi)·sin(theta), y = cos(theta), z = sin(phi)·sin(theta); the
  // phi and theta ranges above keep the part of the sphere that faces +Z, in front of the eye.)
  // Lashes along the margins, curving away from the eye (longer on the upper lid, as in life).
  const lashes = (margin, count, length, rise) => {
    const points = [];
    for (let i = 0; i < count; i++) {
      const x = -HALF_WIDTH * 0.86 + (HALF_WIDTH * 1.72 * i) / (count - 1);
      const along = Math.sqrt(Math.max(0, 1 - (x / HALF_WIDTH) ** 2));
      const base = onLid(x, margin(x), 0.05);
      const outward = base.clone().normalize();
      let previous = base;
      for (let k = 1; k <= 3; k++) {
        const t = k / 3;
        const point = base.clone()
          .addScaledVector(outward, length * along * t)
          .add(new THREE.Vector3(x * 0.012 * t, rise * along * t * t, 0));
        points.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
        previous = point;
      }
    }
    return points;
  };
  const lidLines = lines([
    ...curve(upperMargin, 0.05),
    ...curve(lowerMargin, 0.05),
    ...lashes(upperMargin, 34, 2.4, 1.6),
    ...lashes(lowerMargin, 22, 1.2, -0.8),
    ...curve((x) => upperMargin(x) + 3.2 * Math.max(0, 1 - (x / (HALF_WIDTH + 1)) ** 2) + 0.6, 0.05, -HALF_WIDTH - 0.5, HALF_WIDTH + 0.5),
    ...curve((x) => upperMargin(x) + 6.2, 0.05, -9, 9),
    ...curve((x) => lowerMargin(x) - 2.6, 0.05, -9.5, 9.5),
  ], lineMaterial());
  const lids = new THREE.Group();
  lids.add(lidsShell, lidLines);
  parts.paupieres = { group: lids, lines: [lidLines], glows: [lidsShell], lit: 0 };

  // The face of the eye: the globe, which can turn on its own (to look), and the lids.
  const globe = new THREE.Group();
  globe.add(eye);
  const head = new THREE.Group();
  head.add(globe, lids);

  // ---------- Scene ----------
  const canvas = stage.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  // No reading back of the compilation logs (made for development): it waits for every shader.
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(head);
  const camera = new THREE.PerspectiveCamera(28, 1, 10, 200);
  camera.position.set(0, 0, 80);

  // At most 2 pixels per point, phones starting at 1.5, never under 1.
  const finest = Math.min(window.devicePixelRatio || 1, 2);
  const isTouch = window.matchMedia('(hover: none)').matches;
  const fine = fineness({ max: finest, min: Math.min(finest, 1), start: isTouch ? Math.min(finest, 1.5) : finest, onChange: () => resize() });

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(fine.ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // The eye (about 30 mm with its lids, 27 mm seen from the front) fills three quarters of the
    // shorter side (a little more when it looks at the visitor).
    const fit = Math.min(1, camera.aspect);
    const size = isLook ? 27 : 30;
    const share = isLook ? 0.84 : 0.75;
    camera.position.z = size / (share * fit) / (2 * Math.tan(deg(camera.fov / 2)));
    camera.updateProjectionMatrix();
    requestFrame();
  };

  // ---------- State: the part shown, the turn of the eye, the glow of each part ----------
  const index = new Map([...document.querySelectorAll('.bloc-index a[href^="#"]')].map((link) => [link.hash.slice(1), link]));
  const playButton = document.querySelector('[data-eye3d-play]');
  const state = {
    zone: ORDER[0],
    pointed: null,
    isPlaying: true,
    isVisible: true,
    elapsed: 0,
    yaw: isLook ? 0 : -20,
    pitch: 0,
    since: 0,
    gazeYaw: 0,
    gazePitch: 0,
    targetGazeYaw: 0,
    targetGazePitch: 0,
    tiltX: 0,
    tiltY: 0,
    targetTiltX: 0,
    targetTiltY: 0,
    fade: 0,
  };
  // Looking at the visitor (404), no part is lit.
  const shownZone = () => (isLook ? null : state.pointed || state.zone);

  const markIndex = () => {
    index.forEach((link, zone) => link.classList.toggle('is-lit', zone === shownZone()));
  };

  const applyLight = (part, color, amount) => {
    part.lines.forEach((line) => {
      line.material.color.copy(BASE).lerp(color, amount);
      line.material.opacity = (LINE_OPACITY + (LINE_OPACITY_LIT - LINE_OPACITY) * amount) * state.fade;
    });
    part.glows.forEach((glow) => {
      glow.material.uniforms.uColor.value.copy(BASE).lerp(color, amount);
      glow.material.uniforms.uFade.value = state.fade * (1 + amount * 1.1);
    });
    if (part.pupil) {
      part.pupil.material.opacity = 0.88 * state.fade;
    }
  };

  // 404: where the eye looks while it searches the page (degrees, right and down positive), one
  // glance every 0.9 s, then back to the visitor: 4.5 s in all.
  const SEARCH = [[-24, 6], [20, -9], [-10, -15], [26, 10], [0, 0]];
  const SEARCH_START = 0.6;
  const SEARCH_STEP = 0.9;
  const searchEnd = SEARCH_START + SEARCH.length * SEARCH_STEP;

  // ---------- Loop: runs while something moves, stops once everything has settled ----------
  const timer = new THREE.Timer();
  timer.connect(document);
  let isRunning = false;
  const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

  const frame = (tick) => {
    fine.frame(tick);
    timer.update();
    // The 3 s of each part are counted in real time, whatever the number of frames per second; the
    // movements use a bounded step so that a slow frame never makes them jump.
    const elapsedTime = Math.min(2, timer.getDelta());
    const dt = Math.min(0.05, elapsedTime);
    const isAdvancing = !isLook && state.isPlaying && state.isVisible && !state.pointed;
    if (isAdvancing) {
      state.elapsed += elapsedTime;
      if (state.elapsed >= STEP_SECONDS) {
        state.elapsed = 0;
        state.zone = ORDER[(ORDER.indexOf(state.zone) + 1) % ORDER.length];
        markIndex();
      }
    }
    state.since += elapsedTime;
    const pose = isLook ? { yaw: 0, pitch: 0 } : POSES[shownZone()];
    state.yaw = damp(state.yaw, pose.yaw, 2.4, dt);
    state.pitch = damp(state.pitch, pose.pitch, 2.4, dt);
    // Looking: quick glances while searching (as saccades are), then the pointer is followed.
    const isSearching = isLook && state.since < searchEnd;
    if (isSearching) {
      const glance = SEARCH[Math.max(0, Math.min(SEARCH.length - 1, Math.floor((state.since - SEARCH_START) / SEARCH_STEP)))];
      const hasStarted = state.since >= SEARCH_START;
      state.targetGazeYaw = hasStarted ? glance[0] : 0;
      state.targetGazePitch = hasStarted ? glance[1] : 0;
    }
    const gazeRate = isSearching ? 14 : 7;
    state.gazeYaw = damp(state.gazeYaw, state.targetGazeYaw, gazeRate, dt);
    state.gazePitch = damp(state.gazePitch, state.targetGazePitch, gazeRate, dt);
    globe.rotation.set(deg(state.gazePitch), deg(state.gazeYaw), 0);
    state.tiltX = damp(state.tiltX, state.targetTiltX, 3, dt);
    state.tiltY = damp(state.tiltY, state.targetTiltY, 3, dt);
    state.fade = damp(state.fade, 1, 1.6, dt);
    head.rotation.set(deg(state.pitch + state.tiltY), deg(state.yaw + state.tiltX), 0);

    let isSettled = Math.abs(state.yaw - pose.yaw) < 0.05 && Math.abs(state.pitch - pose.pitch) < 0.05
      && Math.abs(state.tiltX - state.targetTiltX) < 0.02 && Math.abs(state.tiltY - state.targetTiltY) < 0.02 && state.fade > 0.999
      && !isSearching && Math.abs(state.gazeYaw - state.targetGazeYaw) < 0.05 && Math.abs(state.gazePitch - state.targetGazePitch) < 0.05;
    Object.entries(parts).forEach(([name, part]) => {
      const color = ZONES[name];
      const target = color && name === shownZone() ? 1 : 0;
      part.lit = damp(part.lit, target, 3.2, dt);
      if (Math.abs(part.lit - target) > 0.002) {
        isSettled = false;
      }
      applyLight(part, color || BASE, color ? part.lit : 0);
    });
    renderer.render(scene, camera);
    if (isSettled && !isAdvancing) {
      renderer.setAnimationLoop(null);
      isRunning = false;
      fine.rest();
    }
  };

  function requestFrame() {
    if (!isRunning && state.isVisible && !document.hidden) {
      isRunning = true;
      timer.reset();
      renderer.setAnimationLoop(frame);
    }
  }

  // ---------- Controls ----------
  const setPlaying = (isPlaying) => {
    state.isPlaying = isPlaying;
    if (playButton) {
      playButton.classList.toggle('is-paused', !isPlaying);
      playButton.setAttribute('aria-label', isPlaying ? "Mettre en pause l'animation de l'œil" : "Reprendre l'animation de l'œil");
    }
    requestFrame();
  };
  playButton?.addEventListener('click', () => setPlaying(!state.isPlaying));

  index.forEach((link, zone) => {
    const show = () => {
      state.pointed = zone;
      markIndex();
      requestFrame();
    };
    const release = () => {
      if (state.pointed === zone) {
        state.pointed = null;
        state.zone = zone;
        state.elapsed = 0;
        markIndex();
        requestFrame();
      }
    };
    link.addEventListener('pointerenter', show);
    link.addEventListener('focus', show);
    link.addEventListener('pointerleave', release);
    link.addEventListener('blur', release);
  });

  // 404: once it has searched, the eye looks at the pointer (or where the page is touched).
  if (isLook) {
    const lookAt = (event) => {
      const box = stage.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / Math.max(1, box.width);
      const dy = (event.clientY - (box.top + box.height / 2)) / Math.max(1, box.height);
      if (state.since >= searchEnd) {
        state.targetGazeYaw = Math.max(-32, Math.min(32, dx * 70));
        state.targetGazePitch = Math.max(-20, Math.min(20, dy * 45));
        requestFrame();
      }
    };
    window.addEventListener('pointermove', lookAt, { passive: true });
    window.addEventListener('pointerdown', lookAt, { passive: true });
  }

  // With a mouse, the eye leans a little towards the pointer over the head of the page.
  const pageHead = stage.closest('section') || stage;
  if (!isLook && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    pageHead.addEventListener('pointermove', (event) => {
      const box = pageHead.getBoundingClientRect();
      state.targetTiltX = ((event.clientX - box.left) / box.width - 0.5) * 10;
      state.targetTiltY = ((event.clientY - box.top) / box.height - 0.5) * 8;
      requestFrame();
    });
    pageHead.addEventListener('pointerleave', () => {
      state.targetTiltX = 0;
      state.targetTiltY = 0;
      requestFrame();
    });
  }

  new ViewWatcher((entries) => {
    state.isVisible = entries[0].isIntersecting;
    requestFrame();
  }).observe(stage);
  document.addEventListener('visibilitychange', requestFrame);
  new ResizeObserver(resize).observe(stage);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    isRunning = false;
    stage.classList.remove('is-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    stage.classList.add('is-ready');
    requestFrame();
  });

  resize();
  markIndex();
  if (playButton) {
    playButton.hidden = false;
  }
  stage.classList.add('is-ready');
  requestFrame();
}
