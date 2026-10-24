// The drawing of the head of a page answers the pointer: where the pointer passes, its lines part
// like threads under a finger, are drawn a little along with it, and close again behind it. It is
// the same drawing as the still one (an SVG of assets/images/drawings, placed by the stylesheet):
// at the first move of the pointer it is read, cut into lines of points and drawn on a canvas in the
// same place, and the still one gives way to it. Mouse only; nothing with reduced motion.
(() => {
  const layers = [...document.querySelectorAll('.page-head > .drawing--page, .glasses-hero > .drawing--page, .site-footer > .drawing')];
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!layers.length || !finePointer.matches || reduceMotion.matches || !window.DOMParser) {
    return;
  }
  const VIEW_W = 1600;
  const VIEW_H = 1000;
  const STEP = 5;
  const REACH = 85;
  const PUSH = 18;

  // The drawing as lines of points, in drawing units: each shape sampled every STEP, cut where the
  // path jumps (a path may have several pieces); with its dashes if it has some.
  const readDrawing = async (url) => {
    const text = await (await fetch(url)).text();
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    probe.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
    probe.append(...[...svg.childNodes].map((node) => document.importNode(node, true)));
    document.body.append(probe);
    const lines = [];
    probe.querySelectorAll('path, circle, ellipse, line, polyline, polygon').forEach((shape) => {
      const length = shape.getTotalLength();
      const dash = (shape.getAttribute('stroke-dasharray') || '').split(/[ ,]+/).map(Number).filter((n) => n > 0);
      let points = [];
      let previous = null;
      for (let at = 0; at <= length + 0.01; at += STEP) {
        const p = shape.getPointAtLength(Math.min(at, length));
        if (previous && Math.hypot(p.x - previous.x, p.y - previous.y) > STEP * 3) {
          if (points.length > 1) lines.push({ points, dash });
          points = [];
        }
        points.push([p.x, p.y]);
        previous = p;
      }
      if (points.length > 1) lines.push({ points, dash });
    });
    probe.remove();
    return lines;
  };

  // Where the stylesheet puts the drawing: its size ("cover" or "auto N%") and position ("X% Y%").
  const placement = (layer, width, height) => {
    const style = getComputedStyle(layer);
    const size = (style.maskSize || style.webkitMaskSize || 'cover').split(',')[0].trim();
    const position = (style.maskPosition || style.webkitMaskPosition || '50% 50%').split(',')[0].trim().split(/\s+/);
    let scale = Math.max(width / VIEW_W, height / VIEW_H);
    const auto = /^auto\s+([\d.]+)%$/.exec(size);
    if (auto) {
      scale = ((height * Number(auto[1])) / 100) / VIEW_H;
    }
    const w = VIEW_W * scale;
    const h = VIEW_H * scale;
    const fraction = (value) => (value && value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : 0.5);
    return { scale, left: (width - w) * fraction(position[0]), top: (height - h) * fraction(position[1] || position[0]) };
  };

  layers.forEach((layer) => {
    const head = layer.parentElement;
    const url = (getComputedStyle(layer).maskImage || getComputedStyle(layer).webkitMaskImage || '').match(/url\("?([^")]+)"?\)/)?.[1];
    if (!url) {
      return;
    }
    // The colour and the strength of the lines: those the still drawing is painted with.
    const ink = getComputedStyle(layer).backgroundColor;
    const strength = Number(getComputedStyle(layer).opacity) || 0.07;
    let lines = null;
    let canvas = null;
    let ctx = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let place = null;
    let frame = 0;
    let last = 0;
    let isLoading = false;
    // The pointer, and the point that follows it a little late: the lines are pushed from there.
    const pointer = { x: 0, y: 0, on: 0, wanted: 0, movedAt: -9999 };
    const lag = { x: 0, y: 0, vx: 0, vy: 0 };

    const setup = () => {
      const rect = layer.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      place = placement(layer, width, height);
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const { scale, left, top } = place;
      const isActive = pointer.on > 0.002;
      const speed = Math.hypot(lag.vx, lag.vy);
      const drag = Math.min(1, speed / 900);
      lines.forEach(({ points, dash }) => {
        ctx.setLineDash(dash.length ? dash.map((d) => d * scale) : []);
        // Each point, pushed away from the pointer and drawn a little along its way.
        const placed = points.map(([u, v]) => {
          let x = left + u * scale;
          let y = top + v * scale;
          let fall = 0;
          if (isActive) {
            const dx = x - lag.x;
            const dy = y - lag.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < REACH * REACH * 9) {
              fall = Math.exp(-d2 / (REACH * REACH)) * pointer.on;
              const d = Math.sqrt(d2) || 1;
              x += (dx / d) * PUSH * fall + lag.vx * 0.03 * drag * fall;
              y += (dy / d) * PUSH * fall + lag.vy * 0.03 * drag * fall;
            }
          }
          return [x, y];
        });
        ctx.globalAlpha = strength;
        ctx.beginPath();
        placed.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };

    const render = (now) => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      pointer.on += (pointer.wanted - pointer.on) * (1 - Math.exp(-dt * 6));
      // A critically damped spring: the follower trails the pointer without overshooting.
      const k = 90;
      lag.vx += ((pointer.x - lag.x) * k - lag.vx * 2 * Math.sqrt(k)) * dt;
      lag.vy += ((pointer.y - lag.y) * k - lag.vy * 2 * Math.sqrt(k)) * dt;
      lag.x += lag.vx * dt;
      lag.y += lag.vy * dt;
      draw();
      const isMoving = Math.abs(pointer.wanted - pointer.on) > 0.002 || Math.hypot(lag.vx, lag.vy) > 2 || now - pointer.movedAt < 300;
      if (isMoving) {
        frame = window.requestAnimationFrame(render);
      }
    };
    const wake = () => {
      if (!frame && lines) {
        last = performance.now();
        frame = window.requestAnimationFrame(render);
      }
    };

    // Made at the first move of the pointer over the head: the drawing is read, then the canvas
    // takes the place of the still drawing, drawn exactly the same.
    const start = async () => {
      if (lines || isLoading) {
        return;
      }
      isLoading = true;
      try {
        lines = await readDrawing(url);
      } catch (error) {
        return;
      }
      canvas = document.createElement('canvas');
      canvas.className = 'drawing__live';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
      layer.append(canvas);
      setup();
      lag.x = pointer.x;
      lag.y = pointer.y;
      draw();
      layer.classList.add('is-live');
      wake();
    };

    head.addEventListener('pointermove', (event) => {
      const rect = layer.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.wanted = 1;
      pointer.movedAt = performance.now();
      start();
      wake();
    });
    head.addEventListener('pointerleave', () => {
      pointer.wanted = 0;
      wake();
    });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (canvas) {
          setup();
          draw();
        }
      }, 200);
    });
  });
})();
