// Downloads page, beside the title: the Amsler grid drawn in lines, in the colour of the macula,
// floating like a sheet of paper. Where the pointer passes over it (or, without a pointer, where a
// slow wandering spot goes), its straight lines bend and a pale patch dims them: what a damaged macula
// may show, the reason to look at the grid every week. Sizes in centimetres (the grid is 10 cm, in
// squares of 5 mm).

import { createInk } from './ink.js';

const HALF = 5;
const SQUARES = 20;
const SAMPLES = 40;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 200);
  const GOLD = kit.css('--c-gold-ink', '#765f00');
  const INK = kit.css('--c-ink', '#0d1a2b');
  const ribbonShaders = [];
  const ribbon = (color, opacity, width) => {
    const shader = ink.material(color, opacity, { width });
    ribbonShaders.push(shader);
    return shader;
  };
  const sheet = new THREE.Group();
  scene.add(sheet);

  // ---------- The grid: its lines bend around the spot ----------
  const gridShader = ink.material(GOLD, 0);
  const grid = ink.movingLines(2 * (SQUARES + 1) * SAMPLES, gridShader);
  const frameShader = ribbon(GOLD, 0, 1.6);
  const frame = ink.movingRibbons(4 * SAMPLES, frameShader);
  sheet.add(grid.object, frame.object);
  const spot = new THREE.Vector2(0, 0);
  // A point of the sheet: pulled towards the spot (the lines bend), and the paper waves gently.
  const bent = (x, y, strength, time) => {
    const dx = x - spot.x;
    const dy = y - spot.y;
    const fall = Math.exp(-(dx * dx + dy * dy) / 2.2);
    const pull = strength * 0.55 * fall;
    const swirl = strength * 0.25 * fall * Math.sin(time * 1.3);
    const wave = 0.18 * Math.sin(x * 0.55 + time * 0.9) * Math.cos(y * 0.4 + time * 0.6);
    return new THREE.Vector3(x - dx * pull - dy * swirl, y - dy * pull + dx * swirl, wave + strength * 0.35 * fall);
  };
  const drawGrid = (strength, time) => {
    grid.begin();
    for (let k = 0; k <= SQUARES; k++) {
      const c = -HALF + (2 * HALF * k) / SQUARES;
      // Its place among the lines: the grid draws itself from the middle outwards.
      const order = Math.abs(k - SQUARES / 2) / (SQUARES / 2);
      for (let i = 0; i < SAMPLES; i++) {
        const a = -HALF + (2 * HALF * i) / SAMPLES;
        const b = -HALF + (2 * HALF * (i + 1)) / SAMPLES;
        grid.push(bent(a, c, strength, time), bent(b, c, strength, time), order, order);
        grid.push(bent(c, a, strength, time), bent(c, b, strength, time), order, order);
      }
    }
    grid.end();
    frame.begin();
    [[-HALF, -HALF, HALF, -HALF], [HALF, -HALF, HALF, HALF], [HALF, HALF, -HALF, HALF], [-HALF, HALF, -HALF, -HALF]].forEach(([x0, y0, x1, y1]) => {
      frame.line(Array.from({ length: SAMPLES + 1 }, (_, i) => bent(x0 + ((x1 - x0) * i) / SAMPLES, y0 + ((y1 - y0) * i) / SAMPLES, strength, time)));
    });
    frame.end();
  };

  // The point to look at, in the middle, and the pale patch where the lines bend.
  const centre = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false }));
  centre.position.z = 0.02;
  sheet.add(centre);
  const patchMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(kit.css('--c-paper', '#f2ede3')) }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        gl_FragColor = vec4(uColor, uOpacity * smoothstep(1.0, 0.2, d));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), patchMaterial);
  // Drawn after the lines, which it dims.
  patch.renderOrder = 2;
  sheet.add(patch);

  // ---------- The pointer on the sheet ----------
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const pointerSpot = (pointer) => {
    normal.set(0, 0, 1).applyQuaternion(sheet.quaternion);
    plane.setFromNormalAndCoplanarPoint(normal, sheet.position);
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) {
      return null;
    }
    sheet.worldToLocal(hit);
    return new THREE.Vector2(THREE.MathUtils.clamp(hit.x, -HALF, HALF), THREE.MathUtils.clamp(hit.y, -HALF, HALF));
  };

  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max(7.4 / Math.tan(halfFov), 7.4 / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    ink.resize(width, height, kit.renderer.getPixelRatio(), ribbonShaders);
  };

  let strength = 0;
  const update = ({ time, elapsed, pointer }) => {
    // The sheet floats, turned a little, and leans towards the pointer.
    sheet.rotation.set(-0.42 + Math.sin(time * 0.4) * 0.06 - pointer.y * 0.15, 0.38 + Math.sin(time * 0.3) * 0.1 + pointer.x * 0.2, -0.06);
    sheet.updateMatrixWorld(true);
    // The spot follows the pointer over the sheet; without it, it wanders slowly around the middle.
    const wandering = new THREE.Vector2(Math.cos(time * 0.5) * 1.6, Math.sin(time * 0.7) * 1.2);
    const pointed = pointer.over > 0.5 ? pointerSpot(pointer) : null;
    const goal = pointed || wandering;
    const rate = 1 - Math.exp(-6 * Math.min(0.25, elapsed));
    spot.lerp(goal, rate);
    strength += ((time > 1.6 ? 1 : 0) - strength) * (1 - Math.exp(-1.5 * Math.min(0.25, elapsed)));
    drawGrid(strength, time);
    const shown = smooth(0, 1.4, time);
    gridShader.uniforms.uOpacity.value = 0.5 * shown;
    gridShader.uniforms.uDraw.value = 1.02 * smooth(0, 1.4, time);
    frameShader.uniforms.uOpacity.value = 0.9 * shown;
    centre.material.opacity = smooth(0.6, 1.2, time);
    patch.position.set(spot.x, spot.y, 0.05);
    patchMaterial.uniforms.uOpacity.value = 0.75 * strength;
    return false;
  };

  return { scene, camera, resize, update };
}
