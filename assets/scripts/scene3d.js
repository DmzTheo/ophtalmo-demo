// Animated 3D scenes of the site (data-scene3d="name"; the scene itself is
// assets/scripts/scenes/name.js). Most are drawn in lines, like the eye of the surgeries page (ink of
// scenes/ink.js): the map of the two cabinets, the eye of the atlas of the diseases on its night
// screen, and beside the titles the implant, the cornea under the laser, the medicine in the eye and
// the Amsler grid. Two keep a look of their own: the team as a cloud of ink dots gathering into an
// eye, a spectacle lens of real glass over a reading chart.
// Three.js r185 (assets/vendor/three) is loaded once the page has loaded, at a calm moment, and the
// scenes of the page are made then, wherever they are: loading three.js (three quarters of a
// megabyte to read) and building a scene are long pieces of work, which, made when a scene came near
// the screen, stopped the page in the middle of a scroll. Without WebGL 2 the page stays as it is. A
// scene plays while it is on screen, as finely as the graphics chip allows (fineness.js); its button
// pauses it (the pointer still turns it).

import { fineness } from './fineness.js';

const stages = [...document.querySelectorAll('[data-scene3d]')];

const hasWebGL2 = () => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch (error) {
    return false;
  }
};

if (stages.length && hasWebGL2()) {
  const whenIdle = (task) => ('requestIdleCallback' in window ? window.requestIdleCallback(task, { timeout: 1500 }) : window.setTimeout(task, 300));
  const startAll = async () => {
    for (const stage of stages) {
      await start(stage);
    }
  };
  if (document.readyState === 'complete') {
    whenIdle(startAll);
  } else {
    window.addEventListener('load', () => whenIdle(startAll), { once: true });
  }
}

let three = null;

// The next calm moment of the page (at the latest a second and a half later).
const calmMoment = () => new Promise((resolve) => ('requestIdleCallback' in window ? window.requestIdleCallback(resolve, { timeout: 1500 }) : window.setTimeout(resolve, 100)));

async function start(stage) {
  try {
    three ||= import('../vendor/three/three.module.min.js');
    const [THREE, scene] = await Promise.all([three, import(`./scenes/${stage.dataset.scene3d}.js`)]);
    // The scene is built at calm moments of the page: its building, a long piece of work, then does
    // not interrupt the animations of a scroll.
    await calmMoment();
    await run(THREE, stage, scene);
  } catch (error) {
    // Nothing is shown: the page stays as it is.
  }
}

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

async function run(THREE, stage, scene) {
  const canvas = stage.querySelector('canvas') || stage.appendChild(document.createElement('canvas'));
  canvas.classList.add('scene3d__canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  // No reading back of the compilation logs (made for development): it waits for every shader.
  renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isSmall = () => stage.clientWidth < 520;
  // At most 2 pixels per point (1.75 on a small scene), phones starting at 1.5, never under 1.
  const finest = Math.min(window.devicePixelRatio || 1, isSmall() ? 1.75 : 2);
  const isTouch = window.matchMedia('(hover: none)').matches;
  const fine = fineness({ max: finest, min: Math.min(finest, 1), start: isTouch ? Math.min(finest, 1.5) : finest, onChange: () => resize() });
  let environment = null;
  const kit = {
    stage,
    renderer,
    isSmall,
    reduceMotion: reduceMotion.matches,
    environment: () => (environment ||= studio(THREE, renderer)),
    css: (name, fallback) => (getComputedStyle(stage).getPropertyValue(name).trim() || fallback),
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

  // The time of the scene runs while it plays; the pointer (from -1 to 1 over the scene, followed
  // softly) works even while it is paused.
  const state = {
    time: 0,
    dt: 0,
    motion: 0,
    isPlaying: true,
    isVisible: false,
    pointer: { x: 0, y: 0, targetX: 0, targetY: 0, over: 0, isOver: false, clientX: 0, clientY: 0 },
  };
  const area = stage.closest('section') || stage;
  area.addEventListener('pointermove', (event) => {
    const box = stage.getBoundingClientRect();
    state.pointer.targetX = Math.max(-1.5, Math.min(1.5, ((event.clientX - box.left) / box.width) * 2 - 1));
    state.pointer.targetY = Math.max(-1.5, Math.min(1.5, -(((event.clientY - box.top) / box.height) * 2 - 1)));
    state.pointer.isOver = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    state.pointer.clientX = event.clientX;
    state.pointer.clientY = event.clientY;
    wake();
  }, { passive: true });
  area.addEventListener('pointerleave', () => {
    state.pointer.targetX = 0;
    state.pointer.targetY = 0;
    state.pointer.isOver = false;
    wake();
  });

  const timer = new THREE.Timer();
  timer.connect(document);
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
    const canRest = !state.isVisible || document.hidden || (!state.isPlaying && isPointerStill && !isBusy);
    if (canRest) {
      renderer.setAnimationLoop(null);
      isRunning = false;
      fine.rest();
    }
  };

  function wake() {
    if (!isRunning && isCompiled && state.isVisible && !document.hidden) {
      isRunning = true;
      timer.reset();
      renderer.setAnimationLoop(frame);
    }
  }

  // The pause of the scene.
  const button = stage.querySelector('[data-scene3d-play]');
  const setPlaying = (isPlaying) => {
    state.isPlaying = isPlaying;
    button?.classList.toggle('is-paused', !isPlaying);
    button?.setAttribute('aria-label', isPlaying ? (button.dataset.labelPause || "Mettre en pause l'animation") : (button.dataset.labelPlay || "Reprendre l'animation"));
    wake();
  };
  button?.addEventListener('click', () => setPlaying(!state.isPlaying));

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(fine.ratio);
    renderer.setSize(width, height, false);
    view.resize(width, height);
    if (!isRunning && isCompiled) {
      renderer.render(view.scene, view.camera);
    }
    wake();
  };

  new ViewWatcher((entries) => {
    state.isVisible = entries[0].isIntersecting;
    wake();
  }).observe(stage);
  document.addEventListener('visibilitychange', wake);
  new ResizeObserver(resize).observe(stage);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    isRunning = false;
    stage.classList.remove('is-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    stage.classList.add('is-ready');
    wake();
  });

  resize();
  // The shaders are compiled in the background before the first frame: a scene coming near the
  // screen no longer stops the page while they compile (on a phone, up to most of a second for the
  // glass of the spectacle lens).
  const compiled = typeof renderer.compileAsync === 'function' ? renderer.compileAsync(view.scene, view.camera) : Promise.resolve();
  compiled.catch(() => {}).then(() => {
    isCompiled = true;
    if (button) {
      button.hidden = false;
    }
    stage.classList.add('is-ready');
    resize();
  });
}
