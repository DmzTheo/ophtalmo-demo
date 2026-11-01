// The drawing of the 3D scenes of the site (scene3d.js is their page side): three.js r185
// (assets/vendor/three), the scene (scenes/name.js), the studio light of the shiny ones, the frames.
// It runs in a worker (draw3d.js), or in the page where a browser cannot draw in one, and knows of the
// page only what the page tells it. A scene plays while it is on screen, as finely as the graphics
// chip allows (fineness.js); paused, the pointer still turns it.

import { fineness } from './fineness.js';

// The drawing context as three.js asks for it with the options of the renderer below (r185).
const CONTEXT = { alpha: true, depth: true, stencil: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false };
const isInPage = typeof document !== 'undefined';

// In the page, the next calm moment (at the latest a second and a half later): its long pieces of
// work then do not interrupt the animations of a scroll. A worker has nothing else to do.
const calmMoment = () => new Promise((resolve) => {
  if (!isInPage) {
    resolve();
  } else if ('requestIdleCallback' in window) {
    window.requestIdleCallback(resolve, { timeout: 1500 });
  } else {
    window.setTimeout(resolve, 100);
  }
});

// A canvas for the pictures of a scene (its textures).
const makeCanvas = (width, height) => {
  const canvas = isInPage ? document.createElement('canvas') : new OffscreenCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

// A soft photographer's studio, as light for the shiny and transparent materials: a warm box above,
// a warm one on the left, a cool one on the right, in a dim room.
function studio(THREE, renderer) {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0x2b2722, side: THREE.BackSide })));
  const softBox = (width, height, color, power, position) => {
    const box = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }),
    );
    box.position.set(...position);
    box.lookAt(0, 0, 0);
    room.add(box);
  };
  softBox(7, 2.4, 0xfff6ea, 7, [0, 5.5, 0.5]);
  softBox(2.2, 5, 0xffe2c2, 3.6, [-5.5, 1, 1.5]);
  softBox(2.2, 5, 0xd6e4ff, 2.8, [5.5, 0.5, -1]);
  const generator = new THREE.PMREMGenerator(renderer);
  // 128 pixels a face are enough for these large soft lights (a quarter of the default work).
  const texture = generator.fromScene(room, 0.035, 0.1, 100, { size: 128 }).texture;
  generator.dispose();
  return texture;
}

