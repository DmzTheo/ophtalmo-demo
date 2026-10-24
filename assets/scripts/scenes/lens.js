// Glasses page: a trial lens of the orthoptist's set (glass in a metal rim, with its handle) passes
// over a reading chart, as in the examination. Real glass: the letters under it bend and swell
// through a converging lens, shrink through a diverging one; it changes from one to the other every
// three seconds. Its anti-reflection coating shimmers in the light; it follows the pointer.

const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const CARD_W = 5.2;
const CARD_H = 6.6;
const LENS_R = 1.35;
const LIFT = 1.0;

// The chart: letters in rows getting smaller, then a few lines of text, as on a reading chart.
function drawChart(canvas, family) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#0d1a2b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rows = [['Z', 190], ['U F', 140], ['N C X', 104], ['R T E Z', 78], ['D O H M V', 60], ['Z U F N C X', 46], ['R T E Z D O H', 36]];
  let y = 150;
  rows.forEach(([letters, size]) => {
    ctx.font = `700 ${size}px ${family}`;
    ctx.fillText(letters.split(' ').join('   '), width / 2, y);
    y += size * 1.12 + 26;
  });
  ctx.fillStyle = '#33405a';
  ctx.font = `500 30px ${family}`;
  const text = ['Pour une vérification de votre vue', 'et une prescription ou un renouvellement', 'de lunettes, un rendez-vous rapide.'];
  text.forEach((line, i) => ctx.fillText(line, width / 2, y + 20 + i * 44));
  ctx.strokeStyle = 'rgba(13, 26, 43, 0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, width - 48, height - 48);
}

// The power engraved on the handle of the lens.
function drawPower(canvas, power) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c9cdd3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1b2433';
  ctx.font = '700 72px "Atkinson Hyperlegible Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(power, 0, 4);
  ctx.restore();
}

// Lit by the photographer's studio of scene3d.js (made before the scene, at its own calm moment).
export const usesStudio = true;

