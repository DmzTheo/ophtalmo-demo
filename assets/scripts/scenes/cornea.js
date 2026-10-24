// Refractive surgery page, beside the title: the cornea drawn in lines, in the colour of the
// operation, over the iris. The laser sweeps its middle: the dome flattens a little (the reshaping
// that corrects short sight), its profile of before stays dotted to compare. Then it starts again.
// The cornea turns slowly and leans towards the pointer. Sizes in millimetres; the depth taken by the
// laser is drawn larger than it is, to be seen.

import { createInk } from './ink.js';

const RC = 7.8;
const HALF = 5.85;
const BASE = Math.sqrt(RC * RC - HALF * HALF);
// The optical zone, flattened, and the depth drawn at its middle.
const ZONE = 3;
const DEPTH = 0.75;
const CYCLE = 8;
const TAU = Math.PI * 2;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 300);
  const VIOLET = kit.css('--c-violet-ink', '#5b45b0');
  const INK = kit.css('--c-blue', '#1a4895');
  const ribbonShaders = [];
  const ribbon = (color, opacity, width) => {
    const shader = ink.material(color, opacity, { width });
    ribbonShaders.push(shader);
    return shader;
  };
  const eye = new THREE.Group();
  scene.add(eye);

  // Height of the dome at a distance r from its middle, before and after the laser (amount 0 to 1).
  const dome = (r) => Math.sqrt(Math.max(0, RC * RC - r * r)) - BASE;
  const taken = (r) => DEPTH * (1 - smooth(ZONE * 0.55, ZONE * 1.15, r)) * (1 - (r / (ZONE * 1.15)) ** 2);
  const height = (r, amount) => dome(r) - amount * taken(r);
  const at = (r, a, amount) => new THREE.Vector3(r * Math.cos(a), height(r, amount), r * Math.sin(a));

  // ---------- The eye under the cornea: the iris, the white of the eye going back ----------
  const below = ink.strokes();
  const ring = (builder, r, y, count = 72) => builder.line(Array.from({ length: count + 1 }, (_, i) => new THREE.Vector3(r * Math.cos((i / count) * TAU), y, r * Math.sin((i / count) * TAU))));
  ring(below, 5.6, -2.6);
  ring(below, 1.9, -2.3, 48);
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * TAU;
    below.line([new THREE.Vector3(1.9 * Math.cos(a), -2.3, 1.9 * Math.sin(a)), new THREE.Vector3(5.6 * Math.cos(a), -2.6, 5.6 * Math.sin(a))]);
  }
  // The sclera, a sphere of 12 mm going back from the edge of the cornea.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    below.line(Array.from({ length: 13 }, (_, i) => {
      const t = Math.asin(HALF / 12) + (i / 12) * 0.42;
      return new THREE.Vector3(12 * Math.sin(t) * Math.cos(a), 12 * Math.cos(t) - Math.sqrt(144 - HALF * HALF), 12 * Math.sin(t) * Math.sin(a));
    }));
  }
  const belowShader = ink.material(INK, 0);
  eye.add(below.lines(belowShader));

  // ---------- The cornea: rings and meridians that follow the shape the laser gives it ----------
  const RINGS = [0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9];
  const MERIDIANS = 24;
  const surfaceShader = ink.material(VIOLET, 0);
  const surface = ink.movingLines(RINGS.length * 64 + MERIDIANS * 16, surfaceShader);
  const edgeShader = ribbon(VIOLET, 0, 1.6);
  const edge = ink.strokes();
  ring(edge, HALF, 0, 96);
  const profileShader = ribbon(VIOLET, 0, 2);
  const profile = ink.movingRibbons(2 * 48, profileShader);
  const beforeShader = ribbon(VIOLET, 0, 1.2);
  beforeShader.uniforms.uDash.value = 26;
  const before = ink.strokes();
  before.line(Array.from({ length: 49 }, (_, i) => at(-HALF + (2 * HALF * i) / 48, 0, 0)));
  eye.add(surface.object, edge.ribbons(edgeShader));
  // The cornea is round: its profile through the middle is the same whatever its turn, so it is drawn
  // facing us, where it shows best.
  const section = new THREE.Group();
  scene.add(section);
  section.add(profile.object, before.ribbons(beforeShader));
  const drawCornea = (amount) => {
    surface.begin();
    RINGS.forEach((r) => {
      for (let i = 0; i < 64; i++) {
        surface.push(at(r, (i / 64) * TAU, amount), at(r, ((i + 1) / 64) * TAU, amount));
      }
    });
    for (let k = 0; k < MERIDIANS; k++) {
      const a = (k / MERIDIANS) * TAU;
      for (let i = 0; i < 16; i++) {
        surface.push(at((HALF * i) / 16, a, amount), at((HALF * (i + 1)) / 16, a, amount));
      }
    }
    surface.end();
    // The profile through the middle, drawn strong: it shows the flattening.
    profile.begin();
    profile.line(Array.from({ length: 49 }, (_, i) => {
      const x = -HALF + (2 * HALF * i) / 48;
      return new THREE.Vector3(x, height(Math.abs(x), amount) + 0.01, 0);
    }));
    profile.end();
  };

  // ---------- The laser: a thin beam from above, sweeping the zone in a spiral ----------
  const SOURCE = new THREE.Vector3(0, 7.5, 0);
  const beamShader = ribbon(VIOLET, 0, 1.7);
  const beam = ink.movingRibbons(2, beamShader);
  eye.add(beam.object);
  const SPOTS = 28;
  const spotGeometry = new THREE.BufferGeometry();
  const spotPositions = new THREE.BufferAttribute(new Float32Array(SPOTS * 3), 3);
  const spotAges = new THREE.BufferAttribute(new Float32Array(SPOTS).fill(9), 1);
  [spotPositions, spotAges].forEach((attribute) => attribute.setUsage(THREE.DynamicDrawUsage));
  spotGeometry.setAttribute('position', spotPositions);
  spotGeometry.setAttribute('aAge', spotAges);
  // Each shot leaves a small spot that fades in half a second.
  const spotMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(VIOLET) }, uSize: { value: 6 } },
    vertexShader: /* glsl */ `
      attribute float aAge;
      uniform float uSize;
      varying float vLife;
      void main() {
        vLife = clamp(1.0 - aAge / 0.5, 0.0, 1.0);
        gl_PointSize = uSize * (0.5 + 0.5 * vLife);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.25, d) * vLife;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const spots = new THREE.Points(spotGeometry, spotMaterial);
  spots.frustumCulled = false;
  eye.add(spots);
  let nextSpot = 0;
  let lastShot = 0;

  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max(7.4 / Math.tan(halfFov), 8 / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(0, distance * 0.45, distance * 0.89);
    camera.lookAt(0, 1.6, 0);
    camera.updateProjectionMatrix();
    ink.resize(width, height, kit.renderer.getPixelRatio(), ribbonShaders);
    spotMaterial.uniforms.uSize.value = 6 * kit.renderer.getPixelRatio();
  };

  const update = ({ time, motion, pointer }) => {
    // Every CYCLE seconds: the laser sweeps (1 to 5 s), the result stays, then all starts again.
    const phase = time % CYCLE;
    const amount = smooth(1, 5, phase) * (1 - smooth(6.8, 7.6, phase));
    const shown = smooth(0, 0.8, time) * (1 - 0.65 * Math.sin(Math.PI * smooth(6.7, 7.9, phase)));
    drawCornea(amount);
    belowShader.uniforms.uOpacity.value = 0.2 * smooth(0, 0.8, time);
    surfaceShader.uniforms.uOpacity.value = 0.42 * shown;
    edgeShader.uniforms.uOpacity.value = 0.9 * shown;
    profileShader.uniforms.uOpacity.value = 0.95 * shown;
    beforeShader.uniforms.uOpacity.value = 0.55 * smooth(1.6, 2.4, phase) * (1 - smooth(6.6, 7.2, phase));
    // The beam and its shots, while the laser works.
    const isFiring = phase > 1 && phase < 5;
    const spiral = phase * 7.3;
    const reach = ZONE * Math.sqrt((phase * 1.7) % 1);
    const target = at(reach, spiral, amount);
    beam.begin();
    if (isFiring) {
      beam.push(SOURCE, target);
    }
    beam.end();
    beamShader.uniforms.uOpacity.value = isFiring ? 0.7 + 0.25 * Math.sin(time * 40) : 0;
    for (let i = 0; i < SPOTS; i++) {
      spotAges.setX(i, spotAges.getX(i) + motion);
    }
    const isShotDue = isFiring && time - lastShot > 0.07;
    if (isShotDue) {
      lastShot = time;
      spotPositions.setXYZ(nextSpot, target.x, target.y + 0.02, target.z);
      spotAges.setX(nextSpot, 0);
      nextSpot = (nextSpot + 1) % SPOTS;
      spotPositions.needsUpdate = true;
    }
    spotAges.needsUpdate = true;
    // The cornea turns slowly and leans towards the pointer.
    eye.rotation.set(-pointer.y * 0.22, time * 0.16 + pointer.x * 0.4, 0);
    section.rotation.set(-pointer.y * 0.22, 0, 0);
    return false;
  };

  return { scene, camera, resize, update };
}
