// Photos and maps far down the page load when they come near the screen (a screen and a half
// ahead), watched by window.ViewWatcher (view.js) rather than loading="lazy": in Firefox, a page that
// still waits for a lazy image or map brings every moving drawing up to date on the main thread
// several times a second. The build marks them with data-defer and keeps their addresses in
// data-src / data-srcset; without JavaScript, the copy of their <noscript> shows instead.
(() => {
  const waiting = [...document.querySelectorAll('[data-defer]')];
  if (!waiting.length) {
    return;
  }

  const load = (item) => {
    if (!item.hasAttribute('data-defer')) {
      return;
    }
    item.removeAttribute('data-defer');
    [item, ...item.querySelectorAll('[data-srcset], [data-src]')].forEach((node) => {
      if (node.dataset.srcset) {
        node.srcset = node.dataset.srcset;
        node.removeAttribute('data-srcset');
      }
      if (node.dataset.src) {
        node.src = node.dataset.src;
        node.removeAttribute('data-src');
      }
    });
  };
  const loadAll = () => waiting.forEach(load);

  // A printed page shows every photo.
  window.addEventListener('beforeprint', loadAll);
  if (!('ViewWatcher' in window)) {
    loadAll();
    return;
  }
  const watcher = new ViewWatcher((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      load(entry.target);
      watcher.unobserve(entry.target);
    });
  }, { rootMargin: '150% 0px 150% 0px' });
  waiting.forEach((item) => watcher.observe(item));
})();
