// Ophta Miramas La Crau — interactions (v3 "Mise au point").
// No dependency. Every effect respects prefers-reduced-motion and degrades to plain content.
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

  // ---------- Text size ----------
  const TEXT_SIZE_KEY = 'ophta-text-size';
  // Distinct hook: <html> itself carries data-text-size once the text is enlarged.
  const textSizeButtons = [...document.querySelectorAll('[data-text-size-toggle]')];

  const applyTextSize = (level) => {
    const isDefault = level === '0';
    if (isDefault) {
      delete root.dataset.textSize;
    } else {
      root.dataset.textSize = level;
    }
    const isLargest = level === '2';
    const label = isLargest ? 'Revenir à la taille de texte normale' : 'Agrandir le texte';
    textSizeButtons.forEach((button) => {
      button.setAttribute('aria-label', label);
      const plus = button.querySelector('.text-size__plus');
      if (plus) {
        plus.textContent = isLargest ? '−' : '+';
      }
      const rollText = button.querySelector('.roll__text');
      if (rollText) {
        rollText.textContent = label;
      }
      const glyph = button.querySelector('.text-size__glyph');
      if (glyph) {
        glyph.textContent = isLargest ? 'A−' : 'A+';
      }
    });
  };

  applyTextSize(root.dataset.textSize || '0');
  textSizeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const current = Number(root.dataset.textSize || 0);
      const next = String((current + 1) % 3);
      applyTextSize(next);
      try {
        localStorage.setItem(TEXT_SIZE_KEY, next);
      } catch (error) {
        // Storage unavailable (private browsing): the setting applies to this page only.
      }
      window.dispatchEvent(new Event('resize'));
    });
  });

  // ---------- The eye of the logo blinks once, on the first page of a visit ----------
  const BLINK_KEY = 'ophta-blinked';
  try {
    const hasBlinked = sessionStorage.getItem(BLINK_KEY) === '1';
    const mark = document.querySelector('.site-header .brand__mark');
    if (!hasBlinked && mark && !reduceMotion.matches) {
      sessionStorage.setItem(BLINK_KEY, '1');
      window.setTimeout(() => mark.animate([
        { transform: 'scaleY(1)' },
        { transform: 'scaleY(0.08)', offset: 0.4 },
        { transform: 'scaleY(0.08)', offset: 0.6 },
        { transform: 'scaleY(1)' },
      ], { duration: 500, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }), 1400);
    }
  } catch (error) {
    // Storage unavailable (private browsing): no blink rather than one on every page.
  }

  // ---------- Dropdowns ----------
  const dropdowns = [...document.querySelectorAll('[data-dropdown]')];

  const closeDropdown = (dropdown) => {
    dropdown.querySelector('[data-dropdown-toggle]').setAttribute('aria-expanded', 'false');
    dropdown.querySelector('.dropdown__menu').hidden = true;
  };

  dropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector('[data-dropdown-toggle]');
    const panel = dropdown.querySelector('.dropdown__menu');
    toggle.addEventListener('click', () => {
      const willOpen = panel.hidden;
      dropdowns.forEach(closeDropdown);
      if (willOpen) {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });

  document.addEventListener('click', (event) => {
    dropdowns.filter((dropdown) => !dropdown.contains(event.target)).forEach(closeDropdown);
  });

  // ---------- Full-screen menu ----------
  const header = document.querySelector('[data-header]');
  // A header hidden by the scroll comes back as soon as one of its controls takes the keyboard focus.
  header?.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  const menu = document.querySelector('[data-menu]');
  const menuToggle = document.querySelector('[data-menu-toggle]');

  const setMenuOpen = (isOpen) => {
    menu.classList.toggle('is-open', isOpen);
    root.classList.toggle('is-menu-open', isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.querySelector('.menu-toggle__label').textContent = isOpen ? 'Fermer' : 'Menu';
    document.querySelectorAll('main, .site-footer').forEach((region) => {
      region.inert = isOpen;
    });
    header.classList.remove('is-hidden');
    dropdowns.forEach(closeDropdown);
    if (isOpen) {
      window.setTimeout(() => menu.querySelector('.menu-link')?.focus({ preventScroll: true }), 320);
    }
  };

  menuToggle?.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  menu?.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    const openDropdown = dropdowns.find((dropdown) => !dropdown.querySelector('.dropdown__menu').hidden);
    if (openDropdown) {
      closeDropdown(openDropdown);
      openDropdown.querySelector('[data-dropdown-toggle]').focus();
      return;
    }
    if (root.classList.contains('is-menu-open')) {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });

  // ---------- Scroll: header, progress, parallax, journeys ----------
  const progressBar = document.querySelector('[data-progress]');
  const scrollTasks = [];
  let lastScrollY = window.scrollY;

  scrollTasks.push(() => {
    const y = window.scrollY;
    const maxScroll = root.scrollHeight - window.innerHeight;
    progressBar?.style.setProperty('--progress', maxScroll > 0 ? (y / maxScroll).toFixed(4) : '0');
    header.classList.toggle('is-scrolled', y > 8);

    const delta = y - lastScrollY;
    const isNearTop = y < 240;
    const isMenuOpen = root.classList.contains('is-menu-open');
    const hasFocusInside = header.contains(document.activeElement) && document.activeElement !== document.body;
    const hasOpenDropdown = Boolean(header.querySelector('.dropdown__menu:not([hidden])'));
    const canHide = !isNearTop && !isMenuOpen && !hasFocusInside && !hasOpenDropdown;
    if (delta > 6 && canHide) {
      header.classList.add('is-hidden');
    } else if (delta < -6 || isNearTop) {
      header.classList.remove('is-hidden');
    }
    if (Math.abs(delta) > 6) {
      lastScrollY = y;
    }
  });

  let isTicking = false;
  const runScrollTasks = () => {
    isTicking = false;
    scrollTasks.forEach((task) => task());
  };
  const requestScrollTasks = () => {
    if (!isTicking) {
      isTicking = true;
      window.requestAnimationFrame(runScrollTasks);
    }
  };
  window.addEventListener('scroll', requestScrollTasks, { passive: true });
  window.addEventListener('resize', requestScrollTasks);

  // Photos drift slightly inside their frame while scrolling (only those on screen are updated).
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const visibleFrames = new Set();
    const frameObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visibleFrames.add(entry.target);
        } else {
          visibleFrames.delete(entry.target);
        }
      });
      requestScrollTasks();
    });
    document.querySelectorAll('[data-parallax]').forEach((frame) => frameObserver.observe(frame));
    scrollTasks.push(() => {
      const viewport = window.innerHeight;
      visibleFrames.forEach((frame) => {
        const rect = frame.getBoundingClientRect();
        const progress = clamp((rect.top + rect.height / 2 - viewport / 2) / viewport, -1, 1);
        frame.style.setProperty('--py', `${(-6 + progress * 6).toFixed(2)}%`);
      });
    });
  }

  // Heads of the pages: their background (drawing or living scene) goes up more slowly than the
  // page, as if further away.
  const headLayers = [...document.querySelectorAll('.page-head > :is(.drawing, .living), .glasses-hero > .drawing')];
  if (headLayers.length && !reduceMotion.matches) {
    scrollTasks.push(() => {
      const y = window.scrollY;
      headLayers.forEach((layer) => {
        const head = layer.parentElement;
        if (y < head.offsetTop + head.offsetHeight) {
          layer.style.translate = `0 ${(Math.max(0, y - head.offsetTop) * 0.35).toFixed(1)}px`;
        }
      });
    });
  }

  // Surgeries page: the large drawing behind each chapter drifts with the scroll (--drift, from -1
  // to 1 as it crosses the screen) and, under a mouse, leans away from the pointer (--ax, --ay).
  const atmos = [...document.querySelectorAll('[data-atmo]')];
  if (atmos.length && !reduceMotion.matches && 'IntersectionObserver' in window) {
    const shownAtmos = new Set();
    const atmoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          shownAtmos.add(entry.target);
        } else {
          shownAtmos.delete(entry.target);
        }
      });
      requestScrollTasks();
    });
    atmos.forEach((atmo) => atmoObserver.observe(atmo));
    scrollTasks.push(() => {
      const viewport = window.innerHeight;
      shownAtmos.forEach((atmo) => {
        const rect = atmo.getBoundingClientRect();
        const drift = clamp((rect.top + rect.height / 2 - viewport / 2) / viewport, -1.5, 1.5);
        atmo.style.setProperty('--drift', drift.toFixed(3));
      });
    });
    if (finePointer.matches) {
      atmos.forEach((atmo) => {
        const area = atmo.parentElement;
        let pending = 0;
        area.addEventListener('pointermove', (event) => {
          window.cancelAnimationFrame(pending);
          pending = window.requestAnimationFrame(() => {
            const rect = area.getBoundingClientRect();
            atmo.style.setProperty('--ax', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
            atmo.style.setProperty('--ay', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
          });
        });
        area.addEventListener('pointerleave', () => {
          window.cancelAnimationFrame(pending);
          atmo.style.setProperty('--ax', '0');
          atmo.style.setProperty('--ay', '0');
        });
      });
    }
  }

  // ---------- Reveals: once the element is on screen, it rises into place by itself ----------
  // Elements arriving together follow each other (70 ms apart) unless the page sets their delay.
  const REVEAL_STAGGER = 0.07;
  const REVEAL_STAGGER_MAX = 6;
  const revealItems = [...document.querySelectorAll('[data-reveal], .footer-wordmark')];
  const revealAll = () => revealItems.forEach((item) => item.classList.add('is-visible'));
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const reveal = (items) => items.forEach((item, index) => {
      const hasOwnDelay = item.style.getPropertyValue('--reveal-delay') !== '';
      if (!hasOwnDelay) {
        item.style.setProperty('--reveal-delay', `${(Math.min(index, REVEAL_STAGGER_MAX) * REVEAL_STAGGER).toFixed(2)}s`);
      }
      item.classList.add('is-visible');
      revealObserver.unobserve(item);
    });
    const revealObserver = new IntersectionObserver((entries) => {
      reveal(entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target));
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    revealItems.forEach((item) => revealObserver.observe(item));
    // At the very end of the page, what is still waiting at the bottom of the screen shows too.
    scrollTasks.push(() => {
      const isAtEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      if (isAtEnd) {
        reveal(revealItems.filter((item) => !item.classList.contains('is-visible') && item.getBoundingClientRect().top < window.innerHeight));
      }
    });
  } else {
    revealAll();
  }

  // ---------- Titles focus word by word; photos open like a pupil ----------
  // Each kind waits until it is well inside the screen, so the effect is seen, then plays once.
  const playOnce = (selector, className, options) => {
    const items = [...document.querySelectorAll(selector)];
    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      items.forEach((item) => item.classList.add(className));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        entry.target.classList.add(className);
        observer.unobserve(entry.target);
      });
    }, options);
    items.forEach((item) => observer.observe(item));
  };
  playOnce('[data-focus]', 'is-focused', { rootMargin: '0px 0px -8% 0px' });
  // The clipped photo only counts by its visible disc: it opens once that disc is on screen.
  playOnce('[data-aperture]', 'is-open', { rootMargin: '0px 0px -12% 0px' });
  // Home: the line joining the three steps of the consultation draws itself; on the intervention
  // pages, the line over the steps of the journey.
  playOnce('.visit__steps', 'is-drawn', { threshold: 0.35 });
  playOnce('.itinerary', 'is-drawn', { rootMargin: '0px 0px -10% 0px' });

  // ---------- Small things drawn or rolled into place as they come on screen ----------
  // Labels draw their line; decorative icons trace their lines; big step numbers roll digit after
  // digit (each digit in its own clip; screen readers keep the plain number).
  const DRAWN_ICONS = '.visit__icon, .care-card__icon, .exam__icon, .team-role__icon, .after__icon, .team-photo__icon, .doc__icon';
  document.querySelectorAll(DRAWN_ICONS).forEach((holder) => holder.setAttribute('data-draw', ''));
  playOnce('[data-draw]', 'is-drawn', { rootMargin: '0px 0px -10% 0px' });
  playOnce('.label', 'is-in', { rootMargin: '0px 0px -6% 0px' });
  playOnce('[data-atmo]', 'is-drawn', { threshold: 0.12 });
  playOnce('[data-draw-map]', 'is-drawn', { threshold: 0.4 });

  // Giant titles fill their width by design; if a reader's own settings (wider letter or word
  // spacing, another font) make one wider than its place, it is brought back inside it.
  const giants = [...document.querySelectorAll('.giant > span')];
  const fitGiants = () => {
    giants.forEach((span) => span.style.removeProperty('--fit'));
    giants.forEach((span) => {
      const room = span.clientWidth;
      const need = span.scrollWidth;
      if (room > 0 && need > room + 1) {
        span.style.setProperty('--fit', (room / need).toFixed(3));
      }
    });
  };
  if (giants.length) {
    let fitFrame = 0;
    const refit = () => {
      window.cancelAnimationFrame(fitFrame);
      fitFrame = window.requestAnimationFrame(fitGiants);
    };
    window.addEventListener('resize', refit);
    document.fonts?.ready.then(refit);
    new MutationObserver(refit).observe(document.head, { childList: true });
    new MutationObserver(refit).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-text-size'] });
    refit();
  }

  // Pathology pages: the drawing of each section plays when it comes on screen, and again when the
  // pointer comes over its section, once the previous play is over.
  document.querySelectorAll('[data-vignette]').forEach((drawing) => {
    let playedAt = -Infinity;
    const play = () => {
      if (performance.now() - playedAt < 3800) {
        return;
      }
      playedAt = performance.now();
      drawing.classList.remove('is-playing');
      drawing.getBoundingClientRect();
      drawing.classList.add('is-playing');
    };
    if (!('IntersectionObserver' in window)) {
      drawing.classList.add('is-playing');
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        play();
        observer.disconnect();
      }
    }, { threshold: 0.6 });
    observer.observe(drawing);
    drawing.closest('section')?.addEventListener('pointerenter', play);
  });

  const ROLLED_NUMBERS = '.visit__num, .itinerary__num, .charter__num, .exam__num, .plate__num, .chapter__num';
  document.querySelectorAll(ROLLED_NUMBERS).forEach((number) => {
    const textNode = [...number.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!textNode) {
      return;
    }
    const text = textNode.textContent.trim();
    const plain = document.createElement('span');
    plain.className = 'sr-only';
    plain.textContent = text;
    const rolled = document.createElement('span');
    rolled.className = 'roll-num';
    rolled.setAttribute('aria-hidden', 'true');
    [...text].forEach((char, index) => {
      const digit = document.createElement('span');
      digit.className = 'roll-num__digit';
      digit.style.setProperty('--d', index);
      const face = document.createElement('span');
      face.textContent = char;
      digit.append(face);
      rolled.append(digit);
    });
    textNode.replaceWith(plain, rolled);
  });
  playOnce(ROLLED_NUMBERS, 'is-rolled', { rootMargin: '0px 0px -8% 0px' });

  // Home: once most of the hero is left behind, the eye goes out of focus; back on it, it clears.
  const heroStage = document.querySelector('.hero__stage');
  if (heroStage && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      const isLeft = entry.intersectionRatio < 0.45 && entry.boundingClientRect.top < 0;
      heroStage.classList.toggle('is-away', isLeft);
    }, { threshold: [0, 0.45, 1] }).observe(heroStage.closest('section') || heroStage);
  }

  // ---------- Home: the eye as the ophthalmologist examines it, explored with a beam of light ----------
  // The beam follows the pointer over the view (or goes to the subject pointed in the list); the
  // subject whose marker is under the light is shown and plays its gesture (the stylesheet, on
  // data-active). Until the visitor takes the light, it visits the four subjects one after the other.
  // The eye of the front view is alive: it looks toward the light, its cornea reflects it, it blinks
  // now and then. What moves by itself rests when the view is off screen, when the tour is paused,
  // or when the visitor has taken the light and gone away (.is-alive).
  document.querySelectorAll('[data-lamp]').forEach((view) => {
    const figure = view.querySelector('[data-lamp-figure]');
    const svg = figure?.querySelector('svg');
    const beams = figure ? [...figure.querySelectorAll('.lamp__beam')] : [];
    if (!svg || !beams.length) {
      return;
    }
    const SIZE = 600;
    const REACH = 250;
    const NEAR = 64;
    const pupil = figure.querySelector('.lamp__pupil');
    const gaze = figure.querySelector('.lamp__gaze');
    const catchlight = gaze?.querySelector('.catchlight');
    const spots = [...view.querySelectorAll('[data-spot]')].map((item) => {
      const marker = figure.querySelector(`[data-marker="${item.dataset.spot}"]`);
      return { item, marker, label: figure.querySelector(`[data-label="${item.dataset.spot}"]`), at: marker.dataset.at.split(' ').map(Number) };
    });
    const pupilAt = spots.find((spot) => spot.item.dataset.spot === 'cristallin')?.at;
    let position = [...spots[0].at];
    let goal = [...position];
    let active = null;
    let frame = 0;
    let lastTime = 0;
    let isTaken = false;
    let isPaused = false;
    let isOnScreen = false;
    let isPointerIn = false;
    const playButton = view.querySelector('[data-lamp-play]');

    // A blink: each part of the lids goes from its open shape to its closed one (data-closed), number
    // by number, quickly down and a little slower up.
    const NUMBER = /-?\d*\.?\d+/g;
    const lids = [...figure.querySelectorAll('[data-closed]')].map((element) => {
      const open = element.getAttribute('d');
      return { element, parts: open.split(NUMBER), from: open.match(NUMBER).map(Number), to: element.dataset.closed.match(NUMBER).map(Number) };
    }).filter(({ from, to }) => from.length === to.length);
    const shapeLids = (closed) => lids.forEach(({ element, parts, from, to }) => {
      let d = parts[0];
      from.forEach((value, i) => {
        d += (value + (to[i] - value) * closed).toFixed(1) + parts[i + 1];
      });
      element.setAttribute('d', d);
    });
    let blinkStart = 0;
    const blinkFrame = (now) => {
      const t = Math.max(0, (now - blinkStart) / 1000);
      if (t >= 0.36) {
        shapeLids(0);
        blinkStart = 0;
        return;
      }
      const isClosing = t < 0.15;
      shapeLids(isClosing ? Math.min(1, t / 0.1) ** 2 : (1 - Math.min(1, (t - 0.15) / 0.21)) ** 2);
      window.requestAnimationFrame(blinkFrame);
    };
    const blink = () => {
      if (!lids.length || blinkStart) {
        return;
      }
      blinkStart = performance.now();
      window.requestAnimationFrame(blinkFrame);
    };
    let blinkTimer = 0;
    const blinkNowAndThen = () => {
      window.clearTimeout(blinkTimer);
      if (lids.length && view.classList.contains('is-alive')) {
        blinkTimer = window.setTimeout(() => {
          blink();
          blinkNowAndThen();
        }, 2600 + Math.random() * 3800);
      }
    };
    // The inside of the eye makes small movements (saccades) now and then, a little toward the
    // height of the light; the floaters follow late (the stylesheet).
    const globe = figure.querySelector('.lamp__globe');
    let saccadeTimer = 0;
    const moveNowAndThen = () => {
      window.clearTimeout(saccadeTimer);
      if (globe && view.classList.contains('is-alive')) {
        saccadeTimer = window.setTimeout(() => {
          const towardLight = ((SIZE / 2 - position[1]) / REACH) * 1.4;
          figure.style.setProperty('--turn', `${(towardLight + (Math.random() * 2 - 1) * 1.6).toFixed(2)}deg`);
          moveNowAndThen();
        }, 1400 + Math.random() * 2200);
      }
    };
    const updateLife = () => {
      const isTouring = !isTaken && !isPaused;
      view.classList.toggle('is-alive', isOnScreen && (isTouring || isPointerIn));
      blinkNowAndThen();
      moveNowAndThen();
    };

    const setActive = (spot) => {
      if (spot === active) {
        return;
      }
      [active, spot].forEach((each, index) => {
        const isOn = index === 1;
        each?.item.classList.toggle('is-active', isOn);
        each?.marker.classList.toggle('is-active', isOn);
        each?.label.classList.toggle('is-shown', isOn);
      });
      active = spot;
      figure.dataset.active = spot ? spot.item.dataset.spot : '';
      // The gesture of the eyelids is a slow double blink.
      if (spot?.item.dataset.spot === 'paupieres') {
        blink();
        window.setTimeout(blink, 480);
      }
    };

    // The eye looks toward the light, and the light shines on its cornea.
    const look = () => {
      if (!gaze || !pupilAt) {
        return;
      }
      const dx = position[0] - pupilAt[0];
      const dy = position[1] - pupilAt[1];
      gaze.style.translate = `${(dx * 0.1).toFixed(2)}px ${(dy * 0.06).toFixed(2)}px`;
      catchlight?.style.setProperty('translate', `${(dx * 0.05).toFixed(2)}px ${(dy * 0.05).toFixed(2)}px`);
    };

    const light = () => {
      beams.forEach((beam) => {
        beam.setAttribute('cx', position[0].toFixed(1));
        beam.setAttribute('cy', position[1].toFixed(1));
      });
      let nearest = null;
      let best = NEAR;
      spots.forEach((spot) => {
        const distance = Math.hypot(spot.at[0] - position[0], spot.at[1] - position[1]);
        if (distance < best) {
          best = distance;
          nearest = spot;
        }
      });
      setActive(nearest);
      if (pupil && pupilAt) {
        pupil.classList.toggle('is-lit', Math.hypot(pupilAt[0] - position[0], pupilAt[1] - position[1]) < 70);
      }
      look();
    };

    const glide = (now) => {
      frame = 0;
      const elapsed = lastTime ? Math.min(now - lastTime, 100) : 16;
      lastTime = now;
      const ease = 1 - Math.exp(-elapsed / 150);
      position = position.map((value, i) => value + (goal[i] - value) * ease);
      const isThere = Math.hypot(goal[0] - position[0], goal[1] - position[1]) < 0.5;
      if (isThere) {
        position = [...goal];
        lastTime = 0;
      }
      light();
      if (!isThere) {
        frame = window.requestAnimationFrame(glide);
      }
    };
    const aim = (point) => {
      goal = point;
      if (!frame) {
        frame = window.requestAnimationFrame(glide);
      }
    };

    // Pointer: in drawing units, kept inside the round view.
    const pointAt = (event) => {
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * SIZE - SIZE / 2;
      const y = ((event.clientY - rect.top) / rect.height) * SIZE - SIZE / 2;
      const distance = Math.hypot(x, y);
      const k = distance > REACH ? REACH / distance : 1;
      return [SIZE / 2 + x * k, SIZE / 2 + y * k];
    };
    const take = () => {
      isTaken = true;
      showTourState();
      updateLife();
    };
    // Only a real move of the pointer takes the light: the page scrolling under a still mouse
    // does not (its pointer events do not move).
    figure.addEventListener('pointermove', (event) => {
      const hasMoved = event.pointerType !== 'mouse' || Math.abs(event.movementX) + Math.abs(event.movementY) > 0;
      if (!hasMoved) {
        return;
      }
      take();
      aim(pointAt(event));
    });
    figure.addEventListener('pointerdown', (event) => {
      take();
      aim(pointAt(event));
    });
    view.addEventListener('pointerenter', () => {
      isPointerIn = true;
      updateLife();
    });
    view.addEventListener('pointerleave', () => {
      isPointerIn = false;
      updateLife();
    });
    view.addEventListener('focusin', () => {
      isPointerIn = true;
      updateLife();
    });
    view.addEventListener('focusout', (event) => {
      if (!view.contains(event.relatedTarget)) {
        isPointerIn = false;
        updateLife();
      }
    });
    spots.forEach((spot) => {
      const go = () => {
        take();
        aim([...spot.at]);
      };
      spot.item.addEventListener('pointerenter', go);
      spot.item.addEventListener('focus', go);
      spot.marker.addEventListener('click', () => {
        window.location.href = spot.item.href;
      });
    });

    // A slow tour of the subjects while the view is on screen and nobody holds the light; the button
    // pauses it, or starts it again once the visitor has taken the light.
    let tour = 0;
    let next = 1;
    function showTourState() {
      const isStopped = isPaused || isTaken;
      view.classList.toggle('is-paused', isStopped);
      playButton?.classList.toggle('is-paused', isStopped);
      playButton?.setAttribute('aria-label', isStopped ? 'Reprendre la visite guidée' : 'Mettre en pause la visite guidée');
    }
    const runTour = () => {
      window.clearInterval(tour);
      if (isOnScreen && !isTaken && !isPaused) {
        tour = window.setInterval(() => {
          if (isTaken || isPaused) {
            window.clearInterval(tour);
            return;
          }
          aim([...spots[next].at]);
          next = (next + 1) % spots.length;
        }, 3000);
      }
    };
    playButton?.addEventListener('click', () => {
      const isStopped = isPaused || isTaken;
      isPaused = !isStopped;
      isTaken = false;
      showTourState();
      runTour();
      updateLife();
    });
    // Each time the view comes on screen, the tour starts again from the first subject, whose
    // gesture plays at once (unless the visitor has paused it with the button).
    const startTour = () => {
      isTaken = false;
      next = 1;
      showTourState();
      setActive(null);
      getComputedStyle(figure).opacity;
      // Off screen until now: the light can jump to the first subject.
      position = [...spots[0].at];
      goal = [...position];
      light();
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const wasOnScreen = isOnScreen;
        isOnScreen = entries[0].isIntersecting;
        if (isOnScreen && !wasOnScreen && !isPaused) {
          startTour();
        }
        runTour();
        updateLife();
      }, { threshold: 0.35 }).observe(figure);
    }
    light();
  });

  // ---------- Glasses: a lens sharpens the reading chart ----------
  document.querySelectorAll('[data-chart]').forEach((chart) => {
    const sharp = chart.querySelector('.chart__layer--sharp');
    const state = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let isRunning = false;
    let pointerInside = false;
    let startTime = performance.now();
    const radius = () => clamp(chart.clientWidth * 0.17, 62, 104);

    const paint = () => {
      const chartRect = chart.getBoundingClientRect();
      const sharpRect = sharp.getBoundingClientRect();
      chart.style.setProperty('--cpx', `${state.x.toFixed(1)}px`);
      chart.style.setProperty('--cpy', `${state.y.toFixed(1)}px`);
      chart.style.setProperty('--cx', `${(state.x - (sharpRect.left - chartRect.left)).toFixed(1)}px`);
      chart.style.setProperty('--cy', `${(state.y - (sharpRect.top - chartRect.top)).toFixed(1)}px`);
      chart.style.setProperty('--cr', `${radius().toFixed(1)}px`);
    };

    const restPosition = () => ({ x: chart.clientWidth * 0.32, y: chart.clientHeight * 0.24 });
    Object.assign(state, restPosition());
    Object.assign(target, restPosition());
    paint();

    if (reduceMotion.matches) {
      chart.addEventListener('pointermove', (event) => {
        const rect = chart.getBoundingClientRect();
        state.x = event.clientX - rect.left;
        state.y = event.clientY - rect.top;
        paint();
      });
      return;
    }

    let isVisible = false;
    const tick = (now) => {
      if (!isVisible || document.hidden) {
        isRunning = false;
        return;
      }
      if (!pointerInside) {
        // Reads down the chart, line after line, when nobody is pointing.
        const t = (now - startTime) / 1000;
        target.x = chart.clientWidth * (0.42 + Math.sin(t * 0.55) * 0.26);
        target.y = chart.clientHeight * (0.5 + Math.sin(t * 0.21) * 0.32);
      }
      state.x = lerp(state.x, target.x, pointerInside ? 0.18 : 0.04);
      state.y = lerp(state.y, target.y, pointerInside ? 0.18 : 0.04);
      paint();
      window.requestAnimationFrame(tick);
    };
    const start = () => {
      if (!isRunning && isVisible) {
        isRunning = true;
        window.requestAnimationFrame(tick);
      }
    };
    chart.addEventListener('pointermove', (event) => {
      const rect = chart.getBoundingClientRect();
      target.x = event.clientX - rect.left;
      target.y = event.clientY - rect.top;
      pointerInside = true;
      start();
    });
    chart.addEventListener('pointerleave', () => {
      pointerInside = false;
      startTime = performance.now();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
        start();
      }).observe(chart);
    }
    document.addEventListener('visibilitychange', start);
  });

  // ---------- Glasses: the trial frame of the head answers the pointer ----------
  // The cylinder turns its axis toward the pointer, as the orthoptist turns it to find the axis; a
  // marker follows on the scale, the nearest degree lights up and the axis is read below the cell.
  // The frame leans toward the pointer and light glints on its lenses.
  const trial = document.querySelector('[data-trial]');
  if (trial && finePointer.matches && !reduceMotion.matches) {
    const area = trial.closest('section') || trial;
    const readout = trial.querySelector('[data-trial-readout]');
    const labels = [...trial.querySelectorAll('.trial__scale--cyl .trial__deg')];
    const shines = [...trial.querySelectorAll('.trial__shine')];
    const CYLINDER = [595, 222];
    let axis = 45;
    let goal = 45;
    let frame = 0;
    let lastTime = 0;
    const paint = () => {
      trial.style.setProperty('--trial-axis', `${(45 - axis).toFixed(2)}deg`);
      const shown = Math.round(((axis % 180) + 180) % 180);
      readout.textContent = `Axe ${shown}°`;
      const nearest = Math.round(shown / 30) * 30;
      labels.forEach((label) => label.classList.toggle('is-near', Number(label.dataset.deg) === nearest));
    };
    const turn = (now) => {
      frame = 0;
      const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
      lastTime = now;
      axis += (goal - axis) * (1 - Math.exp(-dt * 7));
      paint();
      if (Math.abs(goal - axis) > 0.05) {
        frame = window.requestAnimationFrame(turn);
      }
    };
    area.addEventListener('pointermove', (event) => {
      const matrix = trial.getScreenCTM();
      if (!matrix) {
        return;
      }
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      // An axis is a line: an angle and the same plus 180° are the same axis; the nearest is kept.
      let angle = (((Math.atan2(CYLINDER[1] - p.y, p.x - CYLINDER[0]) * 180) / Math.PI) % 180 + 180) % 180;
      while (angle - axis > 90) angle -= 180;
      while (axis - angle > 90) angle += 180;
      goal = angle;
      trial.classList.add('is-live');
      const rect = trial.getBoundingClientRect();
      const nx = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.8, 0.8);
      const ny = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.8, 0.8);
      trial.style.setProperty('--trial-ry', `${(nx * 10).toFixed(2)}deg`);
      trial.style.setProperty('--trial-rx', `${(-ny * 8).toFixed(2)}deg`);
      shines.forEach((shine) => {
        shine.style.setProperty('--gx', `${(-nx * 26).toFixed(1)}px`);
        shine.style.setProperty('--gy', `${(-ny * 22).toFixed(1)}px`);
      });
      if (!frame) {
        lastTime = performance.now();
        frame = window.requestAnimationFrame(turn);
      }
    });
    area.addEventListener('pointerleave', () => {
      trial.style.setProperty('--trial-ry', '0deg');
      trial.style.setProperty('--trial-rx', '0deg');
      shines.forEach((shine) => {
        shine.style.setProperty('--gx', '0px');
        shine.style.setProperty('--gy', '0px');
      });
    });
  }

  // ---------- Glasses: the conditions, ticked one by one ----------
  // When all are ticked, the page says that the quick appointment is for the visitor.
  document.querySelectorAll('.conditions').forEach((list) => {
    const boxes = [...list.querySelectorAll('[data-condition]')];
    const holder = list.parentElement;
    const status = holder.querySelector('[data-conditions-status]');
    if (!boxes.length || !status) {
      return;
    }
    const update = () => {
      const count = boxes.filter((box) => box.checked).length;
      const isComplete = count === boxes.length;
      holder.classList.toggle('is-complete', isComplete);
      if (isComplete) {
        status.textContent = 'Les cinq conditions sont remplies : vous pouvez prendre un rendez-vous rapide.';
      } else if (count) {
        status.textContent = `${count} condition${count > 1 ? 's' : ''} sur ${boxes.length}.`;
      } else {
        status.textContent = 'Cochez les conditions que vous remplissez.';
      }
    };
    boxes.forEach((box) => box.addEventListener('change', update));
  });

  // ---------- Numbers that count up to their value when they come on screen ----------
  document.querySelectorAll('[data-count-to]').forEach((number) => {
    const goal = Number(number.dataset.countTo);
    if (reduceMotion.matches || !('IntersectionObserver' in window) || !goal) {
      return;
    }
    number.textContent = '0';
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        return;
      }
      observer.disconnect();
      const startedAt = performance.now();
      const count = (now) => {
        const t = Math.min(1, (now - startedAt) / 1100);
        number.textContent = String(Math.round((1 - (1 - t) ** 3) * goal));
        if (t < 1) {
          window.requestAnimationFrame(count);
        }
      };
      window.requestAnimationFrame(count);
    }, { threshold: 0.6 });
    observer.observe(number);
  });

  // ---------- Glasses: "Mieux avec le 1 ou le 2 ?" ----------
  // Each window shows the letters through one lens: the further the lens from the right correction,
  // the more blurred. Touching the sharper one keeps it; the dials turn and a closer pair comes. Three
  // good choices and the letters are sharp. A wrong choice simply moves away from it.
  document.querySelectorAll('[data-phoropter]').forEach((game) => {
    const lenses = [...game.querySelectorAll('[data-lens]')];
    const status = game.querySelector('[data-phoropter-status]');
    const again = game.querySelector('[data-phoropter-again]');
    const rounds = [...game.querySelectorAll('.phoropter__rounds li')];
    const START = 1.5;
    const STEP = 0.5;
    const BLUR_PER_STEP = 3.2;
    const HINT = 'Touchez le verre qui vous paraît le plus net.';
    let current = START;
    let offer = [];
    let turn = 0;

    const paint = () => {
      lenses.forEach((lens, index) => lens.style.setProperty('--blur', `${Math.min(9, (offer[index] / STEP) * BLUR_PER_STEP).toFixed(2)}px`));
      const done = clamp(Math.round((START - current) / STEP), 0, rounds.length);
      rounds.forEach((round, index) => round.classList.toggle('is-done', index < done));
    };
    const click = () => {
      turn += 1;
      game.style.setProperty('--turn', String(turn));
      game.classList.remove('is-turning');
      void game.offsetWidth;
      game.classList.add('is-turning');
    };
    const newPair = () => {
      const pair = [Math.max(0, current - STEP), current + STEP];
      offer = Math.random() < 0.5 ? pair : pair.reverse();
      paint();
    };
    const finish = () => {
      offer = [0, 0];
      paint();
      game.classList.add('is-sharp');
      status.textContent = "C'est net ! C'est ce que cherche la réfraction.";
      again.hidden = false;
    };

    lenses.forEach((lens, index) => {
      lens.addEventListener('click', () => {
        if (game.classList.contains('is-sharp')) {
          return;
        }
        const chosen = offer[index];
        const isSharper = chosen < current;
        current = Math.min(chosen, START + STEP * 2);
        lens.classList.remove('is-picked');
        void lens.offsetWidth;
        lens.classList.add('is-picked');
        click();
        // The new lenses show once the windows are closed.
        window.setTimeout(() => {
          if (current <= 0) {
            finish();
            return;
          }
          status.textContent = isSharper ? 'Bien vu ! Et maintenant, le 1 ou le 2 ?' : 'Un peu plus flou… Et maintenant, le 1 ou le 2 ?';
          newPair();
        }, reduceMotion.matches ? 0 : 200);
      });
    });
    again?.addEventListener('click', () => {
      current = START;
      game.classList.remove('is-sharp');
      again.hidden = true;
      status.textContent = HINT;
      click();
      newPair();
      lenses[0].focus();
    });
    newPair();
  });

  // ---------- Table of contents: section being read ----------
  const tocLinks = [...document.querySelectorAll('.toc a[href^="#"]')];
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((link) => [link.getAttribute('href').slice(1), link]));
    const tocObserver = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        tocLinks.forEach((link) => link.classList.toggle('is-active', link === byId.get(entry.target.id)));
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    byId.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) {
        tocObserver.observe(section);
      }
    });
  }

  // The thread of the table of contents fills as the article is read; its point is the reader.
  const toc = document.querySelector('.toc');
  const articleBody = document.querySelector('.article-body');
  if (toc && articleBody) {
    scrollTasks.push(() => {
      const rect = articleBody.getBoundingClientRect();
      const read = clamp((window.innerHeight * 0.4 - rect.top) / rect.height, 0, 1);
      toc.style.setProperty('--read', read.toFixed(3));
    });
  }

  // ---------- Detailed journeys: the line fills up to the end of the last step ----------
  document.querySelectorAll('[data-journey]').forEach((journey) => {
    const fill = journey.querySelector('.journey__line span');
    const steps = [...journey.querySelectorAll('.journey__step')];
    // Each question of a step is a station on the line, lit once the line has reached it.
    const stations = [...journey.querySelectorAll('.qa')];
    scrollTasks.push(() => {
      const rect = journey.getBoundingClientRect();
      const anchor = window.innerHeight * 0.45;
      const progress = clamp((anchor - rect.top) / rect.height, 0, 1);
      fill?.style.setProperty('--fill', progress.toFixed(4));
      let current = -1;
      steps.forEach((step, i) => {
        if (step.getBoundingClientRect().top < anchor) {
          current = i;
        }
      });
      steps.forEach((step, i) => {
        step.classList.toggle('is-current', i === current);
        step.classList.toggle('is-done', i < current);
      });
      stations.forEach((station) => station.classList.toggle('is-passed', station.getBoundingClientRect().top + 24 < anchor));
    });
  });

  // ---------- Tilt: objects turn toward the pointer, in 3D ----------
  // data-tilt holds the maximum angle; data-tilt-area="section" follows the pointer over the whole section.
  const canTilt = finePointer.matches && !reduceMotion.matches;
  const tiltItems = canTilt ? [...document.querySelectorAll('[data-tilt]')] : [];
  tiltItems.forEach((item) => {
    const maxAngle = Number(item.dataset.tilt) || 6;
    const followsSection = item.dataset.tiltArea === 'section';
    const area = (followsSection && item.closest('section')) || item;
    let pending = 0;

    area.addEventListener('pointermove', (event) => {
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(() => {
        const rect = item.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        item.classList.add('is-tilting');
        item.style.setProperty('--ry', `${(clamp((x - 0.5) * 2, -1, 1) * maxAngle).toFixed(2)}deg`);
        item.style.setProperty('--rx', `${(clamp((0.5 - y) * 2, -1, 1) * maxAngle).toFixed(2)}deg`);
        item.style.setProperty('--gx', `${(clamp(x, 0, 1) * 100).toFixed(1)}%`);
        item.style.setProperty('--gy', `${(clamp(y, 0, 1) * 100).toFixed(1)}%`);
      });
    });
    area.addEventListener('pointerleave', () => {
      window.cancelAnimationFrame(pending);
      item.classList.remove('is-tilting');
      ['--rx', '--ry', '--gx', '--gy'].forEach((name) => item.style.removeProperty(name));
    });
  });

  // ---------- Animated schemas: one disease or one surgery, step by step ----------
  // The figure carries data-step and cumulative classes (is-step-1 … is-step-n) that the CSS animates.
  // Step buttons stay usable at any time; autoplay only runs while the schema is on screen.
  document.querySelectorAll('[data-schema]').forEach((schema) => {
    const buttons = [...schema.querySelectorAll('[data-goto]')];
    const playButton = schema.querySelector('[data-schema-play]');
    const readouts = [...schema.querySelectorAll('[data-values]')];
    const now = schema.querySelector('.schema__now');
    const total = Number(schema.dataset.steps) || buttons.length;
    const duration = Number(schema.dataset.duration) || 3000;
    let step = 1;
    let timer = 0;
    let isPlaying = schema.hasAttribute('data-autoplay');
    let isVisible = false;

    // A step chosen by the visitor is announced; the steps of the autoplay are not (a screen reader
    // would be interrupted every three seconds).
    const show = (next, isChosen = false) => {
      step = next;
      schema.dataset.step = String(step);
      for (let i = 1; i <= total; i += 1) {
        schema.classList.toggle(`is-step-${i}`, i <= step);
      }
      buttons.forEach((button, index) => {
        const isCurrent = index + 1 === step;
        button.classList.toggle('is-active', isCurrent);
        button.setAttribute('aria-pressed', String(isCurrent));
      });
      // Compact schemas show the current step's title as a caption.
      if (now) {
        now.setAttribute('aria-live', isChosen ? 'polite' : 'off');
        now.textContent = buttons[step - 1]?.dataset.caption || '';
      }
      // Readouts (e.g. eye pressure in mmHg) take one value per step.
      readouts.forEach((node) => {
        const values = node.dataset.values.split('|');
        node.textContent = values[Math.min(step, values.length) - 1];
      });
      schema.style.setProperty('--step-duration', `${duration}ms`);
      schema.classList.remove('is-timing');
      // Restart the progress bar of the current step.
      void schema.offsetWidth;
      if (isPlaying) {
        schema.classList.add('is-timing');
      }
    };

    // Driven schemas (surgeries page): the page chooses the step, from the scroll.
    if (schema.hasAttribute('data-driven')) {
      schema.addEventListener('schema:goto', (event) => show(event.detail.step));
      show(1);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => schema.classList.toggle('is-visible', entries[0].isIntersecting)).observe(schema);
      } else {
        schema.classList.add('is-visible');
      }
      return;
    }

    const schedule = () => {
      window.clearTimeout(timer);
      if (isPlaying && isVisible) {
        timer = window.setTimeout(() => {
          show((step % total) + 1);
          schedule();
        }, duration);
      }
    };

    const setPlaying = (value) => {
      isPlaying = value;
      schema.classList.toggle('is-playing', isPlaying);
      playButton?.setAttribute('aria-label', isPlaying ? (playButton.dataset.labelPause || "Mettre en pause l'animation") : (playButton.dataset.labelPlay || "Lancer l'animation"));
      show(step);
      schedule();
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        setPlaying(false);
        show(Number(button.dataset.goto), true);
      });
    });
    playButton?.addEventListener('click', () => setPlaying(!isPlaying));

    const updateVisibility = (value) => {
      isVisible = value;
      schema.classList.toggle('is-visible', isVisible);
      if (isVisible) {
        show(step);
      }
      schedule();
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => updateVisibility(entries[0].isIntersecting), { threshold: 0.35 }).observe(schema);
    } else {
      updateVisibility(true);
    }
    setPlaying(isPlaying);
  });

  // ---------- Atlas (pathologies): one plate shown at a time, chosen in the index ----------
  // Without script, the index is a list of links and the four plates follow each other.
  document.querySelectorAll('[data-atlas]').forEach((atlas) => {
    const tabs = [...atlas.querySelectorAll('[data-atlas-tab]')];
    const plates = [...atlas.querySelectorAll('[data-atlas-plate]')];
    const tablist = tabs[0]?.closest('ol');
    if (!tablist) {
      return;
    }
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-orientation', 'vertical');
    tabs.forEach((tab) => {
      tab.parentElement.setAttribute('role', 'presentation');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', tab.dataset.atlasTab);
      tab.id = `tab-${tab.dataset.atlasTab}`;
    });
    plates.forEach((plate) => plate.setAttribute('role', 'tabpanel'));

    const select = (name, { focus = false, remember = false } = {}) => {
      tabs.forEach((tab) => {
        const isSelected = tab.dataset.atlasTab === name;
        tab.setAttribute('aria-selected', String(isSelected));
        tab.tabIndex = isSelected ? 0 : -1;
        if (isSelected && focus) {
          tab.focus();
        }
      });
      plates.forEach((plate) => {
        const isShown = plate.dataset.atlasPlate === name;
        plate.hidden = !isShown;
        plate.classList.toggle('is-shown', isShown);
      });
      if (remember) {
        history.replaceState(null, '', `#${name}`);
      }
    };

    const KEY_STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        select(tab.dataset.atlasTab, { remember: true });
      });
      tab.addEventListener('keydown', (event) => {
        const lastIndex = tabs.length - 1;
        const targets = { Home: 0, End: lastIndex };
        const isStep = event.key in KEY_STEP;
        if (!isStep && !(event.key in targets)) {
          return;
        }
        event.preventDefault();
        const next = isStep ? (index + KEY_STEP[event.key] + tabs.length) % tabs.length : targets[event.key];
        select(tabs[next].dataset.atlasTab, { focus: true, remember: true });
      });
    });

    const linked = tabs.find((tab) => `#${tab.dataset.atlasTab}` === window.location.hash);
    select((linked || tabs[0]).dataset.atlasTab);
    atlas.classList.add('is-tabs');
  });

  // ---------- Surgeries: each operation plays by itself, step after step ----------
  // The surgeries page (one chapter per operation) and the intervention pages (the film) play the
  // steps of the operation while they are on screen.
  // Scrolling only scrolls the page. A step jumps to it and pauses; the button plays again.
  const playSteps = (root, { buttons, playButton, onShow = () => {} }) => {
    const schema = root.querySelector('[data-schema]');
    const duration = parseFloat(getComputedStyle(root).getPropertyValue('--film-duration')) * 1000 || 3000;
    let step = 1;
    let timer = 0;
    let isPlaying = true;
    let isVisible = false;

    const show = (next) => {
      const isNew = next !== step;
      step = next;
      buttons.forEach((button, index) => {
        button.classList.toggle('is-active', index + 1 === step);
        button.classList.toggle('is-done', index + 1 < step);
        if (index + 1 === step) {
          button.setAttribute('aria-current', 'step');
        } else {
          button.removeAttribute('aria-current');
        }
      });
      schema?.dispatchEvent(new CustomEvent('schema:goto', { detail: { step } }));
      onShow(step, isNew);
      // The bar of the step fills again from the start.
      root.classList.remove('is-timing');
      void root.offsetWidth;
      root.classList.toggle('is-timing', isPlaying && isVisible);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (isPlaying && isVisible) {
        timer = window.setTimeout(() => {
          show((step % buttons.length) + 1);
          schedule();
        }, duration);
      }
    };

    const setPlaying = (value) => {
      isPlaying = value;
      root.classList.toggle('is-playing', isPlaying);
      playButton?.setAttribute('aria-label', isPlaying ? (playButton.dataset.labelPause || "Mettre en pause l'animation") : (playButton.dataset.labelPlay || "Reprendre l'animation"));
      show(step);
      schedule();
    };

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        isPlaying = false;
        root.classList.remove('is-playing');
        playButton?.setAttribute('aria-label', playButton.dataset.labelPlay || "Reprendre l'animation");
        show(index + 1);
        schedule();
      });
    });
    playButton?.addEventListener('click', () => setPlaying(!isPlaying));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
        show(step);
        schedule();
      }, { threshold: 0.35 }).observe(root);
    } else {
      isVisible = true;
    }
    setPlaying(isPlaying);
  };

  // Surgeries page: the list of the chapter shows every step, the one playing stands out (on phones
  // its text is shown under the drawing).
  document.querySelectorAll('[data-chapter]').forEach((chapter) => {
    const buttons = [...chapter.querySelectorAll('[data-chapter-step]')];
    const captions = [...chapter.querySelectorAll('[data-chapter-caption]')];
    if (buttons.length) {
      playSteps(chapter, {
        buttons,
        playButton: chapter.querySelector('[data-chapter-play]'),
        onShow: (step) => captions.forEach((caption, index) => caption.classList.toggle('is-active', index + 1 === step)),
      });
    }
  });

  // Surgeries page: once the index of the page is passed, a compact index stays at the top and
  // shows the chapter being read.
  const chapterNav = document.querySelector('[data-chapter-nav]');
  const pageIndex = document.querySelector('.bloc-index');
  if (chapterNav && pageIndex && 'IntersectionObserver' in window) {
    const links = [...chapterNav.querySelectorAll('a[href^="#"]')];
    new IntersectionObserver(([entry]) => {
      const isPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      chapterNav.classList.toggle('is-shown', isPassed);
    }).observe(pageIndex);

    const setCurrent = (id) => links.forEach((link) => {
      const isCurrent = link.hash === `#${id}`;
      link.classList.toggle('is-current', isCurrent);
      if (isCurrent) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    // The chapter crossing the middle of the screen is the one being read.
    const reading = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => setCurrent(entry.target.id));
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('[data-chapter]').forEach((chapter) => reading.observe(chapter));
  }

  // Intervention pages: the film shows the text of the step playing in large.
  document.querySelectorAll('[data-film]').forEach((film) => {
    const buttons = [...film.querySelectorAll('[data-film-step]')];
    const now = film.querySelector('.film__now');
    const num = film.querySelector('[data-film-num]');
    const title = film.querySelector('[data-film-title]');
    const text = film.querySelector('[data-film-text]');
    if (!buttons.length || !now) {
      return;
    }
    let changeTimer = 0;
    playSteps(film, {
      buttons,
      playButton: film.querySelector('[data-film-play]'),
      onShow: (step, isNew) => {
        const write = () => {
          num.textContent = String(step).padStart(2, '0');
          title.textContent = buttons[step - 1].dataset.title;
          text.textContent = buttons[step - 1].dataset.text;
          now.classList.remove('is-changing');
        };
        window.clearTimeout(changeTimer);
        if (isNew) {
          now.classList.add('is-changing');
          changeTimer = window.setTimeout(write, 160);
        } else {
          write();
        }
      },
    });
  });

  // ---------- Small things ----------
  // The main links: a small pupil glides under the link the pointer is on, and comes back to the
  // link of the page when the pointer leaves.
  document.querySelectorAll('.site-nav__list').forEach((list) => {
    const links = [...list.querySelectorAll('.nav-link')];
    const current = links.find((link) => link.getAttribute('aria-current') === 'page');
    const goTo = (link) => {
      if (!link) {
        list.style.setProperty('--nav-on', '0');
        return;
      }
      const x = link.offsetLeft + link.offsetWidth / 2 - 3;
      list.style.setProperty('--nav-x', `${x.toFixed(1)}px`);
      list.style.setProperty('--nav-on', '1');
    };
    if (finePointer.matches) {
      links.forEach((link) => link.addEventListener('pointerenter', () => goTo(link)));
      list.addEventListener('pointerleave', () => goTo(current));
    }
    links.forEach((link) => link.addEventListener('focus', () => goTo(link)));
    list.addEventListener('focusout', (event) => {
      if (!list.contains(event.relatedTarget)) {
        goTo(current);
      }
    });
    // The pupil starts under the link of the page, without travelling there.
    list.style.setProperty('--nav-on', '0');
    window.requestAnimationFrame(() => goTo(current));
  });

  // Buttons: a ring of light spreads from where they are pressed.
  if (!reduceMotion.matches) {
    document.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('.btn');
      if (!button) {
        return;
      }
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.setProperty('--rx', `${event.clientX - rect.left}px`);
      ripple.style.setProperty('--ry', `${event.clientY - rect.top}px`);
      button.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  // Footer: the letters of the name near the pointer rise and light up.
  const wordmark = document.querySelector('.footer-wordmark');
  if (wordmark && finePointer.matches && !reduceMotion.matches) {
    wordmark.querySelectorAll('span').forEach((word) => {
      const text = word.textContent;
      word.textContent = '';
      [...text].forEach((char) => {
        if (char === ' ') {
          word.append(' ');
          return;
        }
        const letter = document.createElement('span');
        letter.className = 'letter';
        letter.textContent = char;
        word.append(letter);
      });
    });
    const letters = [...wordmark.querySelectorAll('.letter')];
    const area = wordmark.closest('footer') || wordmark;
    let pending = 0;
    area.addEventListener('pointermove', (event) => {
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(() => {
        letters.forEach((letter) => {
          const rect = letter.getBoundingClientRect();
          const distance = event.clientX - (rect.left + rect.width / 2);
          letter.style.setProperty('--lift', Math.exp(-(distance * distance) / 18000).toFixed(3));
        });
      });
    });
    area.addEventListener('pointerleave', () => {
      window.cancelAnimationFrame(pending);
      letters.forEach((letter) => letter.style.setProperty('--lift', '0'));
    });
  }

  // The large button of the detailed journey: a soft light follows the pointer over it.
  if (finePointer.matches) {
    document.querySelectorAll('.journey-cta').forEach((button) => {
      let pending = 0;
      button.addEventListener('pointermove', (event) => {
        window.cancelAnimationFrame(pending);
        pending = window.requestAnimationFrame(() => {
          const rect = button.getBoundingClientRect();
          button.style.setProperty('--mx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
          button.style.setProperty('--my', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
        });
      });
    });
  }

  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  requestScrollTasks();
})();