// data: name (of the scene), styles (the colours of the site it takes), dpr, isTouch, reduceMotion.
export async function start(link, canvas, data) {
  let context = null;
  try {
    context = canvas.getContext('webgl2', CONTEXT);
  } catch (error) {
    context = null;
  }
  // Without WebGL 2 (or frames) here, the page stays as it is.
  if (!context || typeof requestAnimationFrame !== 'function') {
    link.fail();
    return;
  }
  link.alive();

  // The time of the scene runs while it plays; the pointer (from -1 to 1 over the scene, followed
  // softly) works even while it is paused.
  const state = {
    time: 0,
    dt: 0,
    motion: 0,
    isPlaying: true,
    isVisible: false,
    isHidden: false,
    pointer: { x: 0, y: 0, targetX: 0, targetY: 0, over: 0, isOver: false, clientX: 0, clientY: 0 },
  };
  // What the page says: the stage, its button, the pointer, and what its side of the scene says to
  // the scene (kept until the scene listens).
  let size = null;
  let hasSize = null;
  const isSized = new Promise((resolve) => {
    hasSize = resolve;
  });
  let hearScene = null;
  const forScene = [];
  let resize = () => {};
  let wake = () => {};
  link.listen((message) => {
    if (message.type === 'size') {
      size = message;
      hasSize();
      resize();
    } else if (message.type === 'visible') {
      state.isVisible = message.value;
      wake();
    } else if (message.type === 'hidden') {
      state.isHidden = message.value;
      wake();
    } else if (message.type === 'playing') {
      state.isPlaying = message.value;
      wake();
    } else if (message.type === 'pointer') {
      Object.assign(state.pointer, message.pointer);
      wake();
    } else if (message.type === 'scene' && hearScene) {
      hearScene(message.message);
    } else if (message.type === 'scene') {
      forScene.push(message.message);
    }
  });

  const [THREE, scene] = await Promise.all([import('../vendor/three/three.module.min.js'), import(`./scenes/${data.name}.js`)]);
  await isSized;
  await calmMoment();
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'low-power' });
  // No reading back of the compilation logs (made for development): it waits for every shader.
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const isSmall = () => size.width < 520;
  // At most 2 pixels per point (1.75 on a small scene), phones starting at 1.5, never under 1.
  const finest = Math.min(data.dpr || 1, isSmall() ? 1.75 : 2);
  const fine = fineness({ max: finest, min: Math.min(finest, 1), start: data.isTouch ? Math.min(finest, 1.5) : finest, onChange: () => resize() });
  let environment = null;
  const kit = {
    renderer,
    isSmall,
    dpr: data.dpr || 1,
    reduceMotion: data.reduceMotion,
    environment: () => (environment ||= studio(THREE, renderer)),
    css: (name, fallback) => data.styles[name] || fallback,
    canvas: makeCanvas,
    // What the page side of the scene (page() of scenes/name.js) says, and what the scene says to it.
    listen: (handler) => {
      hearScene = handler;
      forScene.splice(0).forEach(handler);
    },
    send: (message, transfer) => link.send({ type: 'scene', message }, transfer),
    // A scene may ask for frames while it is being built: the request waits for the loop to exist.
    wake: () => queueMicrotask(() => wake()),
  };
  // A scene lit by the studio has it made first, at its own calm moment: two shorter pieces of work
  // rather than one long one.
  if (scene.usesStudio) {
    kit.environment();
    await calmMoment();
  }
  const view = scene.create(THREE, kit);
  // (A scene may wait for its page side: the spectacle lens for its pictures.)
  await view.ready;

  const timer = new THREE.Timer();
  let isRunning = false;
  // Nothing is drawn before the shaders are compiled (in the background, see below).
  let isCompiled = false;
  const follow = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));

  const frame = (tick) => {
    fine.frame(tick);
    timer.update();
    // The time of the scene is real time, whatever the number of frames per second; the softened
    // movements use a bounded step, so that a slow frame never makes them jump.
    const elapsed = Math.min(2, timer.getDelta());
    const dt = Math.min(0.05, elapsed);
    state.dt = dt;
    state.elapsed = elapsed;
    state.motion = state.isPlaying ? elapsed : 0;
    state.time += state.motion;
    const p = state.pointer;
    p.x = follow(p.x, p.targetX, 4, dt);
    p.y = follow(p.y, p.targetY, 4, dt);
    p.over = follow(p.over, p.isOver ? 1 : 0, 5, dt);
    const isBusy = view.update(state);
    renderer.render(view.scene, view.camera);
    const isPointerStill = Math.abs(p.x - p.targetX) < 0.001 && Math.abs(p.y - p.targetY) < 0.001 && Math.abs(p.over - (p.isOver ? 1 : 0)) < 0.002;
    const canRest = !state.isVisible || state.isHidden || (!state.isPlaying && isPointerStill && !isBusy);
    if (canRest) {
      isRunning = false;
      fine.rest();
    }
  };
  // The loop of frames is our own: that of three.js, stopped from inside a frame, went on asking for
  // frames, and once started again drew every frame twice (three times after a second rest...).
  let frameRequest = 0;
  const loop = (tick) => {
    frame(tick);
    if (isRunning) {
      frameRequest = requestAnimationFrame(loop);
    }
  };

  wake = () => {
    if (!isRunning && isCompiled && state.isVisible && !state.isHidden) {
      isRunning = true;
      timer.reset();
      frameRequest = requestAnimationFrame(loop);
    }
  };

  resize = () => {
    renderer.setPixelRatio(fine.ratio);
    renderer.setSize(size.width, size.height, false);
    view.resize(size.width, size.height);
    if (!isRunning && isCompiled) {
      renderer.render(view.scene, view.camera);
    }
    wake();
  };

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frameRequest);
    isRunning = false;
    link.send({ type: 'lost' });
  });
  canvas.addEventListener('webglcontextrestored', () => {
    link.send({ type: 'restored' });
    wake();
  });

  resize();
  // The shaders are compiled in the background before the first frame (on a phone, up to most of a
  // second for the glass of the spectacle lens).
  const compiled = typeof renderer.compileAsync === 'function' ? renderer.compileAsync(view.scene, view.camera) : Promise.resolve();
  compiled.catch(() => {}).then(() => {
    isCompiled = true;
    link.send({ type: 'ready' });
    resize();
  });
}
