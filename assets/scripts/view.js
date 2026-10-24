// What part of the page is on screen, for the scripts of the site: window.ViewWatcher does the work of
// IntersectionObserver (same use, same callbacks: entries with target, isIntersecting,
// intersectionRatio and boundingClientRect.top; rootMargin and threshold), from the scroll position
// and the places of the elements, measured once and measured again when the page or an element
// changes size. Why not IntersectionObserver itself: as soon as a page has one, Firefox brings up to
// date on the main thread, several times a second, every animation that moves something (transform,
// motion path), and draws the page again each time; on a phone, the pages with animated drawings
// stuttered. Only the vertical position counts (the watched parts span the width of the screen or
// lie within it).
(() => {
  const watchers = new Set();
  const places = new Map();
  // Elements not measured yet: measured all together at the next frame, once the browser has laid out
  // the page (measuring each as it comes made the browser lay the page out early, while the scripts
  // of the page were still starting: some 190 ms on a computer, much more on a phone). The scroll
  // position is read then too, for the same reason.
  const unmeasured = new Set();
  let scrollY = 0;
  // (The size of the window too: reading it makes Firefox lay the page out at once.)
  let viewHeight = 0;
  let viewWidth = 0;
  let frame = 0;

  // The place of an element in the page as laid out (its own transforms and those of its parents
  // do not count, as for IntersectionObserver... nearly: it sees them; they are small here).
  const placeOf = (element) => {
    if (!element.isConnected) {
      return { top: 0, height: 0, isShown: false };
    }
    if (element instanceof HTMLElement && element.offsetParent !== null) {
      let top = 0;
      for (let node = element; node; node = node.offsetParent) {
        top += node.offsetTop;
      }
      return { top, height: element.offsetHeight, isShown: true };
    }
    // Fixed elements, SVG elements and hidden ones (display: none: no box, never on screen).
    const box = element.getBoundingClientRect();
    const isShown = box.width > 0 || box.height > 0;
    return { top: box.top + window.scrollY, height: box.height, isShown };
  };

  const measure = () => {
    scrollY = window.scrollY;
    viewHeight = window.innerHeight;
    viewWidth = window.innerWidth;
    unmeasured.clear();
    watchers.forEach((watcher) => watcher.targets.forEach((state, element) => places.set(element, placeOf(element))));
    check();
  };

  // A margin as IntersectionObserver reads it ('10px 0px -6% 0px'): top and bottom only, the
  // percentages of the height of the screen.
  const parseMargin = (text) => {
    const parts = String(text || '0px').trim().split(/\s+/);
    const [top, , bottom = top] = parts.length === 1 ? [parts[0], parts[0], parts[0]] : parts.length === 2 ? [parts[0], parts[1], parts[0]] : parts;
    const toPixels = (value) => (value.endsWith('%') ? (parseFloat(value) / 100) * viewHeight : parseFloat(value) || 0);
    return () => [toPixels(top), toPixels(bottom)];
  };

  // The scroll position is read once a frame, here, rather than at each scroll event: reading it
  // makes Firefox bring the styles of the page up to date at once, in the middle of the event.
  const check = () => {
    frame = 0;
    scrollY = window.scrollY;
    if (!viewHeight) {
      viewHeight = window.innerHeight;
      viewWidth = window.innerWidth;
    }
    if (unmeasured.size) {
      unmeasured.forEach((element) => places.set(element, placeOf(element)));
      unmeasured.clear();
    }
    watchers.forEach((watcher) => watcher.check());
  };
  const schedule = () => {
    if (!frame) {
      frame = window.requestAnimationFrame(check);
    }
  };

  window.addEventListener('scroll', schedule, { passive: true });
  // A phone's bar of address folding away as the page scrolls only changes the height of the screen:
  // the places in the page stay the same, only what is on screen is checked again. A new width (a
  // turned phone, a resized window) measures everything again.
  window.addEventListener('resize', () => {
    if (window.innerWidth === viewWidth) {
      viewHeight = window.innerHeight;
      schedule();
      return;
    }
    viewWidth = window.innerWidth;
    measure();
  });
  // The page or a watched element changing size (fonts, an opened answer, a part of the page drawn
  // when it comes near): the places are measured again, after the layout, when it costs nothing.
  const sizes = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
  sizes?.observe(document.documentElement);
  if (!sizes) {
    window.addEventListener('load', measure);
  }

  class ViewWatcher {
    constructor(callback, { rootMargin = '0px', threshold = 0 } = {}) {
      this.callback = callback;
      this.margin = parseMargin(rootMargin);
      this.thresholds = (Array.isArray(threshold) ? threshold : [threshold]).slice().sort((a, b) => a - b);
      this.targets = new Map();
      watchers.add(this);
    }

    observe(element) {
      if (this.targets.has(element)) {
        return;
      }
      // A new element is reported once in any case, as IntersectionObserver does.
      this.targets.set(element, { isNew: true, isIntersecting: false, index: -1 });
      unmeasured.add(element);
      sizes?.observe(element);
      schedule();
    }

    unobserve(element) {
      this.targets.delete(element);
    }

    disconnect() {
      this.targets.clear();
      watchers.delete(this);
    }

    check() {
      const [marginTop, marginBottom] = this.margin();
      const rootTop = scrollY - marginTop;
      const rootBottom = scrollY + viewHeight + marginBottom;
      const entries = [];
      this.targets.forEach((state, element) => {
        const place = places.get(element) || placeOf(element);
        const bottom = place.top + place.height;
        const overlap = Math.min(bottom, rootBottom) - Math.max(place.top, rootTop);
        const isIntersecting = place.isShown && (overlap > 0 || (place.height === 0 && place.top >= rootTop && place.top <= rootBottom));
        const ratio = !isIntersecting ? 0 : place.height > 0 ? Math.min(1, overlap / place.height) : 1;
        const index = this.thresholds.filter((value) => (value === 0 ? isIntersecting : ratio >= value)).length;
        if (state.isNew || isIntersecting !== state.isIntersecting || index !== state.index) {
          state.isNew = false;
          state.isIntersecting = isIntersecting;
          state.index = index;
          entries.push({ target: element, isIntersecting, intersectionRatio: ratio, boundingClientRect: { top: place.top - scrollY, height: place.height } });
        }
      });
      if (entries.length) {
        this.callback(entries, this);
      }
    }
  }

  window.ViewWatcher = ViewWatcher;
})();
