// Cabinets page: the land between the two cabinets drawn in lines, like the eye of the surgeries
// page, with no base: the contour lines of the relief (the Alpilles, the Chaîne des Côtes, the stony
// plain of La Crau), the étang de Berre and its ripples, the houses of Miramas and Salon-de-Provence,
// a pin on each cabinet and the road between them, travelled by a small light. The contours rise from
// the lowest to the highest when the map arrives; the edge of the map fades into the page.
// North is towards the back; distances roughly true (1 unit ≈ 1.6 km).

import { createInk } from './ink.js';

const R = 10;
const TOWNS = {
  miramas: { x: -3, z: 1.5, name: 'Miramas' },
  salon: { x: 2.1, z: -2.6, name: 'Salon-de-Provence' },
};
const LAKE = { x: 0.3, z: 5.7, rx: 3.9, rz: 2.4 };
const WATER = 0.05;
// Contour lines every STEP of height; one in four is drawn thicker.
const STEP = 0.2;
const CELLS = 120;

// Deterministic noise: the map is the same at every visit.
const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x, z) => {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x, z) => noise(x, z) * 0.6 + noise(x * 2.1 + 3.1, z * 2.1) * 0.28 + noise(x * 4.3, z * 4.3 + 1.7) * 0.12;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, t) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const bump = (x, z, cx, cz, radius, height) => height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (radius * radius));
const lakeDistance = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) + (fbm(x * 0.9, z * 0.9) - 0.5) * 0.28;

// Height of the land: the Alpilles to the north-west, the Chaîne des Côtes to the north of Salon, the
// plateau east of the lake, La Crau flat to the west.
const heightAt = (x, z) => {
  let h = 0.42 + (fbm(x * 0.35, z * 0.35) - 0.5) * 0.35;
  h += bump(x, z, -6.6, -5.6, 2.6, 3.1) + bump(x, z, -4.6, -7.4, 1.6, 1.8);
  h += bump(x, z, 4.4, -6.8, 2.6, 2.5) + bump(x, z, 6.4, -4.2, 1.8, 1.3);
  h += bump(x, z, 6.6, 3.4, 1.9, 1.4);
  h *= 1 - 0.5 * smooth(-1, -6, x) * smooth(-7, -2, z);
  return h + (fbm(x * 1.6, z * 1.6) - 0.5) * 0.18;
};
// Where the map ends: an uneven circle, so that it has no edge of its own.
const edgeAt = (x, z) => R * (0.86 + 0.14 * noise(Math.atan2(z, x) * 1.6 + 7, 0.5));

// The four corners of a cell crossed by a level: pairs of its edges to join (marching squares).
const CASES = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
  8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]],
};

