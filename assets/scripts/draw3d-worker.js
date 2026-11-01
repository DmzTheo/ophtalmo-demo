// The worker of a 3D drawing of the site (draw3d.js): it runs the drawing module the page names, on
// the canvas the page handed over, and carries the messages between them.
let hear = null;
const early = [];
const link = {
  alive: () => self.postMessage({ type: 'alive' }),
  fail: () => self.postMessage({ type: 'fail' }),
  send: (message, transfer = []) => self.postMessage(message, transfer),
  listen: (handler) => {
    hear = handler;
    early.splice(0).forEach(handler);
  },
};

self.addEventListener('message', ({ data: message }) => {
  if (message.type === 'start') {
    import(message.drawing).then(({ start }) => start(link, message.canvas, message.data)).catch(() => link.fail());
  } else if (hear) {
    hear(message);
  } else {
    early.push(message);
  }
});
