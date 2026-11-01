// The eye in three dimensions, drawn in fine lines like the drawings of the site.
// Surgeries page (data-eye3d="zones", on the night): behind the head of the page, every 3 s it turns
// to show where the next operation acts, and that part lights up in the colour of the operation
// (lens, cornea, eyelids, retina) together with its entry in the index; pointing or focusing an
// entry shows its part. A button pauses it.
// 404 page (data-eye3d="look", on the paper): the eye searches the missing page for 4 s, then looks
// at the pointer; only the globe turns, behind its lids.
// This is its page side. It is drawn by eye3d-draw.js (three.js r185) once the page itself has
// loaded, in a worker of its own (draw3d.js): building it and drawing it never stop the page. Without
// WebGL 2 nothing changes on the page.
import { draw3d } from './draw3d.js';

const stage = document.querySelector('[data-eye3d]');
// The colours of the site the eye is drawn with (eye3d-draw.js).
const TOKENS = ['--c-blue', '--c-sky', '--c-amber', '--c-violet', '--c-rose', '--c-teal', '--c-ink'];

if (stage) {
  const whenIdle = (task) => ('requestIdleCallback' in window ? window.requestIdleCallback(task, { timeout: 1500 }) : window.setTimeout(task, 300));
  if (document.readyState === 'complete') {
    whenIdle(begin);
  } else {
    window.addEventListener('load', () => whenIdle(begin), { once: true });
  }
}

function begin() {
  const isLook = stage.dataset.eye3d === 'look';
  const css = getComputedStyle(document.documentElement);
  const index = new Map([...document.querySelectorAll('.bloc-index a[href^="#"]')].map((link) => [link.hash.slice(1), link]));
  const playButton = document.querySelector('[data-eye3d-play]');
  let zone = null;
  let pointed = null;
  let isPlaying = true;
  // Looking at the visitor (404), no part is lit.
  const shownZone = () => (isLook ? null : pointed || zone);
  const markIndex = () => {
    index.forEach((link, name) => link.classList.toggle('is-lit', name === shownZone()));
  };

  const drawing = draw3d({
    stage,
    canvas: stage.querySelector('canvas'),
    drawing: './eye3d-draw.js',
    data: {
      isLook,
      styles: Object.fromEntries(TOKENS.map((name) => [name, css.getPropertyValue(name)])),
      dpr: window.devicePixelRatio || 1,
      isTouch: window.matchMedia('(hover: none)').matches,
    },
    receive: (message) => {
      if (message.type === 'ready') {
        zone = message.zone;
        listen();
        markIndex();
        if (playButton) {
          playButton.hidden = false;
        }
        stage.classList.add('is-ready');
      } else if (message.type === 'zone') {
        zone = message.zone;
        markIndex();
      } else if (message.type === 'lost') {
        stage.classList.remove('is-ready');
      } else if (message.type === 'restored') {
        stage.classList.add('is-ready');
      }
    },
  });

  // Once the eye is there: its button, the index, the pointer.
  function listen() {
    playButton?.addEventListener('click', () => {
      isPlaying = !isPlaying;
      playButton.classList.toggle('is-paused', !isPlaying);
      playButton.setAttribute('aria-label', isPlaying ? "Mettre en pause l'animation de l'œil" : "Reprendre l'animation de l'œil");
      drawing.send({ type: 'playing', value: isPlaying });
    });

    index.forEach((link, name) => {
      const show = () => {
        pointed = name;
        markIndex();
        drawing.send({ type: 'pointed', zone: name });
      };
      const release = () => {
        if (pointed === name) {
          pointed = null;
          zone = name;
          markIndex();
          drawing.send({ type: 'release', zone: name });
        }
      };
      link.addEventListener('pointerenter', show);
      link.addEventListener('focus', show);
      link.addEventListener('pointerleave', release);
      link.addEventListener('blur', release);
    });

    // 404: the eye looks at the pointer, or where the page is touched (once it has searched).
    if (isLook) {
      const lookAt = (event) => {
        const box = stage.getBoundingClientRect();
        drawing.send({
          type: 'look',
          dx: (event.clientX - (box.left + box.width / 2)) / Math.max(1, box.width),
          dy: (event.clientY - (box.top + box.height / 2)) / Math.max(1, box.height),
        });
      };
      window.addEventListener('pointermove', lookAt, { passive: true });
      window.addEventListener('pointerdown', lookAt, { passive: true });
    }

    // With a mouse, the eye leans a little towards the pointer over the head of the page.
    const pageHead = stage.closest('section') || stage;
    if (!isLook && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      pageHead.addEventListener('pointermove', (event) => {
        const box = pageHead.getBoundingClientRect();
        drawing.send({ type: 'tilt', x: ((event.clientX - box.left) / box.width - 0.5) * 10, y: ((event.clientY - box.top) / box.height - 0.5) * 8 });
      });
      pageHead.addEventListener('pointerleave', () => drawing.send({ type: 'tilt', x: 0, y: 0 }));
    }
  }
}