export function create(THREE, kit) {
  const ink = createInk(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  const map = new THREE.Group();
  scene.add(map);

  const INK = kit.css('--c-blue', '#1a4895');
  const WATER_INK = kit.css('--c-teal-ink', '#1b666c');
  const ROUTE = kit.css('--c-amber-ink', '#8a5a12');
  const ribbonShaders = [];
  const ribbon = (color, opacity, width) => {
    const shader = ink.material(color, opacity, { width });
    ribbonShaders.push(shader);
    return shader;
  };

  // ---------- The relief: contour lines, found cell by cell over a grid ----------
  const step = (2 * R) / CELLS;
  const size = CELLS + 1;
  const heights = new Float32Array(size * size);
  const nearLake = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -R + i * step;
      const z = -R + j * step;
      heights[j * size + i] = heightAt(x, z);
      nearLake[j * size + i] = lakeDistance(x, z) < 1.06 ? 1 : 0;
    }
  }
  let highest = 0;
  heights.forEach((h) => {
    highest = Math.max(highest, h);
  });
  const levels = [];
  for (let level = 0.66; level < highest; level += STEP) {
    levels.push(level);
  }
  const fine = ink.strokes();
  const bold = ink.strokes();
  const corner = (i, j) => heights[j * size + i];
  const edgePoint = (i, j, edge, level) => {
    // Edges: 0 bottom (i,j)-(i+1,j), 1 right (i+1,j)-(i+1,j+1), 2 top (i+1,j+1)-(i,j+1), 3 left (i,j+1)-(i,j).
    const ends = [[[i, j], [i + 1, j]], [[i + 1, j], [i + 1, j + 1]], [[i + 1, j + 1], [i, j + 1]], [[i, j + 1], [i, j]]][edge];
    const [a, b] = ends;
    const ha = corner(...a);
    const hb = corner(...b);
    const t = Math.abs(hb - ha) < 1e-6 ? 0.5 : (level - ha) / (hb - ha);
    return new THREE.Vector3(-R + (a[0] + (b[0] - a[0]) * t) * step, level, -R + (a[1] + (b[1] - a[1]) * t) * step);
  };
  levels.forEach((level, n) => {
    const isBold = n % 4 === 3;
    const builder = isBold ? bold : fine;
    // Its place among the levels: the contours appear from the lowest to the highest.
    const order = levels.length > 1 ? n / (levels.length - 1) : 0;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const isWater = nearLake[j * size + i] || nearLake[j * size + i + 1] || nearLake[(j + 1) * size + i] || nearLake[(j + 1) * size + i + 1];
        if (isWater) {
          continue;
        }
        const index = (corner(i, j) > level ? 1 : 0) | (corner(i + 1, j) > level ? 2 : 0)
          | (corner(i + 1, j + 1) > level ? 4 : 0) | (corner(i, j + 1) > level ? 8 : 0);
        (CASES[index] || []).forEach(([e0, e1]) => {
          const a = edgePoint(i, j, e0, level);
          const b = edgePoint(i, j, e1, level);
          const reachA = Math.hypot(a.x, a.z) / edgeAt(a.x, a.z);
          const reachB = Math.hypot(b.x, b.z) / edgeAt(b.x, b.z);
          if (reachA < 1 && reachB < 1) {
            builder.segment(a, b, order, order, Math.max(reachA, reachB));
          }
        });
      }
    }
  });
  const fineShader = ink.material(INK, 0.4);
  fineShader.uniforms.uEdge.value = 1;
  const boldShader = ribbon(INK, 0.5, 1.3);
  boldShader.uniforms.uEdge.value = 1;
  map.add(fine.lines(fineShader), bold.ribbons(boldShader));

  // ---------- The étang de Berre: its shore and ripples moving towards the middle ----------
  const lakeField = (x, z) => lakeDistance(x, z);
  const shoreLevels = [1, 0.84, 0.7, 0.57, 0.45, 0.34, 0.24, 0.15];
  const shore = ink.strokes();
  const ripples = ink.strokes();
  const lakeCells = 90;
  const lakeStep = (2 * LAKE.rx * 1.25) / lakeCells;
  const lakeOrigin = [LAKE.x - LAKE.rx * 1.25, LAKE.z - LAKE.rx * 1.25];
  const lakeValues = new Float32Array((lakeCells + 1) * (lakeCells + 1));
  for (let j = 0; j <= lakeCells; j++) {
    for (let i = 0; i <= lakeCells; i++) {
      lakeValues[j * (lakeCells + 1) + i] = lakeField(lakeOrigin[0] + i * lakeStep, lakeOrigin[1] + j * lakeStep);
    }
  }
  shoreLevels.forEach((level, n) => {
    const builder = n === 0 ? shore : ripples;
    const value = (i, j) => lakeValues[j * (lakeCells + 1) + i];
    const point = (i, j, edge) => {
      const ends = [[[i, j], [i + 1, j]], [[i + 1, j], [i + 1, j + 1]], [[i + 1, j + 1], [i, j + 1]], [[i, j + 1], [i, j]]][edge];
      const [a, b] = ends;
      const va = value(...a);
      const vb = value(...b);
      const t = Math.abs(vb - va) < 1e-6 ? 0.5 : (level - va) / (vb - va);
      return new THREE.Vector3(lakeOrigin[0] + (a[0] + (b[0] - a[0]) * t) * lakeStep, WATER, lakeOrigin[1] + (a[1] + (b[1] - a[1]) * t) * lakeStep);
    };
    for (let j = 0; j < lakeCells; j++) {
      for (let i = 0; i < lakeCells; i++) {
        // Inside the lake the field is low: corners below the level are the water.
        const index = (value(i, j) < level ? 1 : 0) | (value(i + 1, j) < level ? 2 : 0)
          | (value(i + 1, j + 1) < level ? 4 : 0) | (value(i, j + 1) < level ? 8 : 0);
        (CASES[index] || []).forEach(([e0, e1]) => {
          // The ripples carry their distance to the shore, so that light runs from the shore inwards.
          builder.segment(point(i, j, e0), point(i, j, e1), 1 - level, 1 - level);
        });
      }
    }
  });
  const shoreShader = ribbon(WATER_INK, 0.75, 1.6);
  const rippleShader = ink.material(WATER_INK, 0.08);
  rippleShader.uniforms.uFlow.value = 1;
  rippleShader.uniforms.uPulses.value = 1.4;
  rippleShader.uniforms.uSpeed.value = 0.22;
  rippleShader.uniforms.uPulseGain.value = 7;
  map.add(shore.ribbons(shoreShader), ripples.lines(rippleShader));

  // ---------- La Crau: a plain of pebbles, drawn as small dots ----------
  const pebbleCount = 260;
  const pebbles = [];
  for (let k = 0; k < pebbleCount; k++) {
    const x = -9 + hash(k, 1.3) * 8.5;
    const z = -2.5 + hash(k, 7.1) * 9;
    const isInPlain = lakeDistance(x, z) > 1.15 && Math.hypot(x, z) / edgeAt(x, z) < 0.92 && heightAt(x, z) < 0.75;
    if (isInPlain) {
      pebbles.push(x, heightAt(x, z) + 0.02, z);
    }
  }
  const pebbleGeometry = new THREE.BufferGeometry();
  pebbleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pebbles, 3));
  // Round dots of ink, a pixel and a half across.
  const pebbleMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(INK) }, uOpacity: { value: 0 }, uSize: { value: 1.5 } },
    vertexShader: /* glsl */ `
      uniform float uSize;
      void main() {
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.5, 0.3, d));
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  map.add(new THREE.Points(pebbleGeometry, pebbleMaterial));

  // ---------- The towns: small houses in lines, a pin on each cabinet ----------
  const houses = ink.strokes();
  const house = (x, z, turn, scale) => {
    const ground = heightAt(x, z);
    const w = 0.16 * scale;
    const d = 0.13 * scale;
    const h = 0.14 * scale;
    const roof = 0.09 * scale;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const at = (px, py, pz) => new THREE.Vector3(x + px * cos - pz * sin, ground + py, z + px * sin + pz * cos);
    const base = [at(-w, 0, -d), at(w, 0, -d), at(w, 0, d), at(-w, 0, d)];
    const top = [at(-w, h, -d), at(w, h, -d), at(w, h, d), at(-w, h, d)];
    const ridge = [at(-w, h + roof, 0), at(w, h + roof, 0)];
    for (let k = 0; k < 4; k++) {
      houses.segment(base[k], base[(k + 1) % 4]);
      houses.segment(top[k], top[(k + 1) % 4]);
      houses.segment(base[k], top[k]);
    }
    houses.segment(ridge[0], ridge[1]);
    [[0, 3, 0], [1, 2, 1]].forEach(([a, b, r]) => {
      houses.segment(top[a], ridge[r]);
      houses.segment(top[b], ridge[r]);
    });
  };
  Object.values(TOWNS).forEach((town, t) => {
    for (let k = 0; k < 14; k++) {
      const angle = hash(k, t + 2) * Math.PI * 2;
      const reach = 0.35 + hash(k + 5, t) * 1.05;
      house(town.x + Math.cos(angle) * reach, town.z + Math.sin(angle) * reach, hash(k, t + 9) * Math.PI, 0.8 + hash(k + 2, t + 4) * 0.5);
    }
  });
  const houseShader = ink.material(INK, 0);
  map.add(houses.lines(houseShader));

  // Pins: a stem standing on the cabinet, a ring at its top facing us, a circle pulsing on the ground.
  const pinShader = ribbon(INK, 0, 1.8);
  const pins = Object.values(TOWNS).map((town, i) => {
    const ground = heightAt(town.x, town.z);
    const stem = ink.strokes();
    stem.line([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.45, 0)]);
    const stemObject = stem.ribbons(pinShader);
    const head = ink.strokes();
    head.line(Array.from({ length: 41 }, (_, k) => new THREE.Vector3(Math.cos((k / 40) * Math.PI * 2) * 0.32, Math.sin((k / 40) * Math.PI * 2) * 0.32, 0)));
    const headObject = head.ribbons(pinShader);
    const group = new THREE.Group();
    group.add(stemObject);
    group.position.set(town.x, ground, town.z);
    headObject.position.set(town.x, ground + 1.77, town.z);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0, depthWrite: false }));
    dot.position.copy(headObject.position);
    const pulse = ink.strokes();
    pulse.line(Array.from({ length: 49 }, (_, k) => new THREE.Vector3(Math.cos((k / 48) * Math.PI * 2), 0, Math.sin((k / 48) * Math.PI * 2))));
    const pulseShader = ink.material(INK, 0);
    const pulseObject = pulse.lines(pulseShader);
    pulseObject.position.set(town.x, ground + 0.03, town.z);
    map.add(group, headObject, dot, pulseObject);
    return { town, ground, group, headObject, dot, pulseObject, pulseShader, phase: i * 0.55 };
  });

  // ---------- The road between the two cabinets, travelled by a small light ----------
  const from = new THREE.Vector3(TOWNS.miramas.x, heightAt(TOWNS.miramas.x, TOWNS.miramas.z) + 0.1, TOWNS.miramas.z);
  const to = new THREE.Vector3(TOWNS.salon.x, heightAt(TOWNS.salon.x, TOWNS.salon.z) + 0.1, TOWNS.salon.z);
  const middle = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 2.1, 0));
  const road = new THREE.QuadraticBezierCurve3(from, middle, to);
  const routeShader = ribbon(ROUTE, 0.95, 2);
  routeShader.uniforms.uDash.value = 18;
  routeShader.uniforms.uDashSpeed.value = 0.6;
  const route = ink.strokes();
  route.line(road.getSpacedPoints(90));
  map.add(route.ribbons(routeShader));
  const traveller = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshBasicMaterial({ color: kit.css('--c-sun', '#efb24a'), transparent: true, opacity: 0, depthWrite: false }));
  const travellerRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32), new THREE.MeshBasicMaterial({ color: ROUTE, transparent: true, opacity: 0, depthWrite: false }));
  map.add(traveller, travellerRing);

  // ---------- Names of the places (drawn by the page, over the map) ----------
  const labels = [
    ...pins.map((pin) => ({ text: pin.town.name, at: () => map.localToWorld(pin.headObject.position.clone().add(new THREE.Vector3(0, 0.45, 0))), isTown: true })),
    { text: 'Étang de Berre', at: () => map.localToWorld(new THREE.Vector3(LAKE.x + 0.2, WATER, LAKE.z + 0.4)) },
    { text: 'La Crau', at: () => map.localToWorld(new THREE.Vector3(-6.2, 0.6, 3.6)) },
  ];
  const layer = document.createElement('div');
  layer.className = 'scene3d__labels';
  layer.setAttribute('aria-hidden', 'true');
  labels.forEach((label) => {
    label.element = document.createElement('span');
    label.element.className = `scene3d__label${label.isTown ? ' scene3d__label--town' : ''}`;
    label.element.textContent = label.text;
    layer.append(label.element);
  });
  kit.stage.append(layer);
  let width = 1;
  let height = 1;
  const projected = new THREE.Vector3();
  // The names follow the map ten times a second at most once they have appeared (the map turns so
  // slowly that a name moves less than a pixel between two writes), at every frame while the pointer
  // leans the map; a name that has not moved is not written again. (Written at every frame, they had
  // the whole page drawn again at every frame: a third of the work of a phone at rest on this page.)
  let lastPlaced = -Infinity;
  const placeLabels = (reveal, isLeaning) => {
    const now = performance.now();
    if (reveal >= 1 && !isLeaning && now - lastPlaced < 100) {
      return;
    }
    lastPlaced = now;
    labels.forEach((label) => {
      projected.copy(label.at()).project(camera);
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      const hasMoved = !(Math.abs(x - label.x) < 0.3 && Math.abs(y - label.y) < 0.3);
      if (hasMoved) {
        label.x = x;
        label.y = y;
        label.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }
      if (reveal !== label.reveal) {
        label.reveal = reveal;
        label.element.style.opacity = String(reveal);
      }
    });
  };

  const resize = (w, h) => {
    width = w;
    height = h;
    camera.aspect = w / h;
    // The map, seen from above at an angle, fills the scene.
    const fit = R * 0.9;
    const distance = fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1.25, camera.aspect);
    const elevation = THREE.MathUtils.degToRad(38);
    camera.position.set(-distance * Math.cos(elevation) * 0.28, distance * Math.sin(elevation), distance * Math.cos(elevation) * 0.96);
    camera.lookAt(0, 0.2, 0);
    camera.updateProjectionMatrix();
    ink.resize(w, h, kit.renderer.getPixelRatio(), ribbonShaders);
    pebbleMaterial.uniforms.uSize.value = 2.2 * kit.renderer.getPixelRatio();
  };

  // What faces us whatever the turn of the map: the heads of the pins, the travelling light.
  const parentTurn = new THREE.Quaternion();
  const faceCamera = (object) => {
    object.parent.getWorldQuaternion(parentTurn);
    object.quaternion.copy(parentTurn.invert().multiply(camera.quaternion));
  };

  const update = ({ time, pointer }) => {
    // The map turns slowly on itself and leans towards the pointer.
    map.rotation.y = Math.sin(time * 0.11) * 0.3 + pointer.x * 0.28;
    map.rotation.x = -pointer.y * 0.06;
    map.updateMatrixWorld(true);
    // Arrival: the contours rise from the lowest to the highest, then the towns, pins and road.
    const rise = smooth(0, 2.2, time);
    fineShader.uniforms.uDraw.value = rise * 1.02;
    boldShader.uniforms.uDraw.value = rise * 1.02;
    shoreShader.uniforms.uOpacity.value = 0.75 * smooth(0.2, 1, time);
    rippleShader.uniforms.uTime.value = time;
    rippleShader.uniforms.uOpacity.value = 0.08 * smooth(0.6, 1.6, time);
    pebbleMaterial.uniforms.uOpacity.value = 0.45 * smooth(1, 2, time);
    houseShader.uniforms.uOpacity.value = 0.55 * smooth(1.4, 2.4, time);
    pins.forEach((pin) => {
      const drop = smooth(1.6 + pin.phase, 2.4 + pin.phase, time);
      const lift = (1 - drop) * 2.2;
      pin.group.position.y = pin.ground + lift;
      pin.headObject.position.y = pin.ground + 1.77 + lift;
      pin.dot.position.y = pin.headObject.position.y;
      faceCamera(pin.headObject);
      faceCamera(pin.dot);
      pin.dot.material.opacity = drop;
      // A circle leaves the foot of the pin every 2.2 s and spreads on the ground.
      const beat = ((time + pin.phase) % 2.2) / 2.2;
      pin.pulseObject.scale.setScalar(0.3 + beat * 1.6);
      pin.pulseShader.uniforms.uOpacity.value = (1 - beat) * 0.7 * drop;
    });
    pinShader.uniforms.uOpacity.value = smooth(1.6, 2.2, time);
    routeShader.uniforms.uDraw.value = smooth(2.4, 3.6, time) * 1.02;
    routeShader.uniforms.uTime.value = time;
    // The light goes from one cabinet to the other and back, in 6 s.
    const trip = (((time - 3.6) % 6) + 6) % 6 / 6;
    const there = trip < 0.5 ? trip * 2 : 2 - trip * 2;
    traveller.position.copy(road.getPointAt(smooth(0, 1, there)));
    travellerRing.position.copy(traveller.position);
    faceCamera(traveller);
    faceCamera(travellerRing);
    const isTravelling = time > 3.6;
    traveller.material.opacity = isTravelling ? 1 : 0;
    travellerRing.material.opacity = isTravelling ? 0.7 : 0;
    placeLabels(smooth(2.6, 3.4, time), pointer.over > 0.01);
    return false;
  };

  return { scene, camera, resize, update };
}
