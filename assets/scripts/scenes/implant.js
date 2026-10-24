// Cataract page, beside the title: the artificial lens (the implant) drawn in lines, in the colour of
// the operation. It arrives folded, as it is when it is put in the eye, and opens out; then light
// passes through it and gathers behind it, as it gathers on the retina. It turns slowly on itself and
// leans towards the pointer. Sizes in millimetres (optic 6 mm, 13 mm with its two loops).

import { createInk } from './ink.js';

const OPTIC = 3;
const CENTRE = 0.42;
const EDGE = 0.12;
const LOOP_REACH = 6.5;
const FOCUS = 7.5;
const SOURCE = 7;
const TAU = Math.PI * 2;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};
// Opens out with a small overshoot, like a soft material finding its shape.
const settle = (t) => {
  const k = clamp01(t);
  return 1 - (1 - k) ** 3 * Math.cos(k * Math.PI * 1.2);
};

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 300);
  const AMBER = kit.css('--c-amber-ink', '#8a5a12');
  const INK = kit.css('--c-blue', '#1a4895');
  const ribbonShaders = [];
  const ribbon = (color, opacity, width) => {
    const shader = ink.material(color, opacity, { width });
    ribbonShaders.push(shader);
    return shader;
  };

  const lens = new THREE.Group();
  scene.add(lens);

  // ---------- The implant at rest, flat: its plane is XY, light comes from +Z ----------
  const surfaceZ = (r, side) => side * (EDGE + CENTRE * (1 - (r / OPTIC) ** 2));
  const circle = (r, side, count = 64) => Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * TAU;
    return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), surfaceZ(r, side));
  });
  const meridian = (a, side) => Array.from({ length: 13 }, (_, i) => {
    const r = (OPTIC * i) / 12;
    return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), surfaceZ(r, side));
  });
  // A loop leaves the edge of the optic and curls round it, reaching LOOP_REACH from the centre.
  const loop = (start, reach) => Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const a = start + t * 2.45;
    const r = OPTIC + (reach - OPTIC) * (1 - (1 - t) ** 2.2);
    return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0.05 * Math.sin(t * Math.PI));
  });

  // Folding: the two halves of the optic (y > 0, y < 0) turn up about the X axis, as in the injector.
  const fold = (point, amount) => {
    const side = point.y >= 0 ? 1 : -1;
    const beta = amount * 1.32 * side;
    const c = Math.cos(beta);
    const s = Math.sin(beta);
    return new THREE.Vector3(point.x, point.y * c - point.z * s, point.y * s + point.z * c);
  };

  const edgeShader = ribbon(AMBER, 0, 1.6);
  const surfaceShader = ink.material(AMBER, 0);
  const loopShader = ribbon(AMBER, 0, 1.9);
  const edges = ink.movingRibbons(2 * 64 + 12, edgeShader);
  const surfaces = ink.movingLines(5 * 64 + 16 * 12, surfaceShader);
  const loops = ink.movingRibbons(2 * 32, loopShader);
  lens.add(surfaces.object, edges.object, loops.object);

  const drawImplant = (amount, reach) => {
    const place = (point) => fold(point, amount);
    edges.begin();
    [1, -1].forEach((side) => edges.line(circle(OPTIC, side).map(place)));
    // The rim, joining the two faces at the edge.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      edges.push(place(new THREE.Vector3(OPTIC * Math.cos(a), OPTIC * Math.sin(a), EDGE)), place(new THREE.Vector3(OPTIC * Math.cos(a), OPTIC * Math.sin(a), -EDGE)));
    }
    edges.end();
    surfaces.begin();
    [0.8, 1.6, 2.4].forEach((r) => {
      const points = circle(r, 1).map(place);
      for (let i = 0; i < points.length - 1; i++) {
        surfaces.push(points[i], points[i + 1]);
      }
    });
    [1.2, 2.2].forEach((r) => {
      const points = circle(r, -1).map(place);
      for (let i = 0; i < points.length - 1; i++) {
        surfaces.push(points[i], points[i + 1]);
      }
    });
    for (let k = 0; k < 16; k++) {
      const points = meridian((k / 16) * TAU, 1).map(place);
      for (let i = 0; i < points.length - 1; i++) {
        surfaces.push(points[i], points[i + 1]);
      }
    }
    surfaces.end();
    loops.begin();
    [Math.PI * 0.42, Math.PI * 1.42].forEach((start) => loops.line(loop(start, reach).map(place)));
    loops.end();
  };

  // ---------- Light: rays from the front, bent by the implant, gathering at the focus ----------
  const rays = ink.strokes();
  [-2.4, -1.2, 0, 1.2, 2.4].forEach((offset) => {
    [[offset, 0], [0, offset]].forEach(([x, y], n) => {
      const isCentre = offset === 0 && n === 1;
      if (isCentre) {
        return;
      }
      const r = Math.hypot(x, y);
      const entry = new THREE.Vector3(x, y, surfaceZ(r, 1));
      const exit = new THREE.Vector3(x, y, surfaceZ(r, -1));
      const focus = new THREE.Vector3(0, 0, -FOCUS);
      // Its place along itself runs from the source (0) to the focus (1).
      const total = SOURCE - entry.z + exit.distanceTo(focus) + (entry.z - exit.z);
      const atEntry = (SOURCE - entry.z) / total;
      const atExit = atEntry + (entry.z - exit.z) / total;
      rays.segment(new THREE.Vector3(x, y, SOURCE), entry, 0, atEntry);
      rays.segment(entry, exit, atEntry, atExit);
      rays.segment(exit, focus, atExit, 1);
    });
  });
  const rayShader = ribbon(INK, 0, 1.2);
  rayShader.uniforms.uDash.value = 14;
  rayShader.uniforms.uDashSpeed.value = 0.9;
  const rayObject = rays.ribbons(rayShader);
  lens.add(rayObject);
  const focusDot = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false }));
  focusDot.position.set(0, 0, -FOCUS);
  lens.add(focusDot);
  const focusRing = ink.strokes();
  focusRing.line(Array.from({ length: 49 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * TAU), Math.sin((i / 48) * TAU), 0)));
  const focusRingShader = ribbon(INK, 0, 1.2);
  const focusRingObject = focusRing.ribbons(focusRingShader);
  focusRingObject.position.copy(focusDot.position);
  lens.add(focusRingObject);

  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max(9.6 / Math.tan(halfFov), 9.6 / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(0, 2.5, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    ink.resize(width, height, kit.renderer.getPixelRatio(), ribbonShaders);
  };

  const parentTurn = new THREE.Quaternion();
  const update = ({ time, pointer }) => {
    // It arrives folded, opens out, then light passes through it.
    const appear = smooth(0, 0.5, time);
    const open = settle((time - 0.5) / 1.9);
    drawImplant(1 - open, LOOP_REACH * (0.55 + 0.45 * open));
    edgeShader.uniforms.uOpacity.value = 0.95 * appear;
    surfaceShader.uniforms.uOpacity.value = 0.42 * appear;
    loopShader.uniforms.uOpacity.value = 0.95 * appear;
    const light = smooth(2.2, 3.2, time);
    rayShader.uniforms.uOpacity.value = 0.75 * light;
    rayShader.uniforms.uDraw.value = 1.02 * smooth(2.2, 3.4, time);
    rayShader.uniforms.uTime.value = time;
    const beat = (time % 1.8) / 1.8;
    focusDot.material.opacity = smooth(3.2, 3.6, time) * (0.75 + 0.25 * Math.sin(time * 3.5));
    focusRingShader.uniforms.uOpacity.value = smooth(3.4, 3.8, time) * (1 - beat) * 0.8;
    focusRingObject.scale.setScalar(0.5 + beat * 1.6);
    // The implant turns slowly on itself, showing its face then its side, and leans towards the pointer.
    lens.rotation.set(0.3 - pointer.y * 0.25, 0.5 + time * 0.26 + pointer.x * 0.35, 0);
    lens.updateMatrixWorld(true);
    // The rings of the focus face us.
    lens.getWorldQuaternion(parentTurn);
    focusRingObject.quaternion.copy(parentTurn.invert().multiply(camera.quaternion));
    focusDot.quaternion.copy(focusRingObject.quaternion);
    return false;
  };

  return { scene, camera, resize, update };
}
