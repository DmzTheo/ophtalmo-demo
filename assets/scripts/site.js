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

  // Going to another page, the menu stays open until that page shows: it opens over the menu where
  // the browser has the cross-page transitions (site.css); in Firefox, the menu closes on its button
  // with the page left, over the top of the next page, where it is closed at once (crossPage(),
  // _build/build.js). Closed at the click, the menu was caught half closed: under the header of the
  // page in the transition, cut in the middle of its closing in Firefox. It is closed at once if the
  // visitor comes back to this page kept by the browser.
  menu?.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) {
      return;
    }
    const isNewTab = event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank';
    const isOtherPage = link.origin === window.location.origin && link.pathname !== window.location.pathname;
    const isLeaving = isOtherPage && !isNewTab;
    if (!isLeaving) {
      setMenuOpen(false);
    }
  });
  const closeMenuAtOnce = () => {
    menu.style.transition = 'none';
    setMenuOpen(false);
    // The closed menu is applied before its transition comes back.
    window.getComputedStyle(menu).getPropertyValue('clip-path');
    menu.style.removeProperty('transition');
  };
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !root.classList.contains('is-menu-open')) {
      return;
    }
    closeMenuAtOnce();
  });
  document.addEventListener('page:leave', () => {
    const isMenuOpen = root.classList.contains('is-menu-open');
    if (isMenuOpen) {
      closeMenuAtOnce();
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
  // A frame of scroll only writes. The scroll offset is read when the scroll event comes, and the
  // places of the elements are measured once, then again only when the page changes size (fonts,
  // an opened answer, a turned phone): a frame never makes the browser lay the page out again in the
  // middle of its work, which is what made the scroll stutter on phones.
  const progressBar = document.querySelector('[data-progress]');
  // Where the browser moves an element with the scroll by itself, the reading bar, the photos, the
  // heads of the pages and the drawings of the chapters are animations of the scroll (site.css); only
  // the sizes they need are written here.
  const isScrollDriven = window.CSS?.supports?.('animation-timeline: view()') === true;
  // (The thread of a table of contents follows an article that is not its parent: timeline-scope.)
  const hasViewInset = isScrollDriven && window.CSS.supports('view-timeline-inset: 40% 60%');
  const hasTimelineScope = hasViewInset && window.CSS.supports('timeline-scope: --a');
  const isGecko = window.CSS?.supports?.('-moz-appearance: none') === true || /\bFirefox\//.test(navigator.userAgent);
  const scrollTasks = [];
  // What decorates the scroll (the reading bar, photos and drawings drifting, reading lines) follows it
  // at every frame, after the tasks of the page; each writes only what changed.
  const decorTasks = [];
  // A style value is written only when it changed: written again, even unchanged, it can have the
  // browser work out the styles of the page again.
  const written = new WeakMap();
  const write = (element, property, value) => {
    if (!element) {
      return;
    }
    const values = written.get(element) || {};
    if (values[property] === value) {
      return;
    }
    values[property] = value;
    written.set(element, values);
    if (property.startsWith('--')) {
      element.style.setProperty(property, value);
    } else {
      element.style[property] = value;
    }
  };
  const measureTasks = [];
  // (The scroll offset is read once the page is laid out: read while the scripts start, it made the
  // browser lay the page out early.)
  const view = { y: 0, height: 0, width: 0, maxScroll: 0, pageHeight: 0 };
  let lastScrollY = view.y;
  // The header goes away as the visitor scrolls down, not when the browser puts the page back where
  // it was (back button, reload, which Firefox now always does for a page of the site: crossPage(),
  // _build/build.js): no scroll is the visitor's before a first wheel, touch, key or press.
  let hasVisitorActed = false;
  const noteVisitor = () => {
    hasVisitorActed = true;
  };
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) => window.addEventListener(type, noteVisitor, { capture: true, once: true, passive: true }));
  // The top of an element in the page, as laid out (the transforms it may carry do not count).
  const pageTop = (element) => {
    let top = 0;
    for (let node = element; node; node = node.offsetParent) {
      top += node.offsetTop;
    }
    return top;
  };

  if (!isScrollDriven) {
    decorTasks.push(() => {
      const { y, maxScroll } = view;
      write(progressBar, '--progress', maxScroll > 0 ? (y / maxScroll).toFixed(4) : '0');
    });
  }
  scrollTasks.push(() => {
    const { y } = view;
    header.classList.toggle('is-scrolled', y > 8);

    const delta = y - lastScrollY;
    const isNearTop = y < 240;
    const isHidden = header.classList.contains('is-hidden');
    if (delta > 6 && !isHidden && !isNearTop && hasVisitorActed) {
      const isMenuOpen = root.classList.contains('is-menu-open');
      const hasFocusInside = header.contains(document.activeElement) && document.activeElement !== document.body;
      const hasOpenDropdown = Boolean(header.querySelector('.dropdown__menu:not([hidden])'));
      if (!isMenuOpen && !hasFocusInside && !hasOpenDropdown) {
        header.classList.add('is-hidden');
      }
    } else if ((delta < -6 || isNearTop) && isHidden) {
      header.classList.remove('is-hidden');
    }
    if (Math.abs(delta) > 6) {
      lastScrollY = y;
    }
  });

  let isTicking = false;
  // The scroll offset is read once a frame, here: read at each scroll event, it made Firefox bring
  // the styles of the page up to date at once, in the middle of the event. Where the decorations
  // follow the scroll by themselves (other browsers than Firefox), what is left here (the header, the
  // last reveals, the steps of the journeys) is brought up to date ten times a second during a scroll
  // and once more at its end: reading the scroll offset at each frame made Chrome work out the whole
  // page again at every frame.
  const scrollPace = () => (isScrollDriven && !isGecko && !decorTasks.length ? 100 : 0);
  let lastRun = -Infinity;
  let pending = 0;
  const runScrollTasks = () => {
    isTicking = false;
    lastRun = performance.now();
    view.y = window.scrollY;
    scrollTasks.forEach((task) => task());
    decorTasks.forEach((task) => task());
  };
  const requestScrollTasks = () => {
    if (isTicking || pending) {
      return;
    }
    const pace = scrollPace();
    const wait = pace && lastRun + pace - performance.now();
    if (wait > 0) {
      pending = window.setTimeout(() => {
        pending = 0;
        requestScrollTasks();
      }, wait);
      return;
    }
    isTicking = true;
    window.requestAnimationFrame(runScrollTasks);
  };
  let isMeasured = false;
  const measure = () => {
    if (!isMeasured) {
      // The page may open scrolled (a link to a section, a reload): the header stays as it is.
      isMeasured = true;
      lastScrollY = window.scrollY;
    }
    view.height = window.innerHeight;
    view.width = window.innerWidth;
    view.pageHeight = root.scrollHeight;
    view.maxScroll = Math.max(0, view.pageHeight - view.height);
    measureTasks.forEach((task) => task());
    requestScrollTasks();
  };
  window.addEventListener('scroll', requestScrollTasks, { passive: true });
  // Left in Firefox, the page closes over the top of the next one (crossPage(), _build/build.js): its
  // header shows as it will there, at the top of a page. Back on this page kept by the browser, the
  // header is again as the scroll has it.
  document.addEventListener('page:leave', () => header.classList.remove('is-scrolled', 'is-hidden'));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      requestScrollTasks();
    }
  });
  // A phone's bar of address folding away as the page scrolls only changes the height of the screen:
  // nothing is measured again (the places in the page stay the same). A new width measures all.
  window.addEventListener('resize', () => {
    if (window.innerWidth === view.width) {
      view.height = window.innerHeight;
      view.maxScroll = Math.max(0, view.pageHeight - view.height);
      requestScrollTasks();
      return;
    }
    measure();
  });
  // The page changing size (and the first layout) measures again; the observer reports after the
  // layout, when reading it costs nothing.
  if ('ResizeObserver' in window) {
    new ResizeObserver(measure).observe(root);
  } else {
    window.addEventListener('load', measure);
    window.requestAnimationFrame(measure);
  }

  // Photos drift slightly inside their frame while scrolling (only those on screen are updated).
  if (!reduceMotion.matches && isScrollDriven) {
    const frames = [...document.querySelectorAll('[data-parallax]')];
    measureTasks.push(() => {
      const heights = frames.map((frame) => frame.offsetHeight);
      frames.forEach((frame, i) => write(frame, '--pk', (heights[i] / view.height).toFixed(3)));
    });
  } else if (!reduceMotion.matches && 'ViewWatcher' in window) {
    const frames = [...document.querySelectorAll('[data-parallax]')].map((frame) => ({ frame, image: frame.querySelector('img') || frame, top: 0, height: 0 }));
    const visibleFrames = new Set();
    const frameObserver = new ViewWatcher((entries) => {
      entries.forEach((entry) => {
        const item = frames.find((each) => each.frame === entry.target);
        if (entry.isIntersecting) {
          visibleFrames.add(item);
        } else {
          visibleFrames.delete(item);
        }
      });
      requestScrollTasks();
    });
    frames.forEach(({ frame }) => frameObserver.observe(frame));
    measureTasks.push(() => frames.forEach((item) => {
      item.top = pageTop(item.frame);
      item.height = item.frame.offsetHeight;
    }));
    decorTasks.push(() => {
      visibleFrames.forEach(({ image, top, height }) => {
        const progress = clamp((top - view.y + height / 2 - view.height / 2) / view.height, -1, 1);
        write(image, '--py', `${(-6 + progress * 6).toFixed(2)}%`);
      });
    });
  }

  // Heads of the pages: their background (drawing or living scene) goes up more slowly than the
  // page, as if further away.
  const headLayers = [...document.querySelectorAll('.page-head > :is(.drawing, .living), .glasses-hero > .drawing')].map((layer) => ({ layer, top: 0, height: 0 }));
  if (headLayers.length && !reduceMotion.matches && !isScrollDriven) {
    measureTasks.push(() => headLayers.forEach((item) => {
      item.top = pageTop(item.layer.parentElement);
      item.height = item.layer.parentElement.offsetHeight;
    }));
    decorTasks.push(() => {
      headLayers.forEach(({ layer, top, height }) => {
        if (view.y < top + height) {
          write(layer, 'translate', `0 ${(Math.max(0, view.y - top) * 0.35).toFixed(1)}px`);
        }
      });
    });
  }

  // Surgeries page: the large drawing behind each chapter drifts with the scroll (drift, from -1 to 1
  // as it crosses the screen) and, under a mouse, leans away from the pointer.
  const atmos = [...document.querySelectorAll('[data-atmo]')];
  if (atmos.length && !reduceMotion.matches && isScrollDriven) {
    measureTasks.push(() => {
      const heights = atmos.map((atmo) => atmo.offsetHeight);
      atmos.forEach((atmo, i) => write(atmo, '--ak', (heights[i] / view.height).toFixed(3)));
    });
  }
  if (atmos.length && !reduceMotion.matches && !isScrollDriven && 'ViewWatcher' in window) {
    const shownAtmos = new Set();
    const atmoBoxes = new Map(atmos.map((atmo) => [atmo, { top: 0, height: 0 }]));
    const atmoObserver = new ViewWatcher((entries) => {
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
    measureTasks.push(() => atmoBoxes.forEach((box, atmo) => {
      box.top = pageTop(atmo);
      box.height = atmo.offsetHeight;
      box.spin = parseFloat(getComputedStyle(atmo).getPropertyValue('--spin')) || 0;
    }));
    decorTasks.push(() => {
      shownAtmos.forEach((atmo) => {
        // Written as they are: a variable on the drawing would have the browser restyle all its lines.
        const { top, height, spin } = atmoBoxes.get(atmo);
        const drift = clamp((top - view.y + height / 2 - view.height / 2) / view.height, -1.5, 1.5);
        write(atmo, 'translate', `0 ${(drift * -120).toFixed(1)}px`);
        write(atmo, 'rotate', `${(drift * spin).toFixed(2)}deg`);
      });
    });
  }
  // Under a mouse, the drawing leans away from the pointer.
  if (atmos.length && !reduceMotion.matches && finePointer.matches) {
    atmos.forEach((atmo) => {
      const area = atmo.parentElement;
      let pending = 0;
      area.addEventListener('pointermove', (event) => {
        window.cancelAnimationFrame(pending);
        pending = window.requestAnimationFrame(() => {
          const rect = area.getBoundingClientRect();
          const ax = (event.clientX - rect.left) / rect.width - 0.5;
          const ay = (event.clientY - rect.top) / rect.height - 0.5;
          atmo.style.transform = `translate(${(ax * -46).toFixed(1)}px, ${(ay * -46).toFixed(1)}px)`;
        });
      });
      area.addEventListener('pointerleave', () => {
        window.cancelAnimationFrame(pending);
        atmo.style.transform = 'translate(0px, 0px)';
      });
    });
  }

  // ---------- Reveals: as the element reaches the screen, it rises into place by itself ----------
  // A little before it reaches the screen: a phone shows the page scrolled before the script hears
  // of it. Elements arriving together follow each other (40 ms apart, three at most) unless the page
  // sets their delay.
  const REVEAL_STAGGER = 0.04;
  const REVEAL_STAGGER_MAX = 3;
  const revealItems = [...document.querySelectorAll('[data-reveal], .footer-wordmark')];
  const revealAll = () => revealItems.forEach((item) => item.classList.add('is-visible'));
  // What the first screen shows when the script comes stays as it was painted: nothing on it waits
  // for the script to appear (titles, photos and parts of the page alike). What lies further is
  // hidden from then on, out of sight, and revealed as it comes (site.css: .reveals-ready).
  const isOnFirstScreen = (element) => element.getBoundingClientRect().top < window.innerHeight;
  if ('ViewWatcher' in window && !reduceMotion.matches) {
    // Sorted at the first frame, once the page is laid out (read while the script starts, the places
    // had the browser lay the page out early).
    window.requestAnimationFrame(() => {
      revealItems.filter(isOnFirstScreen).forEach((item) => item.classList.add('is-visible'));
      root.classList.add('reveals-ready');
      revealItems.forEach((item) => revealObserver.observe(item));
    });
    const reveal = (items) => items.forEach((item, index) => {
      const hasOwnDelay = item.style.getPropertyValue('--reveal-delay') !== '';
      if (!hasOwnDelay) {
        item.style.setProperty('--reveal-delay', `${(Math.min(index, REVEAL_STAGGER_MAX) * REVEAL_STAGGER).toFixed(2)}s`);
      }
      item.classList.add('is-visible');
      revealObserver.unobserve(item);
    });
    const revealObserver = new ViewWatcher((entries) => {
      reveal(entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target));
    }, { rootMargin: '0px 0px 6% 0px', threshold: 0 });
    // At the very end of the page, what is still waiting at the bottom of the screen shows too.
    scrollTasks.push(() => {
      const isAtEnd = view.y >= view.maxScroll - 2;
      if (isAtEnd) {
        reveal(revealItems.filter((item) => !item.classList.contains('is-visible') && item.getBoundingClientRect().top < view.height));
      }
    });
  } else {
    revealAll();
  }

  // Words, letters and parts of the hero that have come into place keep their last look without
  // their animation (.is-arrived): an animation held at its end keeps each of them on a layer. A
  // word coming into focus has arrived when its sharp layer has; an opened photo, when its frame and
  // its picture have.
  const ARRIVALS = new Set(['word-in', 'hero-in', 'aperture-disc', 'aperture-disc-picture', 'aperture-band', 'aperture-band-picture']);
  document.addEventListener('animationend', (event) => {
    if (event.animationName === 'word-sharp') {
      event.target.parentElement.classList.add('is-arrived');
    } else if (ARRIVALS.has(event.animationName)) {
      event.target.classList.add('is-arrived');
    }
  });

  // ---------- Titles focus word by word; photos open like a pupil ----------
  // Each kind plays once, as it reaches the screen.
  const playOnce = (selector, className, options) => {
    const items = [...document.querySelectorAll(selector)];
    if (!('ViewWatcher' in window) || reduceMotion.matches) {
      items.forEach((item) => item.classList.add(className));
      return;
    }
    const observer = new ViewWatcher((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        entry.target.classList.add(className);
        observer.unobserve(entry.target);
      });
    }, options);
    items.forEach((item) => observer.observe(item));
  };
  // Each word (each letter of the title of the home page, each line of the waiting team photo) gets
  // a blurred copy of itself over it: the copy shows first, then the sharp word while the copy goes
  // (site.css). Only opacities change, which the screen does by itself; a blur that changes is drawn
  // again by the browser at every frame. A title that has already begun when the script comes (the
  // title of the page and that of the home page play from the first paint) keeps its entrance,
  // without copies; another title already on the first screen stays as it was painted.
  const FOCUS_HOLDERS = '[data-focus] .w, .hero__title-main .letter, .team-photo__title, .team-photo__text';
  const hasBegun = (holder) => holder.getAnimations().some((animation) => animation.effect?.getComputedTiming().progress > 0);
  const addFocusCopy = (holder) => {
    const sharp = document.createElement('span');
    sharp.className = 'focus__sharp';
    sharp.append(...holder.childNodes);
    const soft = sharp.cloneNode(true);
    soft.className = 'focus__soft';
    soft.setAttribute('aria-hidden', 'true');
    holder.append(sharp, soft);
    holder.classList.add('has-focus-copy');
  };
  if ('ViewWatcher' in window && !reduceMotion.matches) {
    const focusGroups = new Map();
    document.querySelectorAll(FOCUS_HOLDERS).forEach((holder) => {
      const group = holder.closest('[data-focus], .hero__title-main') || holder;
      focusGroups.set(group, [...(focusGroups.get(group) || []), holder]);
    });
    // Sorted at the first frame, once the page is laid out and its first animations have begun
    // (asked while the script starts, places and animations had the browser work out the whole page
    // early: over a second on a slow computer).
    window.requestAnimationFrame(() => focusGroups.forEach((holders, group) => {
      const isLaterTitle = group.matches('[data-focus]') && !group.closest('.page-head');
      if (isLaterTitle && isOnFirstScreen(group)) {
        group.classList.add('is-focused');
        holders.forEach((holder) => holder.classList.add('is-arrived'));
      } else if (!hasBegun(holders[0])) {
        // (The first word begins first: asking it alone spares asking the animations of every word.)
        holders.forEach(addFocusCopy);
      }
    }));
  }
  playOnce('[data-focus]', 'is-focused', { rootMargin: '0px 0px 3% 0px' });

  // Photos open as soon as they reach the screen, like a pupil widening or like eyelids (site.css):
  // the picture is held in a frame of its own that grows while the picture grows back by the inverse
  // amount, so that it seems to stay in place; only scales change, which the screen does by itself
  // (a cut that changes is drawn again by the browser at every frame). A disc a little larger than
  // the diagonal of the photo cuts nothing once open. A photo already on the first screen stays as
  // it was painted; only the photos whose picture already fills their frame by itself
  // ([data-parallax]) get the opening frame.
  const canOpen = 'ViewWatcher' in window && !reduceMotion.matches;
  const apertures = canOpen ? [...document.querySelectorAll('[data-aperture][data-parallax]')].filter((photo) => !isOnFirstScreen(photo)) : [];
  apertures.forEach((photo) => {
    const picture = photo.querySelector(':scope > picture');
    if (picture) {
      const frame = document.createElement('span');
      frame.className = 'aperture';
      picture.replaceWith(frame);
      frame.append(picture);
    }
  });
  // (All the sizes are read, then all written: read and written in turn, each photo had the browser
  // lay the page out again. Measured once the page is laid out, with the other places (measure).)
  const sizeApertures = () => {
    const sizes = apertures.map((photo) => {
      // The size as laid out, to the fraction of a pixel (its tilt does not count).
      const { width: cssWidth, height: cssHeight } = getComputedStyle(photo);
      return [parseFloat(cssWidth), parseFloat(cssHeight)];
    });
    apertures.forEach((photo, i) => {
      const [width, height] = sizes[i];
      photo.style.setProperty('--aperture-w', `${width}px`);
      photo.style.setProperty('--aperture-h', `${height}px`);
      photo.style.setProperty('--aperture-d', `${Math.ceil(Math.hypot(width, height) * 1.06)}px`);
    });
  };
  measureTasks.push(sizeApertures);
  playOnce('[data-aperture]', 'is-open', { rootMargin: '0px 0px 0px 0px' });
  // Home: the line joining the three steps of the consultation draws itself; on the intervention
  // pages, the line over the steps of the journey.
  playOnce('.visit__steps', 'is-drawn', { threshold: 0.35 });
  playOnce('.itinerary', 'is-drawn', { rootMargin: '0px 0px -10% 0px' });

  // ---------- Small things drawn or rolled into place as they come on screen ----------
  // Labels draw their line; decorative icons trace their lines; big step numbers roll digit after
  // digit (each digit in its own clip; screen readers keep the plain number).
  const DRAWN_ICONS = '.visit__icon, .care-card__icon, .exam__icon, .team-role__icon, .after__icon, .team-photo__icon, .doc__icon';
  document.querySelectorAll(DRAWN_ICONS).forEach((holder) => holder.setAttribute('data-draw', ''));
  playOnce('[data-draw]', 'is-traced', { rootMargin: '0px 0px -10% 0px' });
  playOnce('.label', 'is-in', { rootMargin: '0px 0px -6% 0px' });
  playOnce('[data-atmo]', 'is-drawn', { threshold: 0.12 });
  // Once a large drawing of the surgeries page has drawn itself, it keeps its last look without its
  // animations (.is-settled): held at their end, they kept hundreds of layers alive in the browser.
  document.querySelectorAll('[data-atmo]').forEach((atmo) => {
    // Only the animations of the lines count: the drift of the drawing itself follows the scroll and
    // never ends while it is on screen (waited for, the drawing never settled).
    const settle = () => window.requestAnimationFrame(() => {
      const drawing = atmo.getAnimations({ subtree: true }).filter((animation) => animation instanceof CSSAnimation && animation.effect?.target !== atmo);
      Promise.allSettled(drawing.map((animation) => animation.finished)).then(() => atmo.classList.add('is-settled'));
    });
    if (atmo.classList.contains('is-drawn')) {
      settle();
      return;
    }
    const watch = new MutationObserver(() => {
      if (atmo.classList.contains('is-drawn')) {
        watch.disconnect();
        settle();
      }
    });
    watch.observe(atmo, { attributes: true, attributeFilter: ['class'] });
  });
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
    // (A new width only: a phone's bar of address folding away changes the height alone.)
    let fitWidth = 0;
    window.addEventListener('resize', () => {
      if (window.innerWidth !== fitWidth) {
        fitWidth = window.innerWidth;
        refit();
      }
    });
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
    if (!('ViewWatcher' in window)) {
      drawing.classList.add('is-playing');
      return;
    }
    const observer = new ViewWatcher((entries) => {
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
  if (heroStage && 'ViewWatcher' in window) {
    new ViewWatcher(([entry]) => {
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
    const lightLayer = figure?.querySelector('[data-lamp-light]');
    if (!svg || !lightLayer) {
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
    let active = null;
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
    // height of the light; the floaters follow late (the stylesheet). The turn is given to the parts
    // that turn, not to the whole drawing, and as their transform itself: a custom property set on
    // them would make the browser work out again everything inside them.
    const globe = figure.querySelector('.lamp__globe');
    const turning = [...figure.querySelectorAll('.lamp__globe, .lamp__markers, .lamp-floaters')];
    let saccadeTimer = 0;
    const moveNowAndThen = () => {
      window.clearTimeout(saccadeTimer);
      if (globe && view.classList.contains('is-alive')) {
        saccadeTimer = window.setTimeout(() => {
          const towardLight = ((SIZE / 2 - position[1]) / REACH) * 1.4;
          const turn = `rotate(${(towardLight + (Math.random() * 2 - 1) * 1.6).toFixed(2)}deg)`;
          turning.forEach((part) => {
            part.style.transform = turn;
          });
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
      // The gesture of the eyelids is a slow double blink, played on screen only (played as the page
      // loaded, far below, it reshaped the lids and their lashes at every frame of the arrival).
      const isEyelids = spot?.item.dataset.spot === 'paupieres';
      if (isEyelids && isOnScreen) {
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
      gaze.style.transform = `translate(${(dx * 0.1).toFixed(2)}px, ${(dy * 0.06).toFixed(2)}px)`;
      catchlight?.style.setProperty('transform', `translate(${(dx * 0.05).toFixed(2)}px, ${(dy * 0.05).toFixed(2)}px)`);
    };

    // The light goes where it is sent: the stylesheet glides it there, and the gaze with it
    // (transitions the screen makes by itself; a script moving them at each frame made the browser
    // draw the eye again at each frame). The subject under the light is shown at once.
    const light = () => {
      lightLayer.style.setProperty('--bx', position[0].toFixed(1));
      lightLayer.style.setProperty('--by', position[1].toFixed(1));
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

    const aim = (point) => {
      position = point;
      light();
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
      // Off screen until now: the light jumps to the first subject (no glide).
      figure.classList.add('is-jumping');
      position = [...spots[0].at];
      light();
      getComputedStyle(lightLayer.firstElementChild).translate;
      figure.classList.remove('is-jumping');
    };
    if ('ViewWatcher' in window) {
      new ViewWatcher((entries) => {
        const wasOnScreen = isOnScreen;
        isOnScreen = entries[0].isIntersecting;
        if (isOnScreen && !wasOnScreen && !isPaused) {
          startTour();
        }
        runTour();
        updateLife();
      }, { threshold: 0.35 }).observe(figure);
      // Far from the screen (half a screen away, .is-far, from the start), nothing in the drawing
      // has an animation at all: paused, they would keep their layers, which every frame of the
      // rest of the page has to go through.
      new ViewWatcher((entries) => {
        view.classList.toggle('is-far', !entries[0].isIntersecting);
      }, { rootMargin: '50%' }).observe(figure);
    }
    light();
  });

  // ---------- Glasses: a lens sharpens the reading chart ----------
  document.querySelectorAll('[data-chart]').forEach((chart) => {
    const blur = chart.querySelector('.chart__layer--blur');
    const sharp = chart.querySelector('.chart__layer--sharp');
    const lens = chart.querySelector('.chart__lens');
    const state = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    // The sizes of the chart, measured when it changes size rather than at every frame.
    const box = { width: 0, height: 0, radius: 0 };
    let isRunning = false;
    let pointerInside = false;
    let startTime = performance.now();

    // The lens goes to its place and its letters the other way, by transforms written as such (a
    // custom property would have the browser work out all the letters again at every frame).
    const paint = () => {
      const left = (state.x - box.radius).toFixed(1);
      const top = (state.y - box.radius).toFixed(1);
      lens.style.transform = `translate(${left}px, ${top}px)`;
      sharp.style.transform = `translate(${-left}px, ${-top}px)`;
    };
    const measureChart = () => {
      box.width = chart.clientWidth;
      box.height = chart.clientHeight;
      box.radius = clamp(box.width * 0.17, 62, 104);
      const diameter = `${(box.radius * 2).toFixed(1)}px`;
      lens.style.width = diameter;
      lens.style.height = diameter;
      // The sharp letters in the place and width of the blurred ones.
      const chartBox = chart.getBoundingClientRect();
      const blurBox = blur.getBoundingClientRect();
      sharp.style.left = `${(blurBox.left - chartBox.left).toFixed(2)}px`;
      sharp.style.top = `${(blurBox.top - chartBox.top).toFixed(2)}px`;
      sharp.style.width = `${blurBox.width.toFixed(2)}px`;
    };

    const restPosition = () => ({ x: box.width * 0.32, y: box.height * 0.24 });
    const placeLens = () => {
      measureChart();
      Object.assign(state, restPosition());
      Object.assign(target, restPosition());
      paint();
    };
    // Measured once the browser has laid out the page (its first report): measured at once, while the
    // scripts were starting, it had the browser lay the whole page out early, a few hundred
    // milliseconds on a phone.
    if ('ResizeObserver' in window) {
      let isStarted = false;
      new ResizeObserver(() => {
        if (!isStarted) {
          isStarted = true;
          placeLens();
          return;
        }
        measureChart();
        paint();
      }).observe(chart);
    } else {
      placeLens();
    }

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
        target.x = box.width * (0.42 + Math.sin(t * 0.55) * 0.26);
        target.y = box.height * (0.5 + Math.sin(t * 0.21) * 0.32);
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
    if ('ViewWatcher' in window) {
      new ViewWatcher((entries) => {
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
    const labels = [...trial.querySelectorAll('.trial__degs--cyl .trial__deg')];
    const shines = [...trial.querySelectorAll('.trial__shine')];
    // The angle is given to the parts that turn, not to the whole frame.
    const turning = [...trial.querySelectorAll('.trial__axis, .trial__marker')];
    const CYLINDER = [595, 222];
    let axis = 45;
    let goal = 45;
    let frame = 0;
    let lastTime = 0;
    // The axis read is written into its text itself, and only when it changes: a new text node at
    // every frame made the browser work out again the page's rules that look inside it (:has()).
    const readoutText = readout.firstChild;
    let shownAxis = -1;
    // (Turns, leans and glints are written as such, not through custom properties: one written on
    // the frame made the browser work out all its lines again, at every move of the pointer.)
    const paint = () => {
      const angle = `${(45 - axis).toFixed(2)}deg`;
      turning.forEach((part) => {
        part.style.rotate = angle;
      });
      const shown = Math.round(((axis % 180) + 180) % 180);
      const isNewAxis = shown !== shownAxis;
      if (isNewAxis) {
        shownAxis = shown;
        readoutText.data = `Axe ${shown}°`;
        const nearest = Math.round(shown / 30) * 30;
        labels.forEach((label) => label.classList.toggle('is-near', Number(label.dataset.deg) === nearest));
      }
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
      trial.style.transform = `perspective(1400px) rotateX(${(-ny * 8).toFixed(2)}deg) rotateY(${(nx * 10).toFixed(2)}deg)`;
      shines.forEach((shine) => {
        shine.style.transform = `translate(${(-nx * 26).toFixed(1)}px, ${(-ny * 22).toFixed(1)}px)`;
      });
      if (!frame) {
        lastTime = performance.now();
        frame = window.requestAnimationFrame(turn);
      }
    });
    area.addEventListener('pointerleave', () => {
      trial.style.removeProperty('transform');
      shines.forEach((shine) => {
        shine.style.transform = 'translate(0px, 0px)';
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
    if (reduceMotion.matches || !('ViewWatcher' in window) || !goal) {
      return;
    }
    number.textContent = '0';
    const observer = new ViewWatcher(([entry]) => {
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
    // The blur of each window and the turn of the dials are written on them as such: a custom
    // property on the game made the browser work out its 250 elements again at each choice.
    const charts = lenses.map((lens) => lens.querySelector('.phoropter__chart'));
    const dials = [...game.querySelectorAll('.phoropter__dial')];

    const paint = () => {
      charts.forEach((chart, index) => {
        chart.style.filter = `blur(${Math.min(9, (offer[index] / STEP) * BLUR_PER_STEP).toFixed(2)}px)`;
      });
      const done = clamp(Math.round((START - current) / STEP), 0, rounds.length);
      rounds.forEach((round, index) => round.classList.toggle('is-done', index < done));
    };
    const click = () => {
      turn += 1;
      dials.forEach((dial) => {
        dial.style.transform = `rotate(${turn * 40}deg)`;
      });
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
  if (tocLinks.length && 'ViewWatcher' in window) {
    const byId = new Map(tocLinks.map((link) => [link.getAttribute('href').slice(1), link]));
    const tocObserver = new ViewWatcher((entries) => {
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
    const article = { top: 0, height: 1, list: 0 };
    const list = toc.querySelector('ol');
    measureTasks.push(() => {
      article.top = pageTop(articleBody);
      article.height = articleBody.offsetHeight || 1;
      article.list = list?.offsetHeight || 0;
      if (hasTimelineScope) {
        write(list, '--list-h', `${article.list}px`);
      }
    });
    if (!hasTimelineScope) {
      decorTasks.push(() => {
        const read = clamp((view.height * 0.4 - (article.top - view.y)) / article.height, 0, 1);
        write(toc, '--read', read.toFixed(3));
        // The point of the reader, in pixels down the list (moved by translate, see the stylesheet).
        write(toc, '--read-y', `${(read * article.list).toFixed(1)}px`);
      });
    }
  }

  // ---------- Detailed journeys: the line fills up to the end of the last step ----------
  document.querySelectorAll('[data-journey]').forEach((journey) => {
    const fill = journey.querySelector('.journey__line span');
    const steps = [...journey.querySelectorAll('.journey__step')];
    // Each question of a step is a station on the line, lit once the line has reached it.
    const stations = [...journey.querySelectorAll('.qa')];
    const places = { top: 0, height: 1, steps: [], stations: [] };
    measureTasks.push(() => {
      places.top = pageTop(journey);
      places.height = journey.offsetHeight || 1;
      places.steps = steps.map(pageTop);
      places.stations = stations.map(pageTop);
    });
    (hasViewInset ? scrollTasks : decorTasks).push(() => {
      // The line reaches the point at 45 % of the height of the screen (in the page).
      const anchor = view.y + view.height * 0.45;
      if (!hasViewInset) {
        write(fill, '--fill', clamp((anchor - places.top) / places.height, 0, 1).toFixed(4));
      }
      let current = -1;
      places.steps.forEach((top, i) => {
        if (top < anchor) {
          current = i;
        }
      });
      steps.forEach((step, i) => {
        step.classList.toggle('is-current', i === current);
        step.classList.toggle('is-done', i < current);
      });
      stations.forEach((station, i) => station.classList.toggle('is-passed', places.stations[i] + 24 < anchor));
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
    // The light on the glass of the loupe follows the pointer on an element of its own, without
    // children (see the stylesheet).
    const glare = item.querySelector('.loupe__glare');
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
        glare?.style.setProperty('--gx', `${(clamp(x, 0, 1) * 100).toFixed(1)}%`);
        glare?.style.setProperty('--gy', `${(clamp(y, 0, 1) * 100).toFixed(1)}%`);
      });
    });
    area.addEventListener('pointerleave', () => {
      window.cancelAnimationFrame(pending);
      item.classList.remove('is-tilting');
      ['--rx', '--ry'].forEach((name) => item.style.removeProperty(name));
      ['--gx', '--gy'].forEach((name) => glare?.style.removeProperty(name));
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
    schema.style.setProperty('--step-duration', `${duration}ms`);
    // Far from the screen (half a screen away, .is-far), what loops in the drawing has no animation
    // at all: paused, it kept its layers, which every frame of the rest of the page went through.
    if ('ViewWatcher' in window) {
      new ViewWatcher((entries) => {
        schema.classList.toggle('is-far', !entries[0].isIntersecting);
      }, { rootMargin: '50%' }).observe(schema);
    }
    const show = (next, isChosen = false) => {
      const isSameStep = next === step;
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
      // The bar of the step fills from the start: a new step starts its own bar; the same step shown
      // again (the schema back on screen, the play button) has its bar started again, put back at
      // the next frame (the browser has to see it stopped first; making it lay the page out at once
      // for that happened as the schemas crossed the screen).
      if (isSameStep && isPlaying && schema.classList.contains('is-timing')) {
        schema.classList.remove('is-timing');
        window.requestAnimationFrame(() => schema.classList.toggle('is-timing', isPlaying));
        return;
      }
      schema.classList.toggle('is-timing', isPlaying);
    };

    // Driven schemas (surgeries page): the page chooses the step, from the scroll.
    if (schema.hasAttribute('data-driven')) {
      schema.addEventListener('schema:goto', (event) => show(event.detail.step));
      show(1);
      if ('ViewWatcher' in window) {
        new ViewWatcher((entries) => schema.classList.toggle('is-visible', entries[0].isIntersecting)).observe(schema);
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
      } else {
        // Off screen, the bars and rings of the step stop with the timer.
        root.classList.remove('is-timing');
      }
      schedule();
    };

    if ('ViewWatcher' in window) {
      new ViewWatcher((entries) => updateVisibility(entries[0].isIntersecting), { threshold: 0.35 }).observe(schema);
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
      // A plate chosen by the visitor comes into focus (site.css); the first one stays as it was painted.
      if (remember) {
        atlas.classList.add('is-browsed');
      }
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
    // The length of a step is read once, as the steps first come on screen: read as the script
    // started, it made the browser work out the style of the whole page there and then, once for
    // each chapter.
    let duration = 0;
    const readDuration = () => {
      duration = duration || parseFloat(getComputedStyle(root).getPropertyValue('--film-duration')) * 1000 || 3000;
    };
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
      // The bar of the step fills again from the start: a new step starts its own bar; the same
      // step shown again has it started again, put back at the next frame (making the browser lay
      // the page out at once, to see it stopped, was done here as chapters crossed the screen).
      const isTiming = isPlaying && isVisible;
      if (!isNew && isTiming && root.classList.contains('is-timing')) {
        root.classList.remove('is-timing');
        window.requestAnimationFrame(() => root.classList.toggle('is-timing', isPlaying && isVisible));
        return;
      }
      root.classList.toggle('is-timing', isTiming);
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

    if ('ViewWatcher' in window) {
      new ViewWatcher((entries) => {
        isVisible = entries[0].isIntersecting;
        if (isVisible) {
          readDuration();
        }
        show(step);
        schedule();
      }, { threshold: 0.35 }).observe(root);
    } else {
      isVisible = true;
      readDuration();
    }
    setPlaying(isPlaying);
  };

  // Surgeries page: the list of the chapter shows every step, the one playing stands out (on phones
  // its text is shown under the drawing).
  // On a wide screen, the text of the step playing opens under its title by translate (site.css):
  // the heights it needs are measured here, once laid out, and again when they change (fonts, text
  // enlarged, a resized window), never while the steps play.
  const wideSteps = window.matchMedia('(min-width: 1200px)');
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
    const list = chapter.querySelector('.chapter__steps');
    const items = list ? [...list.children] : [];
    const texts = items.map((item) => item.querySelector('.chapter-step__more'));
    const measureSteps = () => {
      if (!wideSteps.matches || !items.length) {
        return;
      }
      // (All read, then all written.) A piece of rail runs from 3.4rem under the top of its step to
      // 0.3rem under its bottom (site.css).
      const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
      const heights = texts.map((text) => text?.offsetHeight || 0);
      const rails = items.map((item) => item.offsetHeight - 3.1 * rem);
      heights.forEach((height, i) => list.style.setProperty(`--h${i + 1}`, `${height}px`));
      list.style.setProperty('--h-max', `${Math.max(...heights)}px`);
      items.forEach((item, i) => {
        item.style.setProperty('--own', `${heights[i]}px`);
        item.style.setProperty('--grow', rails[i] > 0 ? ((rails[i] + heights[i]) / rails[i]).toFixed(4) : '1');
      });
    };
    if (list && 'ResizeObserver' in window) {
      const sizes = new ResizeObserver(measureSteps);
      // (Not the list itself: its room below, written here, would report it again in the same frame.)
      [...items, ...texts.filter(Boolean)].forEach((element) => sizes.observe(element));
      wideSteps.addEventListener('change', measureSteps);
    }
  });

  // Surgeries page: once the index of the page is passed, a compact index stays at the top and
  // shows the chapter being read.
  const chapterNav = document.querySelector('[data-chapter-nav]');
  const pageIndex = document.querySelector('.bloc-index');
  if (chapterNav && pageIndex && 'ViewWatcher' in window) {
    const links = [...chapterNav.querySelectorAll('a[href^="#"]')];
    new ViewWatcher(([entry]) => {
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
    const reading = new ViewWatcher((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => setCurrent(entry.target.id));
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('[data-chapter]').forEach((chapter) => reading.observe(chapter));
  }

  // The chapters far from the screen are left out of the work of the page, with a height only
  // reserved (content-visibility, site.css): before going to one of them (a link of the page, or the
  // address of a chapter), they are all laid out, so that the page arrives where the chapter really
  // is (with the reserved heights it arrived some 80 pixels off); once there, they are left out again.
  const chapters = [...document.querySelectorAll('.chapters .chapter')];
  if (chapters.length) {
    let release = 0;
    const leaveOut = () => {
      window.clearTimeout(release);
      chapters.forEach((chapter) => chapter.style.removeProperty('content-visibility'));
    };
    const layOut = () => {
      chapters.forEach((chapter) => chapter.style.setProperty('content-visibility', 'visible'));
      window.clearTimeout(release);
      window.addEventListener('scrollend', leaveOut, { once: true });
      release = window.setTimeout(leaveOut, 3000);
    };
    const isChapterTarget = (hash) => Boolean(hash && document.getElementById(decodeURIComponent(hash.slice(1)))?.closest('.chapters'));
    if (isChapterTarget(window.location.hash)) {
      layOut();
    }
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href^="#"]');
      if (!link || !isChapterTarget(link.hash)) {
        return;
      }
      layOut();
      // A chapter laid out for the first time grows a frame later, once its open step is measured
      // (above): the page then goes again to the place of the chapter, now known.
      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }));
    });
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
        // All the places read before any letter changes: each change would have the next reading
        // work out the styles again.
        const centres = letters.map((letter) => {
          const rect = letter.getBoundingClientRect();
          return rect.left + rect.width / 2;
        });
        letters.forEach((letter, index) => {
          const distance = event.clientX - centres[index];
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
