// The page side of the 3D drawings of the site (scene3d.js, eye3d.js). The drawing itself (three.js,
// the scene, its frames) runs in a worker of its own (draw3d-worker.js), on the canvas of the stage
// handed over to it: loading three.js, building a scene, compiling its shaders and drawing its frames
// then never hold the page up, while it loads or while it scrolls (in the page they did: on a phone,
// up to a second and a half for the studio light of the spectacle lens). The page tells the drawing
// what only it sees: the size of the stage, whether it is on screen and the page shown, and what the
// script of the stage adds (pointer, buttons, choices). Where a browser cannot draw in a worker (no
// OffscreenCanvas, or no WebGL 2 or no frames there), the same drawing runs in the page, as before.

const canDrawAside = typeof Worker === 'function' && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';

// drawing: the module that draws (its start(link, canvas, data)), next to this one; data: what it
// needs from the page to begin; receive: what it says (ready, lost, restored, and its own messages).
export function draw3d({ stage, canvas, drawing, data, receive }) {
  const url = new URL(drawing, import.meta.url).href;
  // What the page says before the drawing can hear it waits, then goes in order.
  let waiting = [];
  let deliver = null;
  const send = (message, transfer = []) => {
    if (deliver) {
      deliver(message, transfer);
    } else {
      waiting.push([message, transfer]);
    }
  };
  const open = (to) => {
    deliver = to;
    waiting.forEach(([message, transfer]) => to(message, transfer));
    waiting = [];
  };

  // In the page: the two sides talk as through a worker, each message a moment later.
  const drawHere = (target) => {
    let hear = null;
    const early = [];
    const link = {
      alive: () => {},
      fail: () => {},
      send: (message) => queueMicrotask(() => receive(message)),
      listen: (handler) => {
        hear = handler;
        early.splice(0).forEach(handler);
      },
    };
    open((message) => (hear ? queueMicrotask(() => hear(message)) : early.push(message)));
    import(url).then(({ start }) => start(link, target, data)).catch(() => {});
  };

  // In a worker, on the canvas handed over. If the worker cannot draw, it says so before anything has
  // been said to the drawing; the page then draws on a new canvas (the first one is the worker's).
  const drawAside = () => {
    let worker = null;
    let offscreen = null;
    try {
      worker = new Worker(new URL('./draw3d-worker.js', import.meta.url), { type: 'module' });
      offscreen = canvas.transferControlToOffscreen();
    } catch (error) {
      worker?.terminate();
      return false;
    }
    let isAlive = false;
    let hasFailed = false;
    const fallBack = () => {
      if (isAlive || hasFailed) {
        return;
      }
      hasFailed = true;
      worker.terminate();
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      drawHere(fresh);
    };
    worker.addEventListener('message', ({ data: message }) => {
      if (message.type === 'alive') {
        isAlive = true;
        open((next, transfer) => worker.postMessage(next, transfer));
      } else if (message.type === 'fail') {
        fallBack();
      } else {
        receive(message);
      }
    });
    worker.addEventListener('error', fallBack);
    worker.postMessage({ type: 'start', drawing: url, canvas: offscreen, data }, [offscreen]);
    return true;
  };

  if (!(canDrawAside && drawAside())) {
    drawHere(canvas);
  }

  // What the drawing cannot see from there: the size of the stage (read once the page is laid out,
  // never laying it out early), whether the stage is on screen, whether the page is shown.
  new ResizeObserver(() => send({ type: 'size', width: Math.max(1, stage.clientWidth), height: Math.max(1, stage.clientHeight) })).observe(stage);
  new ViewWatcher((entries) => send({ type: 'visible', value: entries[0].isIntersecting })).observe(stage);
  const tellShown = () => send({ type: 'hidden', value: document.hidden });
  document.addEventListener('visibilitychange', tellShown);
  tellShown();
  return { send };
}