export function create(THREE, kit) {
  const { renderer } = kit;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.environment = kit.environment();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 100);

  // ---------- The chart, a stiff card ----------
  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = 1024;
  chartCanvas.height = 1300;
  const family = '"Atkinson Hyperlegible Next", system-ui, sans-serif';
  const font = `700 120px ${family}`;
  drawChart(chartCanvas, family);
  const chart = new THREE.CanvasTexture(chartCanvas);
  chart.colorSpace = THREE.SRGBColorSpace;
  chart.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Drawn again with the font of the site once it is there (not when it already was).
  const hasFont = document.fonts ? document.fonts.check(font) : true;
  if (!hasFont) {
    document.fonts.load(font).then(() => {
      drawChart(chartCanvas, family);
      chart.needsUpdate = true;
      kit.wake();
    }).catch(() => {});
  }
  const edge = new THREE.MeshStandardMaterial({ color: '#e9e2d4', roughness: 0.9 });
  const card = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.06), [edge, edge, edge, edge, new THREE.MeshStandardMaterial({ map: chart, roughness: 0.85 }), edge]);
  card.receiveShadow = true;
  scene.add(card);

  // ---------- The trial lens ----------
  // One shape changes into the other (morph): converging (thick in the middle) and diverging (thick
  // at the edge), drawn with the same points.
  const profile = (centre, rim) => {
    const points = [];
    const thickness = (r) => rim + (centre - rim) * (1 - (r / LENS_R) ** 2);
    for (let i = 0; i <= 36; i++) {
      const r = Math.max(0.0001, (i / 36) * LENS_R);
      points.push(new THREE.Vector2(r, -thickness(r) / 2));
    }
    for (let i = 36; i >= 0; i--) {
      const r = Math.max(0.0001, (i / 36) * LENS_R);
      points.push(new THREE.Vector2(r, thickness(r) / 2));
    }
    return points;
  };
  const converging = new THREE.LatheGeometry(profile(0.62, 0.1), 96);
  const diverging = new THREE.LatheGeometry(profile(0.1, 0.62), 96);
  converging.morphAttributes.position = [diverging.attributes.position];
  converging.morphAttributes.normal = [diverging.attributes.normal];
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 0.45,
    ior: 1.6,
    clearcoat: 0.5,
    clearcoatRoughness: 0.04,
    iridescence: 0.4,
    iridescenceIOR: 1.85,
    iridescenceThicknessRange: [220, 520],
    attenuationColor: new THREE.Color('#eaf3f2'),
    attenuationDistance: 3,
    envMapIntensity: 0.9,
    specularIntensity: 0.6,
  });
  const lens = new THREE.Mesh(converging, glass);
  lens.rotation.x = Math.PI / 2;
  lens.morphTargetInfluences = [0];

  const metal = new THREE.MeshStandardMaterial({ color: '#b8bdc5', metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(LENS_R + 0.03, 0.075, 18, 120), metal);
  rim.castShadow = true;
  const powerCanvas = document.createElement('canvas');
  powerCanvas.width = 128;
  powerCanvas.height = 512;
  drawPower(powerCanvas, '+2.00');
  const powerTexture = new THREE.CanvasTexture(powerCanvas);
  powerTexture.colorSpace = THREE.SRGBColorSpace;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.7, 0.07), [metal, metal, metal, metal, new THREE.MeshStandardMaterial({ map: powerTexture, metalness: 0.8, roughness: 0.35 }), metal]);
  handle.position.set(0, -(LENS_R + 0.88), 0);
  handle.castShadow = true;
  const handleArm = new THREE.Group();
  handleArm.add(handle);
  handleArm.rotation.z = THREE.MathUtils.degToRad(35);
  const trial = new THREE.Group();
  trial.add(lens, rim, handleArm);
  trial.position.z = LIFT;
  scene.add(trial);

  // Where the lens brings the light to a point (converging) or spreads it (diverging): a glow on the
  // chart, below the lens, a little away from the sun.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext('2d');
  const gradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 246, 220, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 236, 190, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 236, 190, 0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 128, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const caustic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  caustic.position.z = 0.035;
  scene.add(caustic);

  // ---------- Light ----------
  scene.add(new THREE.HemisphereLight('#ffffff', '#d8cbb3', 0.7));
  const sun = new THREE.DirectionalLight('#fff4e2', 1.6);
  sun.position.set(-3, 5, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const resize = (width, height) => {
    camera.aspect = width / height;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max((CARD_H * 0.64) / Math.tan(halfFov), (CARD_W * 0.62) / (Math.tan(halfFov) * camera.aspect));
    camera.position.set(distance * 0.3, -distance * 0.12, distance * 0.95);
    camera.lookAt(0, 0.1, 0);
    camera.updateProjectionMatrix();
  };

  // Pointer on the chart: where the line from the camera through the pointer meets the card.
  const raycaster = new THREE.Raycaster();
  const cardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LIFT * 0.4);
  const hit = new THREE.Vector3();
  const pointerSpot = new THREE.Vector2();
  let shownPower = '+2.00';

  const update = ({ time, pointer }) => {
    // Its path over the chart, reading a row then another; or where the pointer is.
    const ownX = Math.sin(time * 0.42) * 1.5;
    const ownY = Math.cos(time * 0.29) * 1.9 + 0.5;
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
    if (raycaster.ray.intersectPlane(cardPlane, hit)) {
      pointerSpot.set(Math.max(-1.9, Math.min(1.9, hit.x)), Math.max(-2.6, Math.min(2.8, hit.y)));
    }
    const follow = pointer.over;
    trial.position.x = ownX + (pointerSpot.x - ownX) * follow;
    trial.position.y = ownY + (pointerSpot.y - ownY) * follow;
    trial.rotation.y = Math.sin(time * 0.6) * 0.18 + pointer.x * 0.12;
    trial.rotation.x = Math.cos(time * 0.5) * 0.12 - pointer.y * 0.1;
    // Converging, then diverging, every three seconds.
    const phase = time % 6;
    const toDiverging = smooth(2.2, 3, phase) * (1 - smooth(5.2, 6, phase));
    lens.morphTargetInfluences[0] = toDiverging;
    const power = toDiverging > 0.5 ? '−2.00' : '+2.00';
    if (power !== shownPower) {
      shownPower = power;
      drawPower(powerCanvas, power);
      powerTexture.needsUpdate = true;
    }
    const focus = 1 - toDiverging;
    caustic.position.x = trial.position.x + 0.32;
    caustic.position.y = trial.position.y - 0.42;
    caustic.scale.setScalar(0.55 + toDiverging * 2.4);
    caustic.material.opacity = 0.25 + focus * 0.7;
    return false;
  };

  return { scene, camera, resize, update };
}
