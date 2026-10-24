// Ink for the scenes drawn in lines (the eye of the atlas, the map of the cabinets), like the eye of
// the surgeries page: hairlines of one pixel, and ribbons, lines a few pixels wide whatever their
// distance. Both can be drawn little by little along their length (uDraw), carry pulses of light
// running along them (uFlow), and fade by key (uLoss: a line whose key passes 1 - uLoss stays as a
// ghost). A line is given as points; its place along itself (t) runs from `from` to `to`.

const lineVertexShader = /* glsl */ `
  attribute float aT;
  attribute float aK;
  varying float vT;
  varying float vK;
  void main() {
    vT = aT;
    vK = aK;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Each segment of a ribbon is a quad: its four corners move apart on the screen, across the segment,
// by half the width (in pixels of the drawing buffer), and a little along it to close the joints.
const ribbonVertexShader = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aSide;
  attribute float aEndpoint;
  attribute float aT0;
  attribute float aT1;
  attribute float aK;
  uniform vec2 uResolution;
  uniform float uWidth;
  varying float vT;
  varying float vK;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
    vec2 halfSize = uResolution * 0.5;
    vec2 screenA = a.xy / a.w * halfSize;
    vec2 screenB = b.xy / b.w * halfSize;
    vec2 along = screenB - screenA;
    along = length(along) > 0.0001 ? normalize(along) : vec2(1.0, 0.0);
    vec2 across = vec2(-along.y, along.x);
    vec4 corner = mix(a, b, aEndpoint);
    vec2 offset = across * aSide * uWidth * 0.5 + along * (aEndpoint * 2.0 - 1.0) * uWidth * 0.3;
    corner.xy += offset / halfSize * corner.w;
    gl_Position = corner;
    vT = mix(aT0, aT1, aEndpoint);
    vK = aK;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform float uOpacity;
  uniform float uDraw;
  uniform float uFlow;
  uniform float uTime;
  uniform float uPulses;
  uniform float uSpeed;
  uniform float uPulseGain;
  uniform float uLoss;
  uniform float uDash;
  uniform float uDashSpeed;
  uniform float uEdge;
  varying float vT;
  varying float vK;
  void main() {
    if (vT > uDraw) discard;
    // Dashes running along the line (uDash of them over its length), or a full line.
    if (uDash > 0.0 && fract(vT * uDash - uTime * uDashSpeed) > 0.55) discard;
    float alpha = uOpacity * (1.0 - 0.8 * smoothstep(1.0 - uLoss, 1.04 - uLoss, vK));
    // Lines whose key reaches 1 at the edge of a map fade into the page there.
    alpha *= 1.0 - uEdge * smoothstep(0.62, 1.0, vK);
    float pulse = uFlow * pow(max(0.0, sin((vT * uPulses - uTime * uSpeed) * 6.2831853)), 8.0);
    vec3 colour = mix(uColor, uGlow, pulse);
    gl_FragColor = vec4(colour, clamp(alpha * (1.0 + pulse * uPulseGain), 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function createInk(THREE) {
  // The size of the drawing buffer, shared by all the ribbons (set by the scene when it resizes).
  const resolution = new THREE.Vector2(1, 1);
  let pixelRatio = 1;

  const uniforms = (color, opacity) => ({
    uColor: { value: new THREE.Color(color) },
    uGlow: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uDraw: { value: 2 },
    uFlow: { value: 0 },
    uTime: { value: 0 },
    uPulses: { value: 3 },
    uSpeed: { value: 0.55 },
    uPulseGain: { value: 0.6 },
    uLoss: { value: 0 },
    uDash: { value: 0 },
    uDashSpeed: { value: 0 },
    uEdge: { value: 0 },
  });
  // Ink is laid on the paper; on the night, lines are light added to the dark (isLight).
  const material = (color, opacity, { width = 0, isLight = false } = {}) => {
    const isRibbon = width > 0;
    const shader = new THREE.ShaderMaterial({
      uniforms: isRibbon
        ? { ...uniforms(color, opacity), uResolution: { value: resolution }, uWidth: { value: width } }
        : uniforms(color, opacity),
      vertexShader: isRibbon ? ribbonVertexShader : lineVertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: isLight ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    // The width is given in pixels of the page: it follows the pixel ratio of the screen.
    shader.userData.width = width;
    return shader;
  };

  // Lines collected as segments, each end with its place along its line and the key of its line.
  const strokes = () => {
    const segments = [];
    const api = {
      segment(a, b, ta = 0, tb = 0, key = 0) {
        segments.push([a, b, ta, tb, key]);
        return api;
      },
      line(points, { from = 0, to = 1, key = 0 } = {}) {
        const lengths = [0];
        for (let i = 1; i < points.length; i++) {
          lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
        }
        const total = lengths[lengths.length - 1] || 1;
        for (let i = 0; i < points.length - 1; i++) {
          api.segment(points[i], points[i + 1], from + ((to - from) * lengths[i]) / total, from + ((to - from) * lengths[i + 1]) / total, key);
        }
        return api;
      },
      get count() {
        return segments.length;
      },
      // Hairlines (LineSegments).
      lines(shader) {
        const position = new Float32Array(segments.length * 6);
        const along = new Float32Array(segments.length * 2);
        const keys = new Float32Array(segments.length * 2);
        segments.forEach(([a, b, ta, tb, key], i) => {
          position.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
          along.set([ta, tb], i * 2);
          keys.set([key, key], i * 2);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
        geometry.setAttribute('aT', new THREE.BufferAttribute(along, 1));
        geometry.setAttribute('aK', new THREE.BufferAttribute(keys, 1));
        return new THREE.LineSegments(geometry, shader);
      },
      // Ribbons (a mesh of quads).
      ribbons(shader) {
        const ribbon = movingRibbons(segments.length, shader);
        ribbon.begin();
        segments.forEach(([a, b, ta, tb, key]) => ribbon.push(a, b, ta, tb, key));
        ribbon.end();
        return ribbon.object;
      },
    };
    return api;
  };

  // Ribbons whose points move: room for `capacity` segments, rewritten between begin() and end().
  const movingRibbons = (capacity, shader) => {
    const geometry = new THREE.BufferGeometry();
    const attribute = (size) => {
      const buffer = new THREE.BufferAttribute(new Float32Array(capacity * 4 * size), size);
      buffer.setUsage(THREE.DynamicDrawUsage);
      return buffer;
    };
    const start = attribute(3);
    const end = attribute(3);
    const position = attribute(3);
    const t0 = attribute(1);
    const t1 = attribute(1);
    const keys = attribute(1);
    const side = new THREE.BufferAttribute(new Float32Array(capacity * 4), 1);
    const endpoint = new THREE.BufferAttribute(new Float32Array(capacity * 4), 1);
    const index = [];
    for (let i = 0; i < capacity; i++) {
      side.array.set([-1, 1, -1, 1], i * 4);
      endpoint.array.set([0, 0, 1, 1], i * 4);
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    }
    geometry.setIndex(index);
    geometry.setAttribute('position', position);
    geometry.setAttribute('aStart', start);
    geometry.setAttribute('aEnd', end);
    geometry.setAttribute('aT0', t0);
    geometry.setAttribute('aT1', t1);
    geometry.setAttribute('aK', keys);
    geometry.setAttribute('aSide', side);
    geometry.setAttribute('aEndpoint', endpoint);
    const object = new THREE.Mesh(geometry, shader);
    object.frustumCulled = false;
    let count = 0;
    return {
      object,
      begin() {
        count = 0;
      },
      push(a, b, ta = 0, tb = 0, key = 0) {
        if (count >= capacity) {
          return;
        }
        for (let k = 0; k < 4; k++) {
          const i = count * 4 + k;
          start.setXYZ(i, a.x, a.y, a.z);
          end.setXYZ(i, b.x, b.y, b.z);
          const corner = k < 2 ? a : b;
          position.setXYZ(i, corner.x, corner.y, corner.z);
          t0.setX(i, ta);
          t1.setX(i, tb);
          keys.setX(i, key);
        }
        count += 1;
      },
      // A line through the points, as consecutive segments.
      line(points, { from = 0, to = 1, key = 0 } = {}) {
        for (let i = 0; i < points.length - 1; i++) {
          this.push(points[i], points[i + 1], from + ((to - from) * i) / (points.length - 1), from + ((to - from) * (i + 1)) / (points.length - 1), key);
        }
      },
      end() {
        geometry.setDrawRange(0, count * 6);
        [start, end, position, t0, t1, keys].forEach((buffer) => {
          buffer.needsUpdate = true;
        });
      },
    };
  };

  // Hairlines whose points move.
  const movingLines = (capacity, shader) => {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(capacity * 6), 3);
    const along = new THREE.BufferAttribute(new Float32Array(capacity * 2), 1);
    position.setUsage(THREE.DynamicDrawUsage);
    along.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('aT', along);
    geometry.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(capacity * 2), 1));
    const object = new THREE.LineSegments(geometry, shader);
    object.frustumCulled = false;
    let count = 0;
    return {
      object,
      begin() {
        count = 0;
      },
      push(a, b, ta = 0, tb = 0) {
        if (count >= capacity) {
          return;
        }
        position.setXYZ(count * 2, a.x, a.y, a.z);
        position.setXYZ(count * 2 + 1, b.x, b.y, b.z);
        along.setX(count * 2, ta);
        along.setX(count * 2 + 1, tb);
        count += 1;
      },
      end() {
        geometry.setDrawRange(0, count * 2);
        position.needsUpdate = true;
        along.needsUpdate = true;
      },
    };
  };

  // To call when the scene resizes: ribbons keep their width in pixels of the page.
  const resize = (width, height, ratio, shaders) => {
    pixelRatio = ratio;
    resolution.set(width * ratio, height * ratio);
    shaders.forEach((shader) => {
      if (shader.uniforms.uWidth) {
        shader.uniforms.uWidth.value = shader.userData.width * pixelRatio;
      }
    });
  };

  return { material, strokes, movingRibbons, movingLines, resize };
}
