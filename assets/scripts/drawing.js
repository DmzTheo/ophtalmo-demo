// The drawing of the head of a page answers the pointer: where the pointer passes, its lines part
// like threads under a finger, are drawn a little along with it, and close again behind it. It is
// the same drawing as the still one (an SVG of assets/images/drawings, shown in the page through
// <use>), drawn on a canvas in the same place at the first move of the pointer; the still one then
// gives way to it. Mouse only; nothing with reduced motion.
// (What it costs: the drawing is read once the page is at rest, as lines of points, by reading its
// path data here rather than asking the page to lay it out and measure it, which stopped the page for
// a second or more on a slow computer; at each frame, only the part of the canvas around the pointer
// is drawn again, the lines elsewhere do not move.)
(() => {
  const layers = [...document.querySelectorAll('.page-head > .drawing--page, .glasses-hero > .drawing--page, .site-footer > .drawing')];
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!layers.length || !finePointer.matches || reduceMotion.matches || !window.DOMParser) {
    return;
  }
  const VIEW_W = 1600;
  const STEP = 5;
  const REACH = 85;
  const PUSH = 18;
  // Beyond FAR from the pointer the lines do not move (they would by a tenth of a pixel at most).
  const FAR = REACH * 2.4;
  const TAU = Math.PI * 2;

  // ---------- The drawing as lines of points, in drawing units ----------
  // Each shape sampled every STEP along its length, cut where a new piece of path starts, with its
  // dashes if it has some. The drawings (_build/drawings.js) use paths in absolute commands, circles,
  // ellipses, lines, polylines and polygons, without transforms.
  const sampleShape = (shape) => {
    const lines = [];
    // A dense polyline of a piece of shape, then points every STEP along it.
    const resample = (dense) => {
      if (dense.length < 2) {
        return;
      }
      const points = [dense[0][0], dense[0][1]];
      let carried = 0;
      for (let i = 1; i < dense.length; i += 1) {
        const [x0, y0] = dense[i - 1];
        const [x1, y1] = dense[i];
        const length = Math.hypot(x1 - x0, y1 - y0);
        let at = STEP - carried;
        while (at <= length) {
          points.push(x0 + ((x1 - x0) * at) / length, y0 + ((y1 - y0) * at) / length);
          at += STEP;
        }
        carried = length - (at - STEP);
      }
      const [xe, ye] = dense[dense.length - 1];
      const lastX = points[points.length - 2];
      const lastY = points[points.length - 1];
      if (Math.hypot(xe - lastX, ye - lastY) > 0.01) {
        points.push(xe, ye);
      }
      if (points.length >= 4) {
        lines.push(new Float32Array(points));
      }
    };
    const ellipse = (cx, cy, rx, ry) => {
      const count = Math.max(12, Math.ceil((TAU * Math.max(rx, ry)) / 1.5));
      resample(Array.from({ length: count + 1 }, (_, k) => [cx + rx * Math.cos((k / count) * TAU), cy + ry * Math.sin((k / count) * TAU)]));
    };
    const number = (name) => Number(shape.getAttribute(name)) || 0;
    const tag = shape.tagName.toLowerCase();
    if (tag === 'circle') {
      ellipse(number('cx'), number('cy'), number('r'), number('r'));
    } else if (tag === 'ellipse') {
      ellipse(number('cx'), number('cy'), number('rx'), number('ry'));
    } else if (tag === 'line') {
      resample([[number('x1'), number('y1')], [number('x2'), number('y2')]]);
    } else if (tag === 'polyline' || tag === 'polygon') {
      const values = (shape.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      const dense = [];
      for (let i = 0; i + 1 < values.length; i += 2) dense.push([values[i], values[i + 1]]);
      if (tag === 'polygon' && dense.length) dense.push(dense[0]);
      resample(dense);
    } else if (tag === 'path') {
      const tokens = (shape.getAttribute('d') || '').match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
      let i = 0;
      let command = '';
      let x = 0;
      let y = 0;
      let startX = 0;
      let startY = 0;
      let controlX = 0;
      let controlY = 0;
      let previous = '';
      let dense = [];
      const next = () => Number(tokens[i++]);
      const curve = (x1, y1, x2, y2, nx, ny) => {
        const reach = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(nx - x2, ny - y2);
        const count = Math.max(4, Math.ceil(reach / 1.5));
        for (let k = 1; k <= count; k += 1) {
          const t = k / count;
          const u = 1 - t;
          dense.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny]);
        }
        x = nx;
        y = ny;
      };
      // An elliptical arc, from its end points to its centre (SVG 2, appendix B.2.4), sampled.
      const arc = (rx, ry, angle, isLarge, isSweep, nx, ny) => {
        const phi = (angle * Math.PI) / 180;
        const dx = (x - nx) / 2;
        const dy = (y - ny) / 2;
        const x1 = Math.cos(phi) * dx + Math.sin(phi) * dy;
        const y1 = -Math.sin(phi) * dx + Math.cos(phi) * dy;
        let ax = Math.abs(rx);
        let ay = Math.abs(ry);
        if (!ax || !ay) {
          dense.push([nx, ny]);
          x = nx;
          y = ny;
          return;
        }
        const grow = (x1 * x1) / (ax * ax) + (y1 * y1) / (ay * ay);
        if (grow > 1) {
          ax *= Math.sqrt(grow);
          ay *= Math.sqrt(grow);
        }
        const sign = isLarge === isSweep ? -1 : 1;
        const ratio = Math.sqrt(Math.max(0, (ax * ax * ay * ay - ax * ax * y1 * y1 - ay * ay * x1 * x1) / (ax * ax * y1 * y1 + ay * ay * x1 * x1)));
        const cx1 = sign * ratio * ((ax * y1) / ay);
        const cy1 = sign * ratio * (-(ay * x1) / ax);
        const angleOf = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const theta = angleOf(1, 0, (x1 - cx1) / ax, (y1 - cy1) / ay);
        let delta = angleOf((x1 - cx1) / ax, (y1 - cy1) / ay, (-x1 - cx1) / ax, (-y1 - cy1) / ay);
        if (!isSweep && delta > 0) delta -= TAU;
        if (isSweep && delta < 0) delta += TAU;
        const centreX = Math.cos(phi) * cx1 - Math.sin(phi) * cy1 + (x + nx) / 2;
        const centreY = Math.sin(phi) * cx1 + Math.cos(phi) * cy1 + (y + ny) / 2;
        const count = Math.max(4, Math.ceil((Math.abs(delta) * Math.max(ax, ay)) / 1.5));
        for (let k = 1; k <= count; k += 1) {
          const a = theta + (delta * k) / count;
          dense.push([centreX + ax * Math.cos(a) * Math.cos(phi) - ay * Math.sin(a) * Math.sin(phi), centreY + ax * Math.cos(a) * Math.sin(phi) + ay * Math.sin(a) * Math.cos(phi)]);
        }
        x = nx;
        y = ny;
      };
      while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) {
          command = tokens[i];
          i += 1;
        }
        const isRelative = command === command.toLowerCase();
        const ox = isRelative ? x : 0;
        const oy = isRelative ? y : 0;
        const kind = command.toUpperCase();
        if (kind === 'M') {
          resample(dense);
          x = next() + ox;
          y = next() + oy;
          startX = x;
          startY = y;
          dense = [[x, y]];
          command = isRelative ? 'l' : 'L';
        } else if (kind === 'L') {
          x = next() + ox;
          y = next() + oy;
          dense.push([x, y]);
        } else if (kind === 'H') {
          x = next() + ox;
          dense.push([x, y]);
        } else if (kind === 'V') {
          y = next() + oy;
          dense.push([x, y]);
        } else if (kind === 'C') {
          const x1 = next() + ox;
          const y1 = next() + oy;
          controlX = next() + ox;
          controlY = next() + oy;
          curve(x1, y1, controlX, controlY, next() + ox, next() + oy);
        } else if (kind === 'S') {
          const isSmooth = previous === 'C' || previous === 'S';
          const x1 = isSmooth ? 2 * x - controlX : x;
          const y1 = isSmooth ? 2 * y - controlY : y;
          controlX = next() + ox;
          controlY = next() + oy;
          curve(x1, y1, controlX, controlY, next() + ox, next() + oy);
        } else if (kind === 'Q' || kind === 'T') {
          const isSmooth = previous === 'Q' || previous === 'T';
          if (kind === 'Q') {
            controlX = next() + ox;
            controlY = next() + oy;
          } else {
            controlX = isSmooth ? 2 * x - controlX : x;
            controlY = isSmooth ? 2 * y - controlY : y;
          }
          const nx = next() + ox;
          const ny = next() + oy;
          curve(x + (2 / 3) * (controlX - x), y + (2 / 3) * (controlY - y), nx + (2 / 3) * (controlX - nx), ny + (2 / 3) * (controlY - ny), nx, ny);
        } else if (kind === 'A') {
          const rx = next();
          const ry = next();
          const angle = next();
          const isLarge = next() === 1;
          const isSweep = next() === 1;
          arc(rx, ry, angle, isLarge, isSweep, next() + ox, next() + oy);
        } else if (kind === 'Z') {
          x = startX;
          y = startY;
          dense.push([x, y]);
        } else {
          break;
        }
        previous = kind;
      }
      resample(dense);
    }
    const dash = (shape.getAttribute('stroke-dasharray') || '').split(/[ ,]+/).map(Number).filter((n) => n > 0);
    return lines.map((points) => ({ points, dash }));
  };

  // A drawing is read a few shapes at a time (a few milliseconds each, the page going on between
  // them), so that reading it never holds the page up.
  const drawings = new Map();
  const readDrawing = (url) => {
    if (!drawings.has(url)) {
      drawings.set(url, fetch(url).then((answer) => answer.text()).then((text) => new Promise((resolve) => {
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        const shapes = [...svg.querySelectorAll('path, circle, ellipse, line, polyline, polygon')];
        const lines = [];
        let index = 0;
        const work = () => {
          const until = performance.now() + 6;
          while (index < shapes.length && performance.now() < until) {
            lines.push(...sampleShape(shapes[index]));
            index += 1;
          }
          if (index < shapes.length) {
            window.setTimeout(work, 0);
          } else {
            resolve(lines);
          }
        };
        work();
      })));
    }
    return drawings.get(url);
  };
  const whenIdle = (task) => ('requestIdleCallback' in window ? window.requestIdleCallback(task, { timeout: 4000 }) : window.setTimeout(task, 1500));

  layers.forEach((layer) => {
    const head = layer.parentElement;
    const url = layer.querySelector('use')?.getAttribute('href')?.split('#')[0];
    if (!url) {
      return;
    }
    let lines = null;
    let placed = [];
    let canvas = null;
    let ctx = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let ink = '';
    let strength = 0.07;
    let frame = 0;
    let last = 0;
    let isLoading = false;
    // Around the part drawn again, the points taken with it (CSS pixels): more than the distance
    // between two points, so that every piece of line that crosses the part is drawn whole.
    let margin = 8;
    // The part of the canvas drawn at the last frame (device pixels), drawn again at the next one.
    let lastZone = null;
    // The pointer (in the page, read from the events; placed in the layer at each frame), and the
    // point that follows it a little late: the lines are pushed from there.
    const pointer = { clientX: 0, clientY: 0, x: 0, y: 0, on: 0, wanted: 0, movedAt: -9999 };
    const lag = { x: 0, y: 0, vx: 0, vy: 0 };
    // The push of this frame, worked out before drawing.
    let isActive = false;
    let drag = 0;

    // The colour and the strength of the lines: those the still drawing is painted with.
    const readInk = () => {
      if (!ink) {
        const style = getComputedStyle(layer);
        ink = style.color;
        strength = Number(style.opacity) || 0.07;
      }
    };

    // The lines placed in the layer (CSS pixels), with the box of each and, for the dashed ones, the
    // length run along the line at each point (where the dashes stand), from where the stylesheet puts
    // the drawing (the box of its SVG in the layer).
    const setup = () => {
      const box = layer.getBoundingClientRect();
      const drawn = layer.querySelector('svg').getBoundingClientRect();
      const scale = drawn.width / VIEW_W;
      const left = drawn.left - box.left;
      const top = drawn.top - box.top;
      width = box.width;
      height = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      margin = STEP * scale + 3;
      placed = lines.map(({ points, dash }) => {
        const xy = new Float32Array(points.length);
        const run = dash.length ? new Float32Array(points.length / 2) : null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < points.length; i += 2) {
          const px = left + points[i] * scale;
          const py = top + points[i + 1] * scale;
          xy[i] = px;
          xy[i + 1] = py;
          if (run && i) {
            run[i / 2] = run[i / 2 - 1] + Math.hypot(px - xy[i - 2], py - xy[i - 1]);
          }
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        return { xy, run, dash: dash.map((d) => d * scale), minX, minY, maxX, maxY };
      });
      lastZone = null;
    };

    const prepare = () => {
      isActive = pointer.on > 0.002;
      drag = Math.min(1, Math.hypot(lag.vx, lag.vy) / 900);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = strength;
    };

    // The points of a line from `from` to `to`, pushed away from the pointer and drawn a little along
    // its way, added to the path.
    const trace = (xy, from, to) => {
      for (let k = from; k <= to; k += 1) {
        let x = xy[k * 2];
        let y = xy[k * 2 + 1];
        if (isActive) {
          const dx = x - lag.x;
          const dy = y - lag.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < FAR * FAR) {
            const fall = Math.exp(-d2 / (REACH * REACH)) * pointer.on;
            const d = Math.sqrt(d2) || 1;
            x += (dx / d) * PUSH * fall + lag.vx * 0.03 * drag * fall;
            y += (dy / d) * PUSH * fall + lag.vy * 0.03 * drag * fall;
          }
        }
        if (k === from) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    };

    // The whole drawing (when the canvas takes the place of the still one, and after a resize).
    const drawAll = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      prepare();
      for (const line of placed) {
        ctx.setLineDash(line.dash);
        ctx.lineDashOffset = 0;
        ctx.beginPath();
        trace(line.xy, 0, line.xy.length / 2 - 1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    // A piece of a line: added to the path of the line, or stroked alone with the dashes of its place.
    const piece = (xy, run, from, to) => {
      if (run) {
        ctx.beginPath();
        ctx.lineDashOffset = run[from];
        trace(xy, from, to);
        ctx.stroke();
      } else {
        trace(xy, from, to);
      }
    };

    // In a box (CSS pixels, the margin included), the pieces of the lines that pass through it, each
    // with one more point on either side; a dashed piece keeps the dashes of its place on the line.
    const drawPieces = (left, top, right, bottom) => {
      prepare();
      for (const line of placed) {
        if (line.maxX < left || line.minX > right || line.maxY < top || line.minY > bottom) {
          continue;
        }
        const { xy, run } = line;
        const count = xy.length / 2;
        ctx.setLineDash(line.dash);
        ctx.beginPath();
        let from = -1;
        let lastIn = -1;
        for (let k = 0; k < count; k += 1) {
          const x = xy[k * 2];
          const y = xy[k * 2 + 1];
          const isIn = x >= left && x <= right && y >= top && y <= bottom;
          if (isIn) {
            if (from < 0) {
              from = Math.max(0, k - 1);
            }
            lastIn = k;
          } else if (from >= 0 && k - lastIn > 3) {
            piece(xy, run, from, lastIn + 1);
            from = -1;
          }
        }
        if (from >= 0) {
          piece(xy, run, from, Math.min(count - 1, lastIn + 1));
        }
        if (!run) {
          ctx.stroke();
        }
      }
    };

    // The part around the pointer (and the part drawn at the last frame, put back), cleared and
    // drawn again: elsewhere the lines are where they were. A box in whole device pixels.
    const drawZone = () => {
      let left = canvas.width;
      let top = canvas.height;
      let right = 0;
      let bottom = 0;
      if (lastZone) {
        [left, top, right, bottom] = lastZone;
      }
      lastZone = null;
      if (isActive) {
        const speed = Math.hypot(lag.vx, lag.vy);
        const reach = FAR + PUSH + 0.03 * speed * Math.min(1, speed / 900) + 2;
        const zone = [
          Math.max(0, Math.floor((lag.x - reach) * dpr)),
          Math.max(0, Math.floor((lag.y - reach) * dpr)),
          Math.min(canvas.width, Math.ceil((lag.x + reach) * dpr)),
          Math.min(canvas.height, Math.ceil((lag.y + reach) * dpr)),
        ];
        if (zone[2] > zone[0] && zone[3] > zone[1]) {
          lastZone = zone;
          left = Math.min(left, zone[0]);
          top = Math.min(top, zone[1]);
          right = Math.max(right, zone[2]);
          bottom = Math.max(bottom, zone[3]);
        }
      }
      if (right <= left || bottom <= top) {
        return;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      ctx.clearRect(left, top, right - left, bottom - top);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPieces(left / dpr - margin, top / dpr - margin, right / dpr + margin, bottom / dpr + margin);
      ctx.restore();
    };

    const render = (now) => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      // The pointer in the layer, from the box of the layer read once a frame (it moves with the
      // scroll and the drift of the head).
      const box = layer.getBoundingClientRect();
      pointer.x = pointer.clientX - box.left;
      pointer.y = pointer.clientY - box.top;
      pointer.on += (pointer.wanted - pointer.on) * (1 - Math.exp(-dt * 6));
      // A critically damped spring: the follower trails the pointer without overshooting.
      const k = 90;
      lag.vx += ((pointer.x - lag.x) * k - lag.vx * 2 * Math.sqrt(k)) * dt;
      lag.vy += ((pointer.y - lag.y) * k - lag.vy * 2 * Math.sqrt(k)) * dt;
      lag.x += lag.vx * dt;
      lag.y += lag.vy * dt;
      isActive = pointer.on > 0.002;
      drawZone();
      const isMoving = Math.abs(pointer.wanted - pointer.on) > 0.002 || Math.hypot(lag.vx, lag.vy) > 2 || now - pointer.movedAt < 300;
      if (isMoving) {
        frame = window.requestAnimationFrame(render);
      }
    };
    const wake = () => {
      if (!frame && placed.length) {
        last = performance.now();
        frame = window.requestAnimationFrame(render);
      }
    };

    // At the first move of the pointer over the head, the canvas takes the place of the still
    // drawing, drawn exactly the same; the drawing has been read at rest by then (see below).
    const start = async () => {
      if (canvas || isLoading) {
        return;
      }
      isLoading = true;
      try {
        lines = await readDrawing(url);
      } catch (error) {
        return;
      }
      readInk();
      canvas = document.createElement('canvas');
      canvas.className = 'drawing__live';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
      layer.append(canvas);
      setup();
      const box = layer.getBoundingClientRect();
      lag.x = pointer.clientX - box.left;
      lag.y = pointer.clientY - box.top;
      drawAll();
      layer.classList.add('is-live');
      wake();
    };

    head.addEventListener('pointermove', (event) => {
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      pointer.wanted = 1;
      pointer.movedAt = performance.now();
      start();
      wake();
    });
    head.addEventListener('pointerleave', () => {
      pointer.wanted = 0;
      wake();
    });
    // The drawing and its colour are read once the page is at rest, so that the first move of the
    // pointer finds them.
    whenIdle(() => {
      readInk();
      readDrawing(url).catch(() => {});
    });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (canvas) {
          setup();
          drawAll();
        }
      }, 200);
    });
  });
})();
