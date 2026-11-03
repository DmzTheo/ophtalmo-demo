// Living layers over the drawing of a few page heads, drawn in fine lines on a canvas behind the
// title. They draw themselves on arrival (a few seconds), then move only when the pointer passes
// over the head of the page, and come back to rest. With reduced motion, they stay still.
//   floaters  detachment: floaters that follow the gaze late, overshoot, drift back;
//   amsler    AMD: the Amsler chart, whose lines wave a little and grey where one looks;
//   mosaic    pathologies: the cells of the retina, lit by the pointer, with an afterimage.
(() => {
  const hosts = [...document.querySelectorAll('[data-living]')];
  if (!hosts.length) {
    return;
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  // (Drawn by the processor in Firefox, as the other 2D canvases of the site: see stars.js.)
  const isGecko = window.CSS?.supports?.('-moz-appearance: none') === true || /\bFirefox\//.test(navigator.userAgent);
  const canvasOptions = isGecko ? { willReadFrequently: true } : undefined;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
  const TAU = Math.PI * 2;

  // A pseudo-random generator, so a scene is the same at every visit.
  const seeded = (seed) => {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };

  // A spring toward a target, a little underdamped: it lags, overshoots and settles.
  const spring = (body, tx, ty, dt, stiffness = 26, damping = 5.5) => {
    body.vx += (tx - body.x) * stiffness * dt;
    body.vy += (ty - body.y) * stiffness * dt;
    const keep = Math.exp(-damping * dt);
    body.vx *= keep;
    body.vy *= keep;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    return Math.abs(body.vx) + Math.abs(body.vy) > 0.6 || Math.hypot(tx - body.x, ty - body.y) > 0.4;
  };

  // ---------- Detachment: floaters ----------
  function floaters({ width, height, rand }) {
    const items = [];
    const count = Math.round(clamp(width / 75, 9, 20));
    for (let i = 0; i < count; i += 1) {
      const depth = 0.35 + rand() * 0.9;
      const rest = { x: width * (0.46 + rand() * 0.5), y: height * (0.12 + rand() * 0.8) };
      const kind = rand() < 0.4 ? 'ring' : rand() < 0.7 ? 'thread' : 'dots';
      items.push({ kind, depth, rest, x: rest.x, y: rest.y + 60 * depth, vx: 0, vy: 0, size: 7 + depth * 16, seed: rand(), turn: rand() * TAU });
    }
    return {
      intro: 3,
      draw(ctx, { dt, pointer, intro, ink }) {
        let isBusy = false;
        const gazeX = (pointer.x - width * 0.62) * pointer.on;
        const gazeY = (pointer.y - height * 0.5) * pointer.on;
        items.forEach((f) => {
          const tx = f.rest.x + gazeX * 0.2 * f.depth;
          const ty = f.rest.y + gazeY * 0.2 * f.depth + (1 - easeOut(intro)) * 70 * f.depth;
          isBusy = spring(f, tx, ty, dt, 16 / f.depth, 3.6) || isBusy;
          ctx.globalAlpha = (0.16 + 0.24 * (1.25 - f.depth)) * easeOut(intro * 1.4);
          ctx.strokeStyle = ink;
          ctx.fillStyle = ink;
          ctx.lineWidth = 1 + f.depth * 0.6;
          const s = f.size;
          if (f.kind === 'ring') {
            ctx.beginPath();
            ctx.arc(f.x, f.y, s * 0.5, 0, TAU);
            ctx.stroke();
            ctx.globalAlpha *= 0.5;
            ctx.beginPath();
            ctx.arc(f.x, f.y, s * 0.3, 0, TAU);
            ctx.stroke();
          } else if (f.kind === 'thread') {
            const c = Math.cos(f.turn);
            const sn = Math.sin(f.turn);
            const at = (u, v) => [f.x + (u * c - v * sn) * s, f.y + (u * sn + v * c) * s];
            ctx.beginPath();
            ctx.moveTo(...at(-1.4, 0));
            ctx.bezierCurveTo(...at(-0.6, -0.9 + f.seed), ...at(0.3, 0.9 - f.seed), ...at(1.4, 0.2));
            ctx.stroke();
          } else {
            [[0, 0], [0.5, 0.3], [-0.3, 0.6], [0.2, -0.5]].forEach(([u, v], k) => {
              ctx.beginPath();
              ctx.arc(f.x + u * s, f.y + v * s, 1.6 + k * 0.5, 0, TAU);
              ctx.fill();
            });
          }
        });
        return isBusy;
      },
    };
  }

  // ---------- AMD: the Amsler chart ----------
  // Where the pointer goes, a few squares wave and a light grey patch shows, as for an eye whose
  // macula is touched; the effect stays small, for the head of a page.
  // (Once the chart has come in, only the part around the pointer, and the part drawn there at the
  // last frame, is cleared and drawn again: elsewhere the lines do not move.)
  function amsler({ width, height }) {
    const side = Math.min(height * 0.78, width * 0.34);
    const cx = width - side / 2 - Math.max(24, width * 0.06);
    const cy = height / 2;
    const lines = 20;
    const cell = side / lines;
    const reach = cell * 2;
    const half = side / 2;
    const points = lines * 3;
    const step = side / points;
    // Beyond three reaches from the pointer the lines no longer wave (by a thousandth of a pixel).
    const zoneReach = reach * 3 + cell * 0.25 + 4;
    let isWhole = true;
    let lastZone = null;
    const zoneAt = (pointer) => [pointer.x - zoneReach, pointer.y - zoneReach, pointer.x + zoneReach, pointer.y + zoneReach];

    // The chart, or the part of it in a box: the lines (each with the points that pass through the
    // box, and two more on either side), the frame, the centre and the grey patch.
    const paint = (ctx, pointer, on, intro, ink, box) => {
      const warp = (x, y) => {
        const d = Math.exp(-((x - pointer.x) ** 2 + (y - pointer.y) ** 2) / (reach * reach)) * on;
        return [x + Math.sin(((y - pointer.y) / cell) * 2.4) * cell * 0.2 * d, y + Math.sin(((x - pointer.x) / cell) * 2.4) * cell * 0.2 * d];
      };
      const shown = easeOut(intro) * half * 1.5;
      const slack = cell * 0.25 + 2;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      for (let i = 0; i <= lines; i += 1) {
        const offset = -half + i * cell;
        const isMid = i === lines / 2;
        ctx.globalAlpha = (isMid ? 0.28 : 0.15) * clamp((shown - Math.abs(offset)) / cell, 0, 1);
        if (ctx.globalAlpha <= 0) {
          continue;
        }
        for (let axis = 0; axis <= 1; axis += 1) {
          let from = 0;
          let to = points;
          if (box) {
            const across = axis ? cx + offset : cy + offset;
            const isOutside = axis ? across < box[0] - slack || across > box[2] + slack : across < box[1] - slack || across > box[3] + slack;
            if (isOutside) {
              continue;
            }
            const start = axis ? cy - half : cx - half;
            from = Math.max(0, Math.floor(((axis ? box[1] : box[0]) - start) / step) - 2);
            to = Math.min(points, Math.ceil(((axis ? box[3] : box[2]) - start) / step) + 2);
            if (from >= to) {
              continue;
            }
          }
          ctx.beginPath();
          for (let j = from; j <= to; j += 1) {
            const along = -half + (j * side) / points;
            const p = axis ? warp(cx + offset, cy + along) : warp(cx + along, cy + offset);
            if (j === from) {
              ctx.moveTo(p[0], p[1]);
            } else {
              ctx.lineTo(p[0], p[1]);
            }
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.45 * easeOut(intro);
      ctx.strokeRect(cx - half, cy - half, side, side);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, TAU);
      ctx.fill();
      // Where one looks, a light grey patch: the lines there are harder to see.
      if (on > 0.01) {
        const patch = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, reach * 0.7);
        patch.addColorStop(0, 'rgba(150, 150, 150, 0.2)');
        patch.addColorStop(1, 'rgba(150, 150, 150, 0)');
        ctx.globalAlpha = on;
        ctx.fillStyle = patch;
        ctx.fillRect(pointer.x - reach, pointer.y - reach, reach * 2, reach * 2);
      }
    };

    return {
      intro: 2.4,
      clears: true,
      draw(ctx, { pointer, intro, ink, dpr }) {
        const near = Math.hypot(clamp(pointer.x, cx - half, cx + half) - pointer.x, clamp(pointer.y, cy - half, cy + half) - pointer.y) < cell * 2;
        const on = near ? pointer.on : 0;
        const zone = on > 0.001 ? zoneAt(pointer) : null;
        // (The box on whole pixels of the screen, so that its edges are cleared and drawn cleanly.)
        const down = (value) => Math.floor(value * dpr) / dpr;
        const up = (value) => Math.ceil(value * dpr) / dpr;
        if (isWhole || intro < 1) {
          isWhole = false;
          lastZone = zone;
          ctx.clearRect(0, 0, width, height);
          paint(ctx, pointer, on, intro, ink, null);
          return false;
        }
        const parts = [zone, lastZone].filter(Boolean);
        lastZone = zone;
        if (!parts.length) {
          return false;
        }
        const box = [
          down(Math.min(...parts.map((part) => part[0]))),
          down(Math.min(...parts.map((part) => part[1]))),
          up(Math.max(...parts.map((part) => part[2]))),
          up(Math.max(...parts.map((part) => part[3]))),
        ];
        ctx.save();
        ctx.beginPath();
        ctx.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
        ctx.clip();
        ctx.clearRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
        paint(ctx, pointer, on, intro, ink, box);
        ctx.restore();
        return false;
      },
    };
  }

  // ---------- Pathologies: the mosaic of the cells of the retina ----------
  function mosaic({ width, height }) {
    const centre = [width * 0.78, height * 0.52];
    const cells = [];
    const reachMax = Math.hypot(width * 0.6, height * 0.7);
    for (let n = 1; n < 2200; n += 1) {
      const r = 4.2 * n ** 0.62;
      if (r > reachMax) {
        break;
      }
      const a = n * 2.39996;
      const x = centre[0] + Math.cos(a) * r;
      const y = centre[1] + Math.sin(a) * r;
      if (x < width * 0.36 || x > width + 6 || y < -6 || y > height + 6) {
        continue;
      }
      cells.push({ x, y, size: 1 + r / 260, glow: 0, shown: -1 });
    }
    // (The cells never touch: once they have all come in, only those whose light changed are
    // cleared and drawn again, and nothing is drawn while none changes, the pointer resting.)
    let isWhole = true;
    return {
      intro: 2.6,
      clears: true,
      draw(ctx, { dt, pointer, intro, ink }) {
        const reach = 70;
        // On arrival, a band of light crosses the retina once, from the left.
        const sweep = intro < 1 ? width * (0.3 + intro * 0.8) : -9999;
        const fadeIn = Math.min(1, intro * 3);
        const keep = Math.exp(-dt * 1.4);
        const isAll = isWhole || fadeIn < 1;
        isWhole = false;
        if (isAll) {
          ctx.clearRect(0, 0, width, height);
        }
        let isBusy = false;
        ctx.fillStyle = ink;
        for (const c of cells) {
          const lit = Math.max(
            pointer.on * Math.exp(-((c.x - pointer.x) ** 2 + (c.y - pointer.y) ** 2) / (reach * reach)),
            Math.exp(-((c.x - sweep) ** 2) / 900) * 0.8,
          );
          // The light is kept a moment, then fades: the afterimage.
          const glow = Math.max(lit, c.glow * keep);
          c.glow = glow < 0.01 ? 0 : glow;
          if (c.glow > lit) {
            isBusy = true;
          }
          if (!isAll && Math.abs(c.glow - c.shown) < 0.003) {
            continue;
          }
          if (!isAll) {
            const r = c.size * 1.8 + 1.5;
            ctx.clearRect(c.x - r, c.y - r, r * 2, r * 2);
          }
          c.shown = c.glow;
          ctx.globalAlpha = (0.16 + 0.64 * c.glow) * fadeIn;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.size * (1 + c.glow * 0.8), 0, TAU);
          ctx.fill();
        }
        return isBusy;
      },
    };
  }

  const SCENES = { floaters, amsler, mosaic };

  hosts.forEach((canvas) => {
    const make = SCENES[canvas.dataset.living];
    const ctx = canvas.getContext('2d', canvasOptions);
    if (!make || !ctx) {
      return;
    }
    const area = canvas.closest('section') || canvas.parentElement;
    // (Read when the scene is made, not when the page starts.)
    let ink = '';
    // The pointer: where it is on the screen (from the events), and in the canvas (worked out at
    // each frame, from the box of the canvas read once a frame).
    const pointer = { clientX: 0, clientY: 0, hasMoved: false, x: -9999, y: -9999, on: 0, wanted: 0, movedAt: -9999 };
    let scene = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let last = 0;
    let startedAt = 0;
    let isVisible = false;

    const render = (now) => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const t = (now - startedAt) / 1000;
      const intro = reduceMotion.matches ? 1 : clamp(t / scene.intro, 0, 1);
      pointer.on += (pointer.wanted - pointer.on) * (1 - Math.exp(-dt * 5));
      if (pointer.hasMoved) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = pointer.clientX - rect.left;
        pointer.y = pointer.clientY - rect.top;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!scene.clears) {
        ctx.clearRect(0, 0, width, height);
      }
      ctx.globalAlpha = 1;
      const isBusy = scene.draw(ctx, { t, dt, pointer, intro, ink, dpr });
      // Drawn again while something moves: the arrival, a spring, a fading light, or a pointer that
      // moved a moment ago. A pointer resting still lets the scene rest too.
      const hasPointerMoved = now - pointer.movedAt < 1200;
      const isMoving = intro < 1 || isBusy || Math.abs(pointer.wanted - pointer.on) > 0.005 || hasPointerMoved;
      if (isMoving && isVisible && !document.hidden && !reduceMotion.matches) {
        frame = window.requestAnimationFrame(render);
      }
    };
    const wake = () => {
      if (!frame && isVisible && scene) {
        last = performance.now();
        frame = window.requestAnimationFrame(render);
      }
    };
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ink = ink || getComputedStyle(canvas).getPropertyValue('--living-ink').trim() || '#1d4fa3';
      scene = make({ width, height, rand: seeded(Number(canvas.dataset.livingSeed) || 11) });
      resizeWidth = window.innerWidth;
      wake();
    };

    // Starts once on screen: the scene draws itself, then waits for the pointer.
    new ViewWatcher(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible && !scene) {
        startedAt = performance.now();
        setup();
        canvas.classList.add('is-live');
      }
      wake();
    }).observe(canvas);

    if (finePointer.matches && !reduceMotion.matches) {
      area.addEventListener('pointermove', (event) => {
        pointer.clientX = event.clientX;
        pointer.clientY = event.clientY;
        pointer.hasMoved = true;
        pointer.wanted = 1;
        pointer.movedAt = performance.now();
        wake();
      });
      area.addEventListener('pointerleave', () => {
        pointer.wanted = 0;
        wake();
      });
    }
    // (On a phone, only a new width rebuilds: its bar of address folding away as the page scrolls
    // changes the height of the window alone, not the size of the head.)
    let resizeTimer = 0;
    let resizeWidth = 0;
    window.addEventListener('resize', () => {
      if (window.innerWidth === resizeWidth && !finePointer.matches) {
        return;
      }
      resizeWidth = window.innerWidth;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (scene) {
          setup();
        }
      }, 200);
    });
    document.addEventListener('visibilitychange', wake);
  });
})();
