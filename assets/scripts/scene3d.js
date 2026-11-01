// Animated 3D scenes of the site (data-scene3d="name"; the scene itself is
// assets/scripts/scenes/name.js). Most are drawn in lines, like the eye of the surgeries page (ink of
// scenes/ink.js): the map of the two cabinets, the eye of the atlas of the diseases on its night
// screen, and beside the titles the implant, the cornea under the laser, the medicine in the eye and
// the Amsler grid. Two keep a look of their own: the team as a cloud of ink dots gathering into an
// eye, a spectacle lens of real glass over a reading chart.
// This is their page side. They are drawn by scene3d-draw.js (three.js r185, assets/vendor/three)
// once the page has loaded, at a calm moment, in a worker of their own (draw3d.js): loading three.js
// (three quarters of a megabyte to read), building a scene and drawing it never stop the page, at its
// loading or in the middle of a scroll. Without WebGL 2 the page stays as it is. A scene plays while
// it is on screen; its button pauses it (the pointer still turns it).

import { draw3d } from './draw3d.js';

const stages = [...document.querySelectorAll('[data-scene3d]')];

if (stages.length) {
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

async function start(stage) {
  try {
    const name = stage.dataset.scene3d;
    // The page side of the scene: the colours of the site it takes, what it adds to the page.
    const scene = await import(`./scenes/${name}.js`);
    const canvas = stage.querySelector('canvas') || stage.appendChild(document.createElement('canvas'));
    canvas.classList.add('scene3d__canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const style = getComputedStyle(stage);
    const button = stage.querySelector('[data-scene3d-play]');
    let hearScene = null;
    const drawing = draw3d({
      stage,
      canvas,
      drawing: './scene3d-draw.js',
      data: {
        name,
        styles: Object.fromEntries((scene.tokens || []).map((token) => [token, style.getPropertyValue(token).trim()])),
        dpr: window.devicePixelRatio || 1,
        isTouch: window.matchMedia('(hover: none)').matches,
        reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      },
      receive: (message) => {
        if (message.type === 'ready') {
          if (button) {
            button.hidden = false;
          }
          stage.classList.add('is-ready');
        } else if (message.type === 'lost') {
          stage.classList.remove('is-ready');
        } else if (message.type === 'restored') {
          stage.classList.add('is-ready');
        } else if (message.type === 'scene') {
          hearScene?.(message.message);
        }
      },
    });
    hearScene = scene.page?.(stage, (message, transfer) => drawing.send({ type: 'scene', message }, transfer)) || null;

    // The pointer, from -1 to 1 over the scene (followed softly by the drawing), anywhere over its
    // section.
    const pointer = { targetX: 0, targetY: 0, isOver: false, clientX: 0, clientY: 0 };
    const area = stage.closest('section') || stage;
    area.addEventListener('pointermove', (event) => {
      const box = stage.getBoundingClientRect();
      pointer.targetX = Math.max(-1.5, Math.min(1.5, ((event.clientX - box.left) / box.width) * 2 - 1));
      pointer.targetY = Math.max(-1.5, Math.min(1.5, -(((event.clientY - box.top) / box.height) * 2 - 1)));
      pointer.isOver = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      drawing.send({ type: 'pointer', pointer: { ...pointer } });
    }, { passive: true });
    area.addEventListener('pointerleave', () => {
      pointer.targetX = 0;
      pointer.targetY = 0;
      pointer.isOver = false;
      drawing.send({ type: 'pointer', pointer: { ...pointer } });
    });

    // The pause of the scene.
    let isPlaying = true;
    button?.addEventListener('click', () => {
      isPlaying = !isPlaying;
      button.classList.toggle('is-paused', !isPlaying);
      button.setAttribute('aria-label', isPlaying ? (button.dataset.labelPause || "Mettre en pause l'animation") : (button.dataset.labelPlay || "Reprendre l'animation"));
      drawing.send({ type: 'playing', value: isPlaying });
    });
  } catch (error) {
    // Nothing is shown: the page stays as it is.
  }
}
