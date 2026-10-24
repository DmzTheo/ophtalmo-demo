// Team page: thousands of ink dots, scattered at first, gather into one eye, as a whole team around
// one patient: the strands of the iris, the edge of the pupil, the lids and their lashes. Then the
// eye lives: the iris turns slowly, the pupil breathes, the eye blinks now and then and looks toward
// the pointer, and the dots draw aside under it. Stippling on the paper, in the inks of the site.

const hash = (n) => {
  const s = Math.sin(n * 91.345 + 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

// The lids, as seen from the front: an almond, wider than high.
const LID_W = 5.4;
const upperLid = (x) => 2.85 * Math.max(0, 1 - (x / LID_W) ** 2) ** 0.85;
const lowerLid = (x) => -2.2 * Math.max(0, 1 - (x / LID_W) ** 2) ** 0.95;

export function create(THREE, kit) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 100);
  camera.position.set(0, 0, 22);

  const COUNT = kit.isSmall() ? 2600 : 4600;
  const target = new Float32Array(COUNT * 3);
  const closed = new Float32Array(COUNT * 3);
  const scatter = new Float32Array(COUNT * 3);
  const delay = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  const colour = new Float32Array(COUNT * 3);
  const kind = new Float32Array(COUNT);
  const seed = new Float32Array(COUNT);

  const ink = new THREE.Color('#1d4fa3');
  const deep = new THREE.Color('#0d1a2b');
  const sky = new THREE.Color('#5d8fd6');
  const gold = new THREE.Color('#c79a3d');
  const KIND = { iris: 0, pupil: 1, limbus: 2, upper: 3, lower: 4, lash: 5, dust: 6 };
  const shares = [[KIND.iris, 0.42], [KIND.pupil, 0.1], [KIND.limbus, 0.09], [KIND.upper, 0.1], [KIND.lower, 0.07], [KIND.lash, 0.08], [KIND.dust, 0.14]];
  const kindOf = (i) => {
    let at = i / COUNT;
    for (const [k, share] of shares) {
      if (at < share) return k;
      at -= share;
    }
    return KIND.dust;
  };

  for (let i = 0; i < COUNT; i++) {
    const k = kindOf(i);
    const a = hash(i * 1.7);
    const b = hash(i * 2.9 + 1);
    const c = hash(i * 4.3 + 2);
    let x = 0;
    let y = 0;
    let z = 0;
    let tone = ink;
    let dot = 1;
    if (k === KIND.iris) {
      // Strands of the iris: along 64 rays, denser near the pupil, the collarette in gold.
      const ray = Math.floor(a * 64);
      const angle = ((ray + (b - 0.5) * 0.5) / 64) * Math.PI * 2;
      const r = 1.05 + Math.pow(c, 0.8) * 1.6;
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
      z = 0.7 * (1 - (r / 2.8) ** 2);
      tone = r < 1.6 ? gold : (c > 0.7 ? sky : ink);
      dot = 0.8 + b * 0.6;
    } else if (k === KIND.pupil) {
      // The pupil, filled, its edge a little denser.
      const angle = a * Math.PI * 2;
      const r = b < 0.35 ? 0.94 + b * 0.2 : Math.sqrt((b - 0.35) / 0.65) * 0.95;
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
      z = 0.62;
      tone = deep;
      dot = 1.25;
    } else if (k === KIND.limbus) {
      const angle = a * Math.PI * 2;
      const r = 2.66 + (b - 0.5) * 0.16;
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
      z = 0.05;
      tone = deep;
      dot = 1.05;
    } else if (k === KIND.upper || k === KIND.lower) {
      x = (a * 2 - 1) * LID_W;
      const lid = k === KIND.upper ? upperLid(x) : lowerLid(x);
      y = lid + (b - 0.5) * 0.12;
      z = 0.3;
      tone = deep;
      dot = 1.15;
    } else if (k === KIND.lash) {
      // Lashes: short strokes of dots along the upper lid, curving up and out.
      const base = (Math.floor(a * 30) / 30) * 2 - 1;
      const bx = base * LID_W * 0.92;
      const t = b;
      x = bx + bx * 0.06 * t;
      y = upperLid(bx) + t * 0.9 + t * t * 0.15;
      z = 0.3 + t * 0.2;
      tone = deep;
      dot = 0.85;
    } else {
      // A few dots stay around, the rest of the team, in a loose halo.
      const angle = a * Math.PI * 2;
      const r = 6.2 + b * 4.5;
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r * 0.62;
      z = (c - 0.5) * 3;
      tone = c > 0.5 ? sky : ink;
      dot = 0.6 + c * 0.5;
    }
    target.set([x, y, z], i * 3);
    // Closed, the upper lid lies on the lower one and its lashes point down.
    let cx = x;
    let cy = y;
    if (k === KIND.upper) {
      cy = lowerLid(x) + 0.08;
    } else if (k === KIND.lash) {
      const bx = (Math.floor(a * 30) / 30) * 2 - 1;
      cy = lowerLid(bx * LID_W * 0.92) - b * 0.7;
      cx = x;
    }
    closed.set([cx, cy, z], i * 3);
    // Scattered: anywhere around, a little in front and behind.
    const sa = hash(i * 7.1) * Math.PI * 2;
    const sr = 4 + hash(i * 3.7) * 9;
    scatter.set([Math.cos(sa) * sr, Math.sin(sa) * sr * 0.7, (hash(i * 5.3) - 0.5) * 10], i * 3);
    delay[i] = hash(i * 9.1) * 0.9 + (k === KIND.dust ? 0.4 : 0);
    size[i] = dot;
    colour.set([tone.r, tone.g, tone.b], i * 3);
    kind[i] = k;
    seed[i] = hash(i * 13.7);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(target, 3));
  geometry.setAttribute('aClosed', new THREE.BufferAttribute(closed, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colour, 3));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const uniforms = {
    uTime: { value: 0 },
    uGather: { value: 0 },
    uBlink: { value: 0 },
    uBreath: { value: 0 },
    uTurn: { value: 0 },
    uLook: { value: new THREE.Vector2() },
    uPointer: { value: new THREE.Vector2(99, 99) },
    uPointerOn: { value: 0 },
    uScale: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aClosed;
      attribute vec3 aScatter;
      attribute float aDelay;
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aKind;
      attribute float aSeed;
      uniform float uTime;
      uniform float uGather;
      uniform float uBlink;
      uniform float uBreath;
      uniform float uTurn;
      uniform vec2 uLook;
      uniform vec2 uPointer;
      uniform float uPointerOn;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float g = clamp((uGather - aDelay) / 0.9, 0.0, 1.0);
        g = g * g * (3.0 - 2.0 * g);
        vec3 shaped = mix(position, aClosed, uBlink);
        bool isEye = aKind < 2.5;
        if (isEye) {
          // The iris turns slowly; the pupil breathes (the strands near it follow); the eye looks.
          float r = length(shaped.xy);
          float a = atan(shaped.y, shaped.x) + uTurn * (aKind < 0.5 ? 1.0 : 0.0);
          float open = uBreath * (1.0 - smoothstep(1.0, 2.7, r));
          r += open;
          shaped.xy = vec2(cos(a), sin(a)) * r + uLook;
        }
        vec3 p = mix(aScatter, shaped, g);
        // Never quite still: each dot drifts a little on its own.
        float drift = 0.035 + 0.3 * (1.0 - g) + (aKind > 5.5 ? 0.25 : 0.0);
        p += vec3(sin(uTime * 0.7 + aSeed * 6.28), cos(uTime * 0.6 + aSeed * 4.1), sin(uTime * 0.5 + aSeed * 3.3)) * drift;
        // Under the pointer, the dots draw aside.
        vec2 away = p.xy - uPointer;
        float d = length(away);
        p.xy += (away / max(d, 0.001)) * uPointerOn * 1.1 * exp(-d * d / 1.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale * (22.0 / -mv.z);
        vColor = aColor;
        float covered = isEye ? uBlink * 0.85 : 0.0;
        vAlpha = (0.25 + 0.75 * g) * (1.0 - covered);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.32, d) * vAlpha;
        gl_FragColor = vec4(vColor, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const eye = new THREE.Group();
  eye.add(points);
  scene.add(eye);

  let viewHalfWidth = 10;
  let viewHalfHeight = 6;
  const resize = (width, height) => {
    camera.aspect = width / height;
    // The eye (about 12 units wide with its lids) fills most of the width of the scene.
    const fitWidth = 12.5;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    camera.position.z = Math.max(fitWidth / 2 / (Math.tan(halfFov) * camera.aspect), 8.5 / Math.tan(halfFov));
    camera.updateProjectionMatrix();
    viewHalfHeight = Math.tan(halfFov) * camera.position.z;
    viewHalfWidth = viewHalfHeight * camera.aspect;
    uniforms.uScale.value = Math.min(window.devicePixelRatio || 1, 2) * 3.4 * Math.max(0.7, height / 440);
  };

  // Blinks: one now and then, quick down, a little slower up.
  let nextBlink = 4.5;
  const blinkAt = (time) => {
    const t = time - nextBlink;
    if (t > 0.42) {
      nextBlink = time + 4 + hash(time) * 4;
      return 0;
    }
    if (t < 0) return 0;
    return t < 0.12 ? (t / 0.12) ** 2 : (1 - (t - 0.12) / 0.3) ** 2;
  };

  const update = ({ time, pointer }) => {
    uniforms.uTime.value = time;
    uniforms.uGather.value = Math.min(2, time / 2.4);
    uniforms.uBlink.value = time > 3 ? blinkAt(time) : 0;
    uniforms.uBreath.value = Math.sin(time * 0.8) * 0.12;
    uniforms.uTurn.value = time * 0.05;
    // The eye looks toward the pointer, the dots under it draw aside.
    uniforms.uLook.value.set(pointer.x * 0.55, pointer.y * 0.4);
    uniforms.uPointer.value.set(pointer.x * viewHalfWidth, pointer.y * viewHalfHeight);
    uniforms.uPointerOn.value = pointer.over;
    eye.rotation.y = pointer.x * 0.25 + Math.sin(time * 0.3) * 0.08;
    eye.rotation.x = -pointer.y * 0.18;
    return false;
  };

  return { scene, camera, resize, update };
}
