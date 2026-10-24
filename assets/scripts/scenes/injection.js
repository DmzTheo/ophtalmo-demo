// Intravitreal injection page, beside the title: the eye drawn in lines, seen from the side, its
// macula swollen. A drop of medicine appears in the vitreous, where it is injected, then spreads in
// small grains that drift to the back of the eye; there the swelling of the macula goes down. The
// story plays again every 9 s; the eye turns a little and leans towards the pointer. No needle is
// shown. Proportions in millimetres, as in _build/eye.js (adult eye).

import { createInk } from './ink.js';

const TAU = Math.PI * 2;
const R = 12;
const HL = 5.85;
const RC = 7.8;
const LIMBUS = Math.sqrt(R * R - HL * HL);
const CORNEA_CENTRE = LIMBUS - Math.sqrt(RC * RC - HL * HL);
const RETINA = 10.6;
const CYCLE = 9;
const GRAINS = 150;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};
// Deterministic random numbers: the grains spread the same way at every visit.
const random = (n, salt) => {
  const s = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 300);
  const TEAL = kit.css('--c-teal-ink', '#1b666c');
  const INK = kit.css('--c-blue', '#1a4895');
  const ribbonShaders = [];
  const ribbon = (color, opacity, width) => {
    const shader = ink.material(color, opacity, { width });
    ribbonShaders.push(shader);
    return shader;
  };
  const model = new THREE.Group();
  scene.add(model);
  const eye = new THREE.Group();
  // The axis of the eye lies horizontal, its front towards the left.
  eye.rotation.z = Math.PI / 2;
  model.add(eye);

  // ---------- The eye: a few lines, the white, the cornea, the iris and the lens ----------
  const lathePoint = (r, a, phi) => new THREE.Vector3(r * Math.cos(phi), a, r * Math.sin(phi));
  const structure = ink.strokes();
  const limbusAngle = Math.asin(HL / R);
  for (let k = 0; k < 10; k++) {
    const phi = (k / 10) * TAU;
    structure.line(Array.from({ length: 33 }, (_, i) => {
      const t = limbusAngle + (i / 32) * (Math.PI - limbusAngle);
      return lathePoint(R * Math.sin(t), R * Math.cos(t), phi);
    }));
  }
  [Math.PI / 2, Math.PI * 0.72].forEach((t) => structure.line(Array.from({ length: 97 }, (_, i) => lathePoint(R * Math.sin(t), R * Math.cos(t), (i / 96) * TAU))));
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * TAU;
    structure.line(Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * Math.asin(HL / RC);
      return lathePoint(RC * Math.sin(t), CORNEA_CENTRE + RC * Math.cos(t), phi);
    }));
  }
  structure.line(Array.from({ length: 97 }, (_, i) => lathePoint(HL, LIMBUS, (i / 96) * TAU)));
  // The iris, then the lens behind it (4 mm thick, 9.5 mm across).
  [1.9, 5.6].forEach((r) => structure.line(Array.from({ length: 73 }, (_, i) => lathePoint(r, 10.4, (i / 72) * TAU))));
  for (let k = 0; k < 8; k++) {
    const phi = (k / 8) * TAU;
    structure.line(Array.from({ length: 17 }, (_, i) => {
      const t = (i / 16) * Math.PI;
      return lathePoint(4.75 * Math.sin(t), 8.15 + 2 * Math.cos(t), phi);
    }));
  }
  const structureShader = ink.material(INK, 0);
  eye.add(structure.lines(structureShader));

  // ---------- The macula at the back, swollen: rings lifted into a small dome ----------
  const macula = ink.movingRibbons(3 * 48, ribbon(TEAL, 0, 1.4));
  const maculaShader = macula.object.material;
  eye.add(macula.object);
  const drawMacula = (swelling, time) => {
    macula.begin();
    [0.6, 1.4, 2.4].forEach((radius) => {
      const lift = swelling * 1.3 * (1 - (radius / 2.9) ** 2) * (1 + 0.08 * Math.sin(time * 3));
      macula.line(Array.from({ length: 49 }, (_, i) => {
        const psi = (i / 48) * TAU;
        const x = radius * Math.cos(psi);
        const z = radius * Math.sin(psi);
        const depth = Math.sqrt(Math.max(0, RETINA * RETINA - x * x - z * z));
        return new THREE.Vector3(x, -depth + lift, z);
      }));
    });
    macula.end();
  };

  // ---------- The medicine: a drop, then grains drifting to the macula ----------
  // Injected through the white of the eye, about 4 mm behind the cornea, below.
  const INJECTED = new THREE.Vector3(-6.2, 4.6, 0);
  const MACULA = new THREE.Vector3(0, -RETINA + 1.2, 0);
  const grainGeometry = new THREE.BufferGeometry();
  const grainPositions = new THREE.BufferAttribute(new Float32Array(GRAINS * 3), 3);
  const grainAlpha = new THREE.BufferAttribute(new Float32Array(GRAINS), 1);
  [grainPositions, grainAlpha].forEach((attribute) => attribute.setUsage(THREE.DynamicDrawUsage));
  grainGeometry.setAttribute('position', grainPositions);
  grainGeometry.setAttribute('aAlpha', grainAlpha);
  const grainMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(TEAL) }, uSize: { value: 4 } },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      uniform float uSize;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.3, d) * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const grains = new THREE.Points(grainGeometry, grainMaterial);
  grains.frustumCulled = false;
  eye.add(grains);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0, depthWrite: false }));
  model.add(drop);
  const directions = Array.from({ length: GRAINS }, (_, n) => {
    const u = random(n, 1) * 2 - 1;
    const a = random(n, 2) * TAU;
    const s = Math.sqrt(1 - u * u);
    return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)).multiplyScalar(0.4 + random(n, 3) * 0.6);
  });
  const grainPoint = new THREE.Vector3();
  const drawGrains = (phase) => {
    for (let n = 0; n < GRAINS; n++) {
      // Each grain leaves the drop, spreads, and drifts towards the macula, a little late or early.
      const start = 1.8 + random(n, 4) * 0.5;
      const travel = smooth(start, start + 4.2, phase);
      const spread = Math.sin(Math.PI * Math.min(1, travel * 1.15)) * 3.4;
      grainPoint.copy(INJECTED).lerp(MACULA, travel * travel).addScaledVector(directions[n], spread + 0.6);
      grainPoint.x += Math.sin(phase * 1.7 + n) * 0.25;
      grainPositions.setXYZ(n, grainPoint.x, grainPoint.y, grainPoint.z);
      grainAlpha.setX(n, smooth(start, start + 0.3, phase) * (1 - smooth(6.2, 8.4, phase)) * (0.45 + 0.4 * random(n, 5)));
    }
    grainPositions.needsUpdate = true;
    grainAlpha.needsUpdate = true;
  };

  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max(14.5 / Math.tan(halfFov), 15 / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    ink.resize(width, height, kit.renderer.getPixelRatio(), ribbonShaders);
    grainMaterial.uniforms.uSize.value = 3.4 * kit.renderer.getPixelRatio();
  };

  const parentTurn = new THREE.Quaternion();
  const update = ({ time, pointer }) => {
    // The eye turns a little and leans towards the pointer.
    model.rotation.set(0.25 - pointer.y * 0.25, -0.35 + Math.sin(time * 0.3) * 0.3 + pointer.x * 0.35, 0);
    model.updateMatrixWorld(true);
    const phase = time % CYCLE;
    const shown = smooth(0, 0.8, time);
    structureShader.uniforms.uOpacity.value = 0.3 * shown;
    // The swelling goes down once the medicine has reached the macula, and comes back for the next time.
    const swelling = 1 - 0.75 * smooth(4.6, 6.6, phase) * (1 - smooth(8.2, 9, phase));
    drawMacula(swelling, time);
    maculaShader.uniforms.uOpacity.value = 0.95 * shown;
    drawGrains(phase);
    // The drop appears where the medicine is given, then melts into its grains.
    const dropSize = smooth(1, 1.6, phase) * (1 - smooth(2, 2.6, phase)) * 0.9;
    eye.localToWorld(drop.position.copy(INJECTED));
    model.worldToLocal(drop.position);
    drop.scale.setScalar(Math.max(0.001, dropSize));
    drop.material.opacity = dropSize > 0.01 ? 0.85 : 0;
    model.getWorldQuaternion(parentTurn);
    drop.quaternion.copy(parentTurn.invert().multiply(camera.quaternion));
    return false;
  };

  return { scene, camera, resize, update };
}
