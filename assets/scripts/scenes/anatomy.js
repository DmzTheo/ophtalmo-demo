// Diseases page, under the index of the atlas, on a small night screen like that of an examination
// device: the eye drawn in lines of light, like the eye of the surgeries page, turned so that its back
// faces us: one sees through it its back wall, where the four diseases act. The one chosen in the index (or pointed in it) is framed by a target, comes out in its
// colour and plays what happens there:
// - glaucoma: the nerve fibres carry the image to the optic nerve while the pressure pushes on the
//   back of the eye; the cup of the nerve widens and the outer fibres go out;
// - diabetes: blood runs in the vessels, small swellings and bleeds appear, then new fragile vessels;
// - AMD: drusen lift the small grid laid on the macula and bend its lines;
// - detachment: through a tear, a piece of retina lifts off the wall and floats.
// The story plays again every 9 s. Proportions in millimetres, as in _build/eye.js (adult eye).

import { createInk } from './ink.js';

const TAU = Math.PI * 2;
const deg = (value) => (value * Math.PI) / 180;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// ---------- The eye (lathe space: Y is the axis of the eye, its front towards +Y) ----------
const R = 12;
const RC = 7.8;
const HL = 5.85;
const LIMBUS = Math.sqrt(R * R - HL * HL);
const CORNEA_CENTRE = LIMBUS - Math.sqrt(RC * RC - HL * HL);
const APEX = CORNEA_CENTRE + RC;
const RA = 10;
const RP = 5.2;
const HA = 4.75;
const LENS_FRONT = APEX - 3.0;
const LENS_FRONT_CENTRE = LENS_FRONT - RA;
const LENS_EQUATOR = LENS_FRONT_CENTRE + Math.sqrt(RA * RA - HA * HA);
const LENS_BACK = LENS_EQUATOR - (RP - Math.sqrt(RP * RP - HA * HA));
const LENS_BACK_CENTRE = LENS_BACK + RP;
const RETINA = R - 0.85 - 0.32 - 0.32;
const ORA = deg(58);

// The story of each disease lasts this long, then plays again (s); the moment when all of it is
// there serves while a disease fades out.
const CYCLE = 9;
const SETTLED = CYCLE - 1.5;

// How the eye turns to show each disease (degrees): its back towards us, a little to the right.
const POSES = {
  glaucome: { yaw: -50, pitch: 10 },
  diabete: { yaw: -60, pitch: 8 },
  dmla: { yaw: -68, pitch: 6 },
  decollement: { yaw: -48, pitch: -16 },
};

// The back wall, in angles (radians) from the back pole: a towards the nose (where the optic disc
// is), b upwards. The disc is 16° from the pole, on the side of the nose.
const DISC = [deg(16), 0];
const DISC_RADIUS = 0.08;

// Where the target frames each disease (none: the middle of the piece of retina that lifts) and its
// size (mm).
const FOCUS = {
  glaucome: { at: DISC, size: 3.4 },
  diabete: { at: [0.02, 0.02], size: 7.4 },
  dmla: { at: [0, 0], size: 3.8 },
  decollement: { at: null, size: 6.6 },
};

const ARCADES = [
  // The temporal arcades go round the macula; the nasal vessels go straight.
  [[0.279, 0], [0.25, 0.1], [0.14, 0.21], [-0.02, 0.28], [-0.24, 0.3], [-0.48, 0.25], [-0.72, 0.15], [-0.94, 0.07]],
  [[0.279, 0], [0.36, 0.08], [0.5, 0.18], [0.7, 0.27], [0.94, 0.33]],
  [[0.279, 0], [0.42, 0.01], [0.64, 0.0], [0.92, -0.02]],
];
const BRANCHES = [
  // [arcade, index of the point where it leaves, points]
  [0, 3, [[-0.06, 0.45], [-0.1, 0.66], [-0.12, 0.9]]],
  [0, 4, [[-0.32, 0.48], [-0.42, 0.7]]],
  [0, 5, [[-0.62, 0.42], [-0.8, 0.56]]],
  [0, 2, [[0.08, 0.14], [0.03, 0.11]]],
  [0, 3, [[-0.05, 0.18], [-0.07, 0.13]]],
  [1, 2, [[0.52, 0.36], [0.56, 0.62]]],
];
const ANEURYSMS = [[-0.12, 0.18], [0.02, 0.2], [-0.3, 0.2], [-0.2, -0.17], [0.0, -0.22], [-0.38, -0.14], [0.15, 0.12], [0.12, -0.14], [-0.5, 0.1], [-0.08, 0.33]];
const BLEEDS = [[-0.25, 0.37], [0.05, -0.34], [-0.55, -0.25], [0.3, 0.3], [-0.42, 0.43]];
const DRUSEN = [[0.04, 0.05], [-0.06, 0.03], [0.0, -0.07], [-0.1, -0.05], [0.09, -0.03], [-0.04, 0.11], [0.07, 0.1], [-0.13, 0.08]];
// The piece of retina that lifts: below, on the side of the nose (the side turned towards us), between
// these angles from the pole.
const FLAP = { theta: [0.5, 1.3], phi: [deg(-95), deg(-35)], rows: 9, columns: 11 };
const TEAR = { u: 0.8, v: 0.5 };
const FLOATERS = [[-2.2, 1.4, 2.6], [1.6, -0.8, 3.4], [-0.6, 2.8, -1.8], [2.6, 1.6, 0.4], [-1.8, -2.4, -0.6]];

const pointsVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_PointSize = aSize * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Round dots, full (bleeds, drusen, drops), soft (the halo of the target) or as small rings.
const pointsFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    #if defined(RING)
      float shape = smoothstep(0.5, 0.4, d) * smoothstep(0.16, 0.26, d);
    #elif defined(SOFT)
      float shape = smoothstep(0.5, 0.0, d);
    #else
      float shape = smoothstep(0.5, 0.36, d);
    #endif
    float alpha = shape * vAlpha * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

const glowVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

// Surfaces only show on their edges, like glass against the light.
const glowFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    gl_FragColor = vec4(uColor, clamp(pow(1.0 - facing, uPower) * uIntensity, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);

  // The lines in light blue; each disease in its own colour, taken a little deeper and more saturated
  // so that lines crossing each other keep it instead of turning white (as on the surgeries page);
  // the pulses that run along them are lighter.
  const INK = new THREE.Color(kit.css('--c-sky', '#a8c8f3'));
  const DISEASES = ['glaucome', 'diabete', 'dmla', 'decollement'];
  const TOKENS = { glaucome: 'jade', diabete: 'raspberry', dmla: 'gold', decollement: 'plum' };
  const light = (name) => new THREE.Color(kit.css(`--c-${TOKENS[name]}`, '#a8c8f3'));
  const COLOURS = Object.fromEntries(DISEASES.map((name) => [name, light(name).offsetHSL(0, 0.12, -0.1)]));
  const LIGHTS = Object.fromEntries(DISEASES.map((name) => [name, light(name).lerp(new THREE.Color('#ffffff'), 0.45)]));

  // Every ribbon material, so that their width follows the pixel ratio.
  const ribbonShaders = [];
  const ribbon = (color, opacity, width) => {
    const shader = ink.material(color, opacity, { width, isLight: true });
    ribbonShaders.push(shader);
    return shader;
  };
  const hairline = (color, opacity) => ink.material(color, opacity, { isLight: true });
  const dotsShader = (color, kind = '') => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 }, uScale: { value: 1 } },
    defines: kind ? { [kind]: 1 } : {},
    vertexShader: pointsVertexShader,
    fragmentShader: pointsFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowShader = (color, intensity, power, side) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uIntensity: { value: intensity }, uPower: { value: power } },
    vertexShader: glowVertexShader,
    fragmentShader: glowFragmentShader,
    side,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dots = (count, shader) => {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const size = new THREE.BufferAttribute(new Float32Array(count), 1);
    const alpha = new THREE.BufferAttribute(new Float32Array(count), 1);
    [position, size, alpha].forEach((attribute) => attribute.setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('position', position);
    geometry.setAttribute('aSize', size);
    geometry.setAttribute('aAlpha', alpha);
    const object = new THREE.Points(geometry, shader);
    object.frustumCulled = false;
    return {
      object,
      shader,
      set(i, point, pointSize, pointAlpha) {
        position.setXYZ(i, point.x, point.y, point.z);
        size.setX(i, pointSize);
        alpha.setX(i, pointAlpha);
      },
      done() {
        position.needsUpdate = true;
        size.needsUpdate = true;
        alpha.needsUpdate = true;
      },
    };
  };

  // ---------- Geometry ----------
  const lathePoint = (r, a, phi) => new THREE.Vector3(r * Math.cos(phi), a, r * Math.sin(phi));
  const arc = (count, from, to, point) => Array.from({ length: count + 1 }, (_, i) => point(from + ((to - from) * i) / count));
  const profiles = {
    sclera: arc(40, Math.asin(HL / R), Math.PI, (t) => [R * Math.sin(t), R * Math.cos(t)]),
    cornea: arc(18, 0, Math.asin(HL / RC), (t) => [RC * Math.sin(t), CORNEA_CENTRE + RC * Math.cos(t)]),
    lens: [
      ...arc(14, 0, Math.asin(HA / RA), (t) => [RA * Math.sin(t), LENS_FRONT_CENTRE + RA * Math.cos(t)]),
      ...arc(14, Math.asin(HA / RP), 0, (t) => [RP * Math.sin(t), LENS_BACK_CENTRE - RP * Math.cos(t)]).slice(1),
    ],
    retina: arc(36, ORA, Math.PI, (t) => [RETINA * Math.sin(t), RETINA * Math.cos(t)]),
  };
  const meridians = (builder, profile, count, phase = 0) => {
    for (let k = 0; k < count; k++) {
      const phi = phase + (k / count) * TAU;
      builder.line(profile.map(([r, a]) => lathePoint(r, a, phi)));
    }
  };
  const ring = (builder, r, a, segments = 96) => {
    builder.line(Array.from({ length: segments + 1 }, (_, i) => lathePoint(r, a, (i / segments) * TAU)));
  };
  const along = (profile, t) => {
    const i = Math.min(profile.length - 2, Math.floor(t * (profile.length - 1)));
    const f = t * (profile.length - 1) - i;
    return [profile[i][0] + (profile[i + 1][0] - profile[i][0]) * f, profile[i][1] + (profile[i + 1][1] - profile[i][1]) * f];
  };

  // The back wall: a point from its angles from the pole (a towards the nose, b upwards).
  const POLE = new THREE.Vector3(0, -1, 0);
  const NASAL = new THREE.Vector3(0, 0, 1);
  const UP = new THREE.Vector3(1, 0, 0);
  const direction = (a, b) => {
    const theta = Math.hypot(a, b);
    const result = POLE.clone();
    if (theta > 1e-6) {
      result.multiplyScalar(Math.cos(theta))
        .addScaledVector(NASAL, (Math.sin(theta) * a) / theta)
        .addScaledVector(UP, (Math.sin(theta) * b) / theta);
    }
    return result;
  };
  const onWall = (a, b, inset = 0) => direction(a, b).multiplyScalar(RETINA - inset);
  // A smooth curve through points given in angles, as points on the wall.
  const wallCurve = (points, inset, samples = 36) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([a, b]) => new THREE.Vector3(a, b, 0)), false, 'centripetal');
    return curve.getPoints(samples).map((p) => onWall(p.x, p.y, inset));
  };

  const root = new THREE.Group();
  scene.add(root);
  const model = new THREE.Group();
  root.add(model);
  const eye = new THREE.Group();
  // The axis of the eye lies horizontal, its front towards -X.
  eye.rotation.z = Math.PI / 2;
  model.add(eye);

  // ---------- The eye itself, in thin lines of light, as on the surgeries page ----------
  const wall = ink.strokes();
  meridians(wall, profiles.sclera, 20, 0.08);
  [0.2, 0.42, 0.62, 0.82].forEach((t) => ring(wall, ...along(profiles.sclera, t)));
  ring(wall, HL, LIMBUS);
  meridians(wall, profiles.cornea, 14, 0.2);
  [0.35, 0.7].forEach((t) => ring(wall, ...along(profiles.cornea, t)));
  for (let k = 0; k < 48; k++) {
    const phi = (k / 48) * TAU + Math.sin(k * 2.3) * 0.04;
    wall.line([lathePoint(1.9, LENS_FRONT + 0.32, phi), lathePoint(5.7, LENS_FRONT - 0.18, phi)]);
  }
  ring(wall, 1.9, LENS_FRONT + 0.32, 64);
  ring(wall, 3.2, LENS_FRONT + 0.1, 72);
  ring(wall, 5.7, LENS_FRONT - 0.18, 96);
  meridians(wall, profiles.lens, 16, 0.1);
  ring(wall, HA, LENS_EQUATOR, 72);
  [0.25, 0.75].forEach((t) => ring(wall, ...along(profiles.lens, t), 72));
  eye.add(wall.lines(hairline(INK, 0.2)));
  const retina = ink.strokes();
  meridians(retina, profiles.retina, 14, 0.3);
  [0.35, 0.7].forEach((t) => ring(retina, ...along(profiles.retina, t)));
  eye.add(retina.lines(hairline(INK, 0.12)));

  // Surfaces glow on their edges, like glass seen against the light.
  const lathe = (profile) => new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(Math.max(r, 0.001), a)), 72);
  const scleraGlow = new THREE.Mesh(lathe(profiles.sclera), glowShader(INK, 0, 2.4, THREE.FrontSide));
  const corneaGlow = new THREE.Mesh(lathe(profiles.cornea), glowShader(INK, 0, 1.8, THREE.DoubleSide));
  const lensGlow = new THREE.Mesh(lathe(profiles.lens), glowShader(INK, 0, 1.6, THREE.DoubleSide));
  const innerGlow = new THREE.Mesh(lathe(profiles.retina), glowShader(INK, 0, 1.4, THREE.BackSide));
  eye.add(scleraGlow, corneaGlow, lensGlow, innerGlow);

  // ---------- The optic nerve, its disc and its cup ----------
  const discDirection = direction(...DISC);
  const nerve = new THREE.Group();
  const nerveLines = ink.strokes();
  const NERVE_LENGTH = 9;
  const NERVE_RADIUS = 1.7;
  for (let k = 0; k < 10; k++) {
    const phi = (k / 10) * TAU;
    nerveLines.line([
      new THREE.Vector3(NERVE_RADIUS * Math.cos(phi), 0, NERVE_RADIUS * Math.sin(phi)),
      new THREE.Vector3(NERVE_RADIUS * 0.9 * Math.cos(phi), -NERVE_LENGTH, NERVE_RADIUS * 0.9 * Math.sin(phi)),
    ]);
  }
  [0, -4.5, -NERVE_LENGTH].forEach((y, i) => ring(nerveLines, NERVE_RADIUS * (1 - i * 0.05), y, 40));
  const nerveShader = ribbon(INK, 0.22, 1.2);
  nerve.add(nerveLines.ribbons(nerveShader));
  nerve.position.copy(discDirection.clone().multiplyScalar(R - 0.4));
  // The nerve leaves the eye backwards, bending a little more towards the nose.
  nerve.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), discDirection.clone().addScaledVector(NASAL, 0.18).normalize());
  eye.add(nerve);

  const discLines = ink.strokes();
  discLines.line(Array.from({ length: 49 }, (_, i) => {
    const psi = (i / 48) * TAU;
    return onWall(DISC[0] + DISC_RADIUS * Math.cos(psi), DISC_RADIUS * Math.sin(psi), 0.04);
  }));
  const discShader = ribbon(INK, 0.4, 1.4);
  eye.add(discLines.ribbons(discShader));

  // The cup, a small funnel going down into the nerve: it widens and deepens with glaucoma.
  const cupShader = ribbon(INK, 0, 1.3);
  const cup = ink.movingRibbons(3 * 28, cupShader);
  eye.add(cup.object);
  const cupFrameA = new THREE.Vector3().crossVectors(discDirection, UP).normalize();
  const cupFrameB = new THREE.Vector3().crossVectors(discDirection, cupFrameA).normalize();
  const drawCup = (opening) => {
    const radius = RETINA * (0.026 + 0.034 * opening);
    const depth = 0.35 + 1.2 * opening;
    cup.begin();
    for (let k = 0; k < 3; k++) {
      const ringRadius = radius * (1 - k * 0.25);
      const centre = discDirection.clone().multiplyScalar(RETINA - 0.04 + (depth * k) / 2);
      cup.line(Array.from({ length: 29 }, (_, i) => {
        const psi = (i / 28) * TAU;
        return centre.clone().addScaledVector(cupFrameA, ringRadius * Math.cos(psi)).addScaledVector(cupFrameB, ringRadius * Math.sin(psi));
      }));
    }
    cup.end();
  };

  // ---------- Glaucoma: the nerve fibres, and the pressure ----------
  // Each fibre runs over the retina to the disc; its key says how far out it starts (the outer ones
  // are lost first, the bundle of the macula last).
  const fibreSpecs = [];
  for (let i = 0; i < 7; i++) {
    const a = -0.15 - 0.12 * i;
    [1, -1].forEach((side) => fibreSpecs.push({ start: [a, 0.02 * side], lift: (0.24 + 0.55 * Math.abs(a)) * side }));
  }
  [[-0.3, 0.86], [0.0, 0.95], [0.26, 0.9], [-0.62, 0.7]].forEach(([a, b]) => {
    [1, -1].forEach((side) => fibreSpecs.push({ start: [a, b * side], lift: 0.12 * side }));
  });
  [-0.44, -0.3, -0.15, 0, 0.15, 0.3, 0.44].forEach((b) => fibreSpecs.push({ start: [0.88 - 0.12 * Math.abs(b), b], lift: 0 }));
  [[-0.06, 0.03], [-0.06, -0.03], [0.0, 0.0]].forEach((start) => fibreSpecs.push({ start, lift: 0, isMacular: true }));
  const fibres = ink.strokes();
  fibreSpecs.forEach(({ start, lift, isMacular }) => {
    const [a0, b0] = start;
    const [a2, b2] = DISC;
    const a1 = (a0 + a2) / 2;
    const b1 = (b0 + b2) / 2 + lift;
    const points = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      points.push(onWall((1 - t) ** 2 * a0 + 2 * (1 - t) * t * a1 + t * t * a2, (1 - t) ** 2 * b0 + 2 * (1 - t) * t * b1 + t * t * b2, 0.06));
    }
    fibres.line(points, { key: isMacular ? 0 : clamp01(Math.hypot(a0 - a2, b0 - b2) / 1.15) });
  });
  const fibreShader = ribbon(COLOURS.glaucome, 0, 1.3);
  fibreShader.uniforms.uGlow.value.copy(LIGHTS.glaucome);
  eye.add(fibres.ribbons(fibreShader));

  // The pressure: small chevrons crossing the eye towards its back, around the disc.
  const pushShader = ribbon(COLOURS.glaucome, 0, 1.6);
  const pushes = ink.movingRibbons(8 * 2, pushShader);
  eye.add(pushes.object);
  const pushDirections = [[0.1, 0.18], [0.35, 0.05], [0.12, -0.2], [-0.15, 0.02], [0.3, 0.3], [0.32, -0.28], [-0.1, 0.32], [-0.08, -0.3]]
    .map(([a, b]) => direction(a, b));
  const drawPushes = (time) => {
    pushes.begin();
    pushDirections.forEach((dir, i) => {
      const p = (time * 0.42 + i / pushDirections.length) % 1;
      const size = Math.sin(Math.PI * p) * 1.1;
      const apex = dir.clone().multiplyScalar(2 + p * 6.8);
      const side = new THREE.Vector3().crossVectors(dir, NASAL).normalize();
      const back = apex.clone().addScaledVector(dir, -size);
      pushes.push(back.clone().addScaledVector(side, size * 0.8), apex);
      pushes.push(apex, back.clone().addScaledVector(side, -size * 0.8));
    });
    pushes.end();
  };

  // ---------- Diabetes: the vessels and what happens to them ----------
  // The vessels are always there, faint; with diabetes they come out and the blood runs in them. Their
  // place along themselves is their distance from the disc, so that the pulses leave the disc together.
  const SPREAD = 1.15;
  const vessels = ink.strokes();
  const arcadeCurves = [];
  [1, -1].forEach((side) => {
    ARCADES.forEach((points, index) => {
      const isNasalOnce = index === 2 && side === -1;
      if (isNasalOnce) {
        return;
      }
      const mirrored = points.map(([a, b]) => [a, b * side]);
      const lengths = [0];
      for (let i = 1; i < mirrored.length; i++) {
        lengths.push(lengths[i - 1] + Math.hypot(mirrored[i][0] - mirrored[i - 1][0], mirrored[i][1] - mirrored[i - 1][1]));
      }
      arcadeCurves.push({ points: mirrored, lengths, side, index });
      // The large vessels go in pairs, artery and vein side by side.
      const strands = index === 0 ? [-0.014, 0.014] : [0];
      strands.forEach((offset) => {
        const shifted = mirrored.map(([a, b], i) => [a, b + (i === 0 ? 0 : offset)]);
        vessels.line(wallCurve(shifted, 0.12), { from: 0, to: lengths[lengths.length - 1] / SPREAD });
      });
    });
  });
  BRANCHES.forEach(([arcadeIndex, at, points]) => {
    arcadeCurves.filter((curve) => curve.index === arcadeIndex).forEach((curve) => {
      const branch = [curve.points[at], ...points.map(([a, b]) => [a, b * curve.side])];
      let length = 0;
      for (let i = 1; i < branch.length; i++) {
        length += Math.hypot(branch[i][0] - branch[i - 1][0], branch[i][1] - branch[i - 1][1]);
      }
      vessels.line(wallCurve(branch, 0.12, 20), { from: curve.lengths[at] / SPREAD, to: (curve.lengths[at] + length) / SPREAD });
    });
  });
  const vesselShader = ribbon(INK, 0.2, 1.4);
  eye.add(vessels.ribbons(vesselShader));

  const swellings = dots(ANEURYSMS.length, dotsShader(COLOURS.diabete, 'RING'));
  const bleeds = dots(BLEEDS.length, dotsShader(COLOURS.diabete));
  eye.add(swellings.object, bleeds.object);

  // New fragile vessels, growing from the disc into the vitreous.
  const sprouts = ink.strokes();
  [deg(70), deg(160), deg(250), deg(320)].forEach((psi, n) => {
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const reach = DISC_RADIUS + t * (0.22 + 0.04 * n);
      const wiggle = Math.sin(t * 14 + n * 2) * 0.035 * t;
      points.push(onWall(DISC[0] + reach * Math.cos(psi) - wiggle * Math.sin(psi), reach * Math.sin(psi) + wiggle * Math.cos(psi), 0.12 + t * t * 1.6));
    }
    sprouts.line(points);
  });
  const sproutShader = ribbon(COLOURS.diabete, 0, 1.2);
  eye.add(sprouts.ribbons(sproutShader));

  // ---------- AMD: the macula, its small grid and the drusen ----------
  const macula = ink.strokes();
  [0.035, 0.075, 0.2].forEach((radius) => {
    macula.line(Array.from({ length: 65 }, (_, i) => {
      const psi = (i / 64) * TAU;
      return onWall(radius * Math.cos(psi), radius * Math.sin(psi), 0.1);
    }));
  });
  const maculaShader = ribbon(INK, 0.24, 1.1);
  eye.add(macula.ribbons(maculaShader));

  const GRID = 10;
  const GRID_HALF = 0.22;
  const gridShader = ribbon(COLOURS.dmla, 0, 1.1);
  const grid = ink.movingRibbons(2 * (GRID + 1) * GRID, gridShader);
  eye.add(grid.object);
  const drusenDots = dots(DRUSEN.length + 1, dotsShader(COLOURS.dmla));
  eye.add(drusenDots.object);
  const swellAt = (a, b, amount, time) => DRUSEN.reduce((sum, [da, db], i) => {
    const size = amount * (1 + 0.14 * Math.sin(time * 1.7 + i * 1.3));
    return sum + size * Math.exp(-((a - da) ** 2 + (b - db) ** 2) / (0.045 * 0.045));
  }, 0);
  const drawGrid = (amount, time) => {
    const at = (i, j) => {
      const a = -GRID_HALF + (2 * GRID_HALF * i) / GRID;
      const b = -GRID_HALF + (2 * GRID_HALF * j) / GRID;
      return onWall(a, b, 0.16 + swellAt(a, b, amount, time));
    };
    grid.begin();
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const t0 = (j + i / GRID) / (GRID + 1);
        const t1 = (j + (i + 1) / GRID) / (GRID + 1);
        grid.push(at(i, j), at(i + 1, j), t0, t1);
        grid.push(at(j, i), at(j, i + 1), t0, t1);
      }
    }
    grid.end();
  };

  // ---------- Detachment: a piece of retina lifting off through a tear ----------
  const flapShader = ribbon(COLOURS.decollement, 0, 1.2);
  const flap = ink.movingRibbons(FLAP.rows * (FLAP.columns + 1) + FLAP.columns * (FLAP.rows + 1) + 24, flapShader);
  eye.add(flap.object);
  const flapPoint = (u, v, height) => {
    const theta = FLAP.theta[0] + u * (FLAP.theta[1] - FLAP.theta[0]);
    const phi = FLAP.phi[0] + v * (FLAP.phi[1] - FLAP.phi[0]);
    return onWall(theta * Math.cos(phi), theta * Math.sin(phi), 0.05 + height);
  };
  const flapHeight = (u, v, amount, time) => amount * 2.3 * Math.sin(Math.PI * u) ** 0.75 * Math.sin(Math.PI * v) ** 0.9
    * (0.86 + 0.14 * Math.sin(time * 1.5 + u * 3.2 + v * 1.4));
  const drawFlap = (amount, time) => {
    flap.begin();
    for (let j = 0; j <= FLAP.columns; j++) {
      const v = j / FLAP.columns;
      flap.line(Array.from({ length: FLAP.rows + 1 }, (_, i) => flapPoint(i / FLAP.rows, v, flapHeight(i / FLAP.rows, v, amount, time))));
    }
    for (let i = 0; i <= FLAP.rows; i++) {
      const u = i / FLAP.rows;
      flap.line(Array.from({ length: FLAP.columns + 1 }, (_, j) => flapPoint(u, j / FLAP.columns, flapHeight(u, j / FLAP.columns, amount, time))));
    }
    // The torn edge, a horseshoe, stands up a little more than the rest.
    flap.line(Array.from({ length: 21 }, (_, i) => {
      const s = -Math.PI / 2 + (i / 20) * Math.PI;
      const u = TEAR.u - 0.09 * Math.cos(s);
      const v = TEAR.v + 0.13 * Math.sin(s);
      return flapPoint(u, v, flapHeight(u, v, amount, time) + amount * 0.45);
    }));
    flap.end();
  };
  // Fluid from the vitreous passing through the tear under the retina; floaters in the vitreous.
  const drops = dots(7, dotsShader(COLOURS.decollement));
  const floaters = dots(FLOATERS.length, dotsShader(COLOURS.decollement));
  eye.add(drops.object, floaters.object);

  // ---------- The target: a ring facing us around the place of the disease, gliding to the next ----------
  const target = ink.strokes();
  target.line(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * TAU), Math.sin((i / 96) * TAU), 0)));
  // Four small ticks, as on the targets of the schemas.
  [0, 1, 2, 3].forEach((k) => {
    const angle = (k / 4) * TAU + TAU / 8;
    target.segment(new THREE.Vector3(Math.cos(angle) * 1.1, Math.sin(angle) * 1.1, 0), new THREE.Vector3(Math.cos(angle) * 1.28, Math.sin(angle) * 1.28, 0));
  });
  const targetShader = ribbon(INK, 0, 1.4);
  const targetRing = target.ribbons(targetShader);
  root.add(targetRing);
  const halo = dots(1, dotsShader(INK, 'SOFT'));
  root.add(halo.object);
  const focusPoint = new THREE.Vector3();
  const focusGoal = new THREE.Vector3();
  let focusSize = 4;
  let isFocusPlaced = false;

  // ---------- Camera ----------
  let pointScale = 1;
  let pixelsPerMillimetre = 10;
  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    // The globe and its nerve, with a margin all round.
    const distance = Math.max(13.6 / Math.tan(halfFov), 15.2 / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(2, 0, distance);
    camera.lookAt(2, 0, 0);
    camera.updateProjectionMatrix();
    const ratio = kit.renderer.getPixelRatio();
    ink.resize(width, height, ratio, ribbonShaders);
    pointScale = ratio * Math.max(0.75, Math.min(1.3, height / 420));
    pixelsPerMillimetre = (ratio * height) / (2 * distance * Math.tan(halfFov));
    [swellings, bleeds, drusenDots, drops, floaters].forEach((set) => {
      set.shader.uniforms.uScale.value = pointScale;
    });
  };

  // ---------- The disease shown: chosen in the index of the atlas, or pointed in it ----------
  const tabs = [...document.querySelectorAll('[data-atlas-tab]')];
  let chosen = 'glaucome';
  let pointed = null;
  const readChoice = () => {
    chosen = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.atlasTab || chosen;
    kit.wake();
  };
  if (tabs.length) {
    new MutationObserver(readChoice).observe(tabs[0].closest('ol'), { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
    tabs.forEach((tab) => {
      tab.addEventListener('pointerenter', () => {
        pointed = tab.dataset.atlasTab;
        kit.wake();
      });
      tab.addEventListener('pointerleave', () => {
        pointed = null;
        kit.wake();
      });
    });
    readChoice();
  }

  const lit = { glaucome: 0, diabete: 0, dmla: 0, decollement: 0 };
  let shown = null;
  let since = 0;
  let yaw = POSES.glaucome.yaw + 40;
  let pitch = POSES.glaucome.pitch;
  let fade = 0;
  const follow = (value, goal, rate, dt) => value + (goal - value) * (1 - Math.exp(-rate * dt));
  const tint = (shader, name, amount, base, top) => {
    shader.uniforms.uColor.value.copy(INK).lerp(COLOURS[name], amount);
    shader.uniforms.uGlow.value.copy(LIGHTS[name]);
    shader.uniforms.uOpacity.value = (base + (top - base) * amount) * fade;
  };

  const update = ({ time, elapsed, pointer }) => {
    const current = pointed || chosen;
    if (current !== shown) {
      shown = current;
      since = time;
    }
    // Changes follow real time, whatever the number of frames per second.
    const dt = Math.min(0.25, elapsed);
    fade = follow(fade, 1, 1.8, dt);
    DISEASES.forEach((name) => {
      lit[name] = follow(lit[name], name === shown ? 1 : 0, 4, dt);
    });
    // Where the story of each disease is: the one shown plays it again every CYCLE seconds, after a
    // fade; one going out keeps its story at its fullest while it fades.
    const shownPhase = (time - since) % CYCLE;
    const phaseOf = (name) => (name === shown ? shownPhase : SETTLED);
    const storyOf = (name) => 1 - smooth(CYCLE - 1, CYCLE - 0.15, phaseOf(name));

    // The eye turns to show the disease, sways slowly and leans towards the pointer.
    const pose = POSES[shown];
    yaw = follow(yaw, pose.yaw + Math.sin(time * 0.33) * 7 + pointer.x * 14, 2.2, dt);
    pitch = follow(pitch, pose.pitch - pointer.y * 7, 2.2, dt);
    model.rotation.set(deg(pitch), deg(yaw), 0);
    model.updateMatrixWorld(true);

    // The target glides to the place of the disease shown.
    const spot = FOCUS[shown];
    focusGoal.copy(spot.at ? onWall(spot.at[0], spot.at[1], 0.3) : flapPoint(0.5, 0.5, 0.6));
    eye.localToWorld(focusGoal);
    if (!isFocusPlaced) {
      focusPoint.copy(focusGoal);
      isFocusPlaced = true;
    }
    focusPoint.lerp(focusGoal, 1 - Math.exp(-3.2 * dt));
    focusSize = follow(focusSize, spot.size, 3.2, dt);
    targetRing.position.copy(focusPoint);
    targetRing.quaternion.copy(camera.quaternion);
    targetRing.scale.setScalar(focusSize * (1 + 0.04 * Math.sin(time * 2.4)));
    targetShader.uniforms.uColor.value.copy(COLOURS[shown]);
    targetShader.uniforms.uOpacity.value = 0.9 * fade;
    halo.shader.uniforms.uColor.value.copy(LIGHTS[shown]);
    halo.shader.uniforms.uOpacity.value = 0.22 * fade;
    halo.set(0, focusPoint, focusSize * 2.6 * pixelsPerMillimetre, 1);
    halo.done();

    // Glaucoma.
    let phase = phaseOf('glaucome');
    let story = storyOf('glaucome');
    const g = lit.glaucome;
    fibreShader.uniforms.uOpacity.value = 0.85 * g * fade * story;
    fibreShader.uniforms.uDraw.value = g > 0.01 ? 1.02 * smooth(0, 1.4, phase) + (1 - story) : 0;
    fibreShader.uniforms.uFlow.value = 1;
    fibreShader.uniforms.uTime.value = time;
    fibreShader.uniforms.uLoss.value = 0.42 * smooth(2.5, 6.5, phase) * g;
    tint(nerveShader, 'glaucome', g, 0.22, 0.9);
    tint(discShader, 'glaucome', g, 0.4, 1);
    tint(cupShader, 'glaucome', g, 0.3, 1);
    drawCup(g * smooth(1.5, 5.5, phase) * story);
    pushShader.uniforms.uOpacity.value = 0.8 * g * fade * smooth(0.8, 1.6, phase) * story;
    if (g > 0.01) {
      drawPushes(time);
    }

    // Diabetes.
    phase = phaseOf('diabete');
    story = storyOf('diabete');
    const d = lit.diabete;
    tint(vesselShader, 'diabete', d, 0.2, 0.92);
    vesselShader.uniforms.uFlow.value = d;
    vesselShader.uniforms.uTime.value = time;
    vesselShader.uniforms.uPulses.value = 2.2;
    swellings.shader.uniforms.uOpacity.value = d * fade * story;
    bleeds.shader.uniforms.uOpacity.value = d * fade * story;
    ANEURYSMS.forEach(([a, b], i) => {
      const grow = smooth(1.2 + 0.28 * i, 1.7 + 0.28 * i, phase);
      swellings.set(i, onWall(a, b, 0.18), 11 * grow, grow);
    });
    BLEEDS.forEach(([a, b], i) => {
      const grow = smooth(3.2 + 0.4 * i, 3.9 + 0.4 * i, phase);
      bleeds.set(i, onWall(a, b, 0.18), (9 + (i % 3) * 3) * grow, 0.85 * grow);
    });
    swellings.done();
    bleeds.done();
    sproutShader.uniforms.uOpacity.value = 0.9 * d * fade * story;
    sproutShader.uniforms.uDraw.value = 1.02 * smooth(4.6, 6.6, phase);

    // AMD.
    phase = phaseOf('dmla');
    story = storyOf('dmla');
    const m = lit.dmla;
    tint(maculaShader, 'dmla', m, 0.24, 0.95);
    gridShader.uniforms.uOpacity.value = 0.8 * m * fade * story;
    gridShader.uniforms.uDraw.value = 1.02 * smooth(0, 1.4, phase) + (1 - story);
    const swell = 0.75 * smooth(1.4, 4.2, phase) * m;
    if (m > 0.01) {
      drawGrid(swell, time);
    }
    drusenDots.shader.uniforms.uOpacity.value = m * fade * story;
    DRUSEN.forEach(([a, b], i) => {
      const grow = smooth(1.3 + 0.25 * i, 2 + 0.25 * i, phase);
      drusenDots.set(i, onWall(a, b, 0.16 + swellAt(a, b, swell, time) * 0.55), 9 * grow, 0.9 * grow);
    });
    // The point the eye fixes, in the middle of the grid.
    drusenDots.set(DRUSEN.length, onWall(0, 0, 0.2 + swellAt(0, 0, swell, time)), 7, smooth(0.6, 1.2, phase));
    drusenDots.done();

    // Detachment.
    phase = phaseOf('decollement');
    story = storyOf('decollement');
    const r = lit.decollement;
    const rise = smooth(0.8, 3.6, phase) * r;
    flapShader.uniforms.uOpacity.value = 0.85 * r * fade * story;
    if (r > 0.01) {
      drawFlap(rise, time);
    }
    drops.shader.uniforms.uOpacity.value = r * fade * story;
    const tearPoint = flapPoint(TEAR.u, TEAR.v, flapHeight(TEAR.u, TEAR.v, rise, time) + rise * 0.6);
    const under = flapPoint(0.5, 0.5, flapHeight(0.5, 0.5, rise, time) * 0.35);
    const inside = tearPoint.clone().multiplyScalar(0.55);
    for (let i = 0; i < 7; i++) {
      const p = (time * 0.3 + i / 7) % 1;
      const point = p < 0.5 ? inside.clone().lerp(tearPoint, p * 2) : tearPoint.clone().lerp(under, (p - 0.5) * 2);
      drops.set(i, point, 6, Math.sin(Math.PI * p) * smooth(2, 2.8, phase));
    }
    drops.done();
    floaters.shader.uniforms.uOpacity.value = 0.55 * r * fade * story;
    FLOATERS.forEach(([x, y, z], i) => {
      floaters.set(i, new THREE.Vector3(x + Math.sin(time * 0.4 + i) * 0.8, y + Math.sin(time * 0.3 + i * 2) * 0.6, z), 7 + (i % 2) * 4, 1);
    });
    floaters.done();

    // The glass of the eye glows on its edges; inside, the colour of the disease.
    scleraGlow.material.uniforms.uIntensity.value = 0.4 * fade;
    corneaGlow.material.uniforms.uIntensity.value = 0.5 * fade;
    lensGlow.material.uniforms.uIntensity.value = 0.45 * fade;
    const glow = innerGlow.material.uniforms;
    glow.uColor.value.copy(INK);
    DISEASES.forEach((name) => glow.uColor.value.lerp(COLOURS[name], lit[name]));
    glow.uIntensity.value = (0.22 + 0.25 * Math.max(...Object.values(lit))) * fade;

    return fade < 0.999 || DISEASES.some((name) => Math.abs(lit[name] - (name === shown ? 1 : 0)) > 0.004);
  };

  return { scene, camera, resize, update };
}
