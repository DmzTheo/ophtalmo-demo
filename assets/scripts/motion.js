// Ophta Miramas La Crau — motion layer, with GSAP (assets/vendor/gsap, loaded before this file).
// Everything plays once by itself as it comes on screen; nothing follows the scroll. Without GSAP,
// or when the system asks for less motion, nothing is hidden and nothing moves.
(() => {
  const { gsap, SplitText } = window;
  if (!gsap || !SplitText) {
    return;
  }
  gsap.registerPlugin(SplitText);

  // The two curves of the site (site.css): --ease-out is a quint ease-out, --ease-in-out a cubic.
  const EASE_OUT = 'power4.out';

  // Plays the callback once, the first time the element is well inside the screen.
  const onEnter = (element, callback, rootMargin = '0px 0px -10% 0px') => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        callback();
      }
    }, { rootMargin });
    observer.observe(element);
  };

  // ---------- Opening texts of the sections, line by line ----------
  // Each line rises from behind its own edge, 80 ms after the previous one; the text is put back as
  // it was once arrived (so that enlarging the text later reflows it normally). Texts already on
  // screen when the page opens keep their simple reveal (site.css).
  const LINE_TEXTS = '.giant-head__lead, .section-head__lead';
  const LINE_STAGGER = 0.08;

  const revealLines = (block) => {
    const text = block.matches('p') ? block : block.querySelector('p');
    if (!text) {
      return;
    }
    const others = [...block.children].filter((child) => child !== text);
    const hasOthers = others.length > 0;
    block.removeAttribute('data-reveal');
    gsap.set(text, { autoAlpha: 0 });
    if (hasOthers) {
      gsap.set(others, { autoAlpha: 0, y: 16 });
    }
    onEnter(block, () => {
      SplitText.create(text, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'text-lines',
        onSplit(split) {
          gsap.set(text, { autoAlpha: 1 });
          const timeline = gsap.timeline({ onComplete: () => split.revert() });
          timeline.from(split.lines, { yPercent: 110, duration: 0.9, ease: EASE_OUT, stagger: LINE_STAGGER });
          if (hasOthers) {
            timeline.to(others, { autoAlpha: 1, y: 0, duration: 0.7, ease: EASE_OUT, clearProps: 'transform' }, '-=0.5');
          }
          // Not returned to SplitText: its revert at the end would also revert the timeline, and
          // hide again what follows the text (a button).
        },
      });
    });
  };

  // ---------- Buttons that lean towards the mouse ----------
  // Within the button, it follows the pointer by a few pixels (6 across, 4 up and down) and comes
  // back when the pointer leaves. The individual "translate" property leaves the pressed scale of
  // the button (transform) untouched.
  const MAGNET_X = 6;
  const MAGNET_Y = 4;

  const magnetize = (button) => {
    const offset = { x: 0, y: 0 };
    const apply = () => {
      button.style.translate = `${offset.x.toFixed(2)}px ${offset.y.toFixed(2)}px`;
    };
    const toX = gsap.quickTo(offset, 'x', { duration: 0.5, ease: 'power3.out', onUpdate: apply });
    const toY = gsap.quickTo(offset, 'y', { duration: 0.5, ease: 'power3.out', onUpdate: apply });
    const follow = (event) => {
      const box = button.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
      const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
      toX(gsap.utils.clamp(-1, 1, dx) * MAGNET_X);
      toY(gsap.utils.clamp(-1, 1, dy) * MAGNET_Y);
    };
    const release = () => {
      toX(0);
      toY(0);
    };
    button.addEventListener('pointermove', follow);
    button.addEventListener('pointerleave', release);
    return () => {
      button.removeEventListener('pointermove', follow);
      button.removeEventListener('pointerleave', release);
      button.style.translate = '';
    };
  };

  const media = gsap.matchMedia();
  media.add({
    isMoving: '(prefers-reduced-motion: no-preference)',
    hasMouse: '(hover: hover) and (pointer: fine)',
  }, ({ conditions }) => {
    if (!conditions.isMoving) {
      return undefined;
    }
    document.querySelectorAll(LINE_TEXTS).forEach((block) => {
      const isBelowScreen = block.getBoundingClientRect().top > window.innerHeight;
      if (isBelowScreen) {
        revealLines(block);
      }
    });
    if (!conditions.hasMouse) {
      return undefined;
    }
    const releases = [...document.querySelectorAll('.btn--primary, .btn--light')].map(magnetize);
    return () => releases.forEach((release) => release());
  });
})();
