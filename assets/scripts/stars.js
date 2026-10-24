// Stars that light up where the pointer passes, like the dust floating in the light of the slit
// lamp on the home page: tiny points that twinkle, drift a little and flee the pointer, lit in a
// soft circle of light around it, then fading behind it. Any element with data-stars gets them;
// their colour is --stars-ink (warm white on dark grounds, the colour of the page on the paper).
// Nothing is drawn at rest: the canvas is made when the pointer first comes over the element,
// covers only the part of it on screen, and is freed when the element leaves the screen.
// Mouse only; nothing with reduced motion.
(() => {
  const hosts = [...document.querySelectorAll('[data-stars]')];
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!hosts.length || !finePointer.matches || reduceMotion.matches) {
    return;
  }
  const TAU = Math.PI * 2;
  const CELL = 34;
  const REACH = 150;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const seeded = (seed) => {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };

  // A soft disc, drawn once, for the few large stars out of focus.
  const soft = document.createElement('canvas');
  soft.width = 64;
  soft.height = 64;
  const softCtx = soft.getContext('2d');
  const softGradient = softCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  softGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  softGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  softCtx.fillStyle = softGradient;
  softCtx.fillRect(0, 0, 64, 64);

  hosts.forEach((host, hostIndex) => {
    let canvas = null;
    let ctx = null;
    let tinted = null;
    let stars = [];
    let buckets = new Map();
    let width = 0;
    let height = 0;
    let ink = '#1d4fa3';
    let frame = 0;
    let last = 0;
    const startedAt = performance.now();
    const lit = new Set();
    const pointer = { x: 0, y: 0, inside: false, on: 0, movedAt: -9999 };

    const bucketOf = (x, y) => `${Math.floor(x / REACH)},${Math.floor(y / REACH)}`;
    // The stars: about one cell in two holds one, mostly tiny, a few larger, very few out of focus.
    const build = () => {
      const rect = host.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const rand = seeded(29 + hostIndex * 7);
      stars = [];
      for (let y = 0; y < height; y += CELL) {
        for (let x = 0; x < width; x += CELL) {
          if (rand() < 0.45) continue;
          const kind = rand();
          stars.push({
            x: x + rand() * CELL,
            y: y + rand() * CELL,
            size: kind < 0.86 ? 0.7 + rand() * 0.8 : kind < 0.97 ? 1.6 + rand() * 0.8 : 5 + rand() * 4,
            isSoft: kind >= 0.97,
            depth: 0.3 + rand() * 0.7,
            a: rand(),
            b: rand(),
            glow: 0,
          });
        }
      }
      buckets = new Map();
      stars.forEach((star) => {
        const key = bucketOf(star.x, star.y);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(star);
      });
      ink = getComputedStyle(host).getPropertyValue('--stars-ink').trim() || ink;
      // The soft disc in the colour of the stars.
      tinted = document.createElement('canvas');
      tinted.width = 64;
      tinted.height = 64;
      const t = tinted.getContext('2d');
      t.drawImage(soft, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = ink;
      t.fillRect(0, 0, 64, 64);
    };
    const ensureCanvas = () => {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'stars';
        canvas.setAttribute('aria-hidden', 'true');
        host.prepend(canvas);
        ctx = canvas.getContext('2d');
        build();
      }
      const w = Math.round(width);
      const h = Math.round(Math.min(height, window.innerHeight + 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.height = `${h}px`;
      }
    };
    const release = () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      lit.forEach((star) => {
        star.glow = 0;
      });
      lit.clear();
    };

    const render = (now) => {
      frame = 0;
      if (!canvas) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const t = (now - startedAt) / 1000;
      pointer.on += ((pointer.inside ? 1 : 0) - pointer.on) * (1 - Math.exp(-dt * 6));
      const rect = host.getBoundingClientRect();
      const top = clamp(-rect.top, 0, Math.max(0, height - canvas.height));
      canvas.style.transform = `translateY(${top.toFixed(1)}px)`;
      const px = pointer.x - rect.left;
      const py = pointer.y - rect.top;
      // The stars in the light around the pointer brighten...
      if (pointer.inside) {
        const bx = Math.floor(px / REACH);
        const by = Math.floor(py / REACH);
        for (let i = bx - 1; i <= bx + 1; i += 1) {
          for (let j = by - 1; j <= by + 1; j += 1) {
            (buckets.get(`${i},${j}`) || []).forEach((star) => {
              const light = Math.exp(-((star.x - px) ** 2 + (star.y - py) ** 2) / (REACH * REACH * 0.5));
              if (light > star.glow) {
                star.glow += (light - star.glow) * Math.min(1, dt * 10);
                lit.add(star);
              }
            });
          }
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // ...twinkle, drift a little, flee the pointer, and fade once it has gone.
      ctx.fillStyle = ink;
      lit.forEach((star) => {
        const d = Math.hypot(star.x - px, star.y - py);
        const isNear = pointer.inside && d < REACH * 1.4;
        if (!isNear) {
          star.glow *= Math.exp(-dt * 2.2);
        }
        if (star.glow < 0.015) {
          star.glow = 0;
          lit.delete(star);
          return;
        }
        const driftX = Math.sin(t * 0.6 + star.a * TAU) * 5 * star.depth;
        const driftY = Math.cos(t * 0.5 + star.b * TAU) * 5 * star.depth;
        const push = pointer.inside ? Math.exp(-(d * d) / (70 * 70)) * 26 * star.depth : 0;
        const away = d || 1;
        const x = star.x + driftX + ((star.x - px) / away) * push;
        const y = star.y + driftY + ((star.y - py) / away) * push - top;
        if (y < -12 || y > canvas.height + 12) return;
        const twinkle = 0.55 + 0.45 * Math.sin(t * (1.3 + star.a * 2) + star.b * 40);
        const alpha = Math.min(1, star.glow * twinkle);
        if (star.isSoft) {
          ctx.globalAlpha = alpha * 0.35;
          ctx.drawImage(tinted, x - star.size, y - star.size, star.size * 2, star.size * 2);
        } else {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(x, y, star.size, 0, TAU);
          ctx.fill();
          // The brightest ones show four small rays.
          if (star.size > 1.5 && alpha > 0.5) {
            ctx.globalAlpha = (alpha - 0.5) * 0.9;
            ctx.fillRect(x - star.size * 3, y - 0.35, star.size * 6, 0.7);
            ctx.fillRect(x - 0.35, y - star.size * 3, 0.7, star.size * 6);
          }
        }
      });
      if (lit.size || pointer.on > 0.01 || now - pointer.movedAt < 300) {
        frame = window.requestAnimationFrame(render);
      }
    };
    const wake = () => {
      if (!frame) {
        last = performance.now();
        frame = window.requestAnimationFrame(render);
      }
    };

    host.addEventListener('pointermove', (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
      pointer.movedAt = performance.now();
      ensureCanvas();
      wake();
    });
    host.addEventListener('pointerleave', () => {
      pointer.inside = false;
      wake();
    });
    window.addEventListener('scroll', () => {
      if (pointer.inside && canvas) {
        pointer.movedAt = performance.now();
        wake();
      }
    }, { passive: true });
    new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        pointer.inside = false;
        release();
      }
    }).observe(host);
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (canvas) {
          release();
          build();
        }
      }, 200);
    });
  });
})();
