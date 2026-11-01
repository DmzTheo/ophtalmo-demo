// Retinal surgery page, beside the title: the eye drawn in lines, seen from the side, the retina
// lifted at the top behind a tear. A bubble of gas fills the top of the eye and lays the retina back
// against the wall; laser marks appear one after the other around the tear; then the bubble grows
// smaller, its flat surface rising, as the gas goes. The story plays again every 10 s; the eye turns
// a little and leans towards the pointer. Proportions in millimetres, as in _build/eye.js (adult eye).

import { createInk } from './ink.js';

const TAU = Math.PI * 2;
const R = 12;
const HL = 5.85;
const RC = 7.8;
const LIMBUS = Math.sqrt(R * R - HL * HL);
const CORNEA_CENTRE = LIMBUS - Math.sqrt(RC * RC - HL * HL);
const RETINA = 10.6;
// The back of the lens (its centre at 8.15 mm, 2 mm half its thickness): the gas stops there.
const LENS_BACK = 6.15;
const CYCLE = 10;
const MARKS = 12;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

// The colours of the site it takes (read by the page, scene3d.js).
export const tokens = ['--c-lime-ink', '--c-blue'];

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 300);
  const LIME = kit.css('--c-lime-ink', '#4f6512');
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
  // The axis of the eye lies horizontal, its front towards the left: the top of the eye on the screen
  // is +X in the space of the eye.
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

  // ---------- The retina lifted at the top, behind its tear; the laser marks around the tear ----------
  // Around a direction on the retina, a ring of angular radius `spread`, pushed inward by `lift`.
  const centre = new THREE.Vector3(0.88, 0.3, 0).normalize();
  const across = new THREE.Vector3(0, 0, 1);
  const along = new THREE.Vector3().crossVectors(across, centre).normalize();
  const onRetina = (u, v, inward) => centre.clone().addScaledVector(along, u).addScaledVector(across, v).normalize().multiplyScalar(RETINA - inward);
  const retina = ink.movingRibbons(3 * 48 + 16 + MARKS * 10, ribbon(LIME, 0, 1.5));
  const retinaShader = retina.object.material;
  eye.add(retina.object);
  // The tear, at the front edge of the lifted retina; the marks in a ring around it.
  const tearAt = [0.46, 0];
  const drawRetina = (lift, marks) => {
    retina.begin();
    [0.2, 0.38, 0.56].forEach((spread) => {
      const raise = lift * 2.3 * (1 - (spread / 0.64) ** 2);
      retina.line(Array.from({ length: 49 }, (_, i) => {
        const a = (i / 48) * TAU;
        return onRetina(Math.cos(a) * spread, Math.sin(a) * spread * 1.15, raise);
      }));
    });
    retina.line(Array.from({ length: 17 }, (_, i) => {
      const a = Math.PI * (0.15 + (0.7 * i) / 16);
      return onRetina(tearAt[0] + Math.cos(a) * 0.09, tearAt[1] + Math.sin(a) * 0.1, lift * 0.6);
    }));
    for (let m = 0; m < marks; m++) {
      const a = (m / MARKS) * TAU;
      const mark = [tearAt[0] + Math.cos(a) * 0.19, tearAt[1] + Math.sin(a) * 0.22];
      retina.line(Array.from({ length: 11 }, (_, i) => {
        const b = (i / 10) * TAU;
        return onRetina(mark[0] + Math.cos(b) * 0.03, mark[1] + Math.sin(b) * 0.03, 0.05);
      }));
    }
    retina.end();
  };

  // ---------- The bubble of gas: its flat surface at the height `level`, and its dome ----------
  const bubble = ink.movingRibbons(3 * 64, ribbon(INK, 0, 1.2));
  const bubbleShader = bubble.object.material;
  eye.add(bubble.object);
  const INSIDE = RETINA - 0.3;
  // A ring of the bubble at the height x: the circle of the inner wall at that height, in front only
  // as far as the back of the lens.
  const ringAt = (x) => {
    const r = Math.sqrt(Math.max(0, INSIDE * INSIDE - x * x));
    const points = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const y = Math.min(LENS_BACK, r * Math.cos(a));
      points.push(new THREE.Vector3(x, y, r * Math.sin(a)));
    }
    return points;
  };
  const drawBubble = (level) => {
    bubble.begin();
    bubble.line(ringAt(level));
    [0.45, 0.8].forEach((k) => bubble.line(ringAt(level + (INSIDE - level) * k)));
    bubble.end();
  };

  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max(14.5 / Math.tan(halfFov), 15 / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    ink.resize(width, height, kit.renderer.getPixelRatio(), ribbonShaders);
  };

  const update = ({ time, pointer }) => {
    // The eye turns a little and leans towards the pointer; it is seen a little from above, so that
    // the retina at its top shows.
    model.rotation.set(0.62 - pointer.y * 0.25, -0.35 + Math.sin(time * 0.3) * 0.3 + pointer.x * 0.35, 0);
    const phase = time % CYCLE;
    const shown = smooth(0, 0.8, time);
    structureShader.uniforms.uOpacity.value = 0.3 * shown;
    // The bubble comes, the retina is laid back under it, the marks follow; then the gas goes.
    const gas = smooth(2.2, 3.2, phase) * (1 - smooth(9.2, 9.9, phase));
    const lift = 1 - smooth(2.8, 4.2, phase) * (1 - smooth(9.4, 10, phase));
    const marks = Math.round(MARKS * smooth(4.6, 6.4, phase) * (1 - smooth(9.6, 10, phase)));
    drawRetina(lift, marks);
    retinaShader.uniforms.uOpacity.value = 0.95 * shown;
    drawBubble(1 + (INSIDE * 0.78 - 1) * smooth(6.4, 9.4, phase));
    bubbleShader.uniforms.uOpacity.value = 0.75 * gas * shown;
    return false;
  };

  return { scene, camera, resize, update };
}
