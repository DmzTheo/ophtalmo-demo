// Ophta Miramas La Crau — motion layer, with GSAP (assets/vendor/gsap, loaded before this file).
// Everything plays once by itself as it comes on screen; nothing follows the scroll. Without GSAP,
// or when the system asks for less motion, nothing is hidden and nothing moves.
(() => {
  const { gsap, SplitText } = window;
  if (!gsap || !SplitText) {
    return;
  }
  gsap.registerPlugin(SplitText);

  // Plays the callback once, the first time the element comes within the margin of the screen.
  const onEnter = (element, callback, rootMargin = '0px 0px -10% 0px') => {
    const observer = new ViewWatcher((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        callback();
      }
    }, { rootMargin });
    observer.observe(element);
  };

  // ---------- Opening texts of the sections, line by line ----------
  // Each line rises from behind its own edge, 50 ms after the previous one, moved by the screen
  // alone (CSS animations, site.css: a tween of the script was redrawn by the page at every frame).
  // The text is cut into lines a little before it reaches the screen (measuring the lines is costly:
  // it is done out of sight), its lines rise as it reaches the screen, and it is put back as it was
  // once arrived (so that enlarging the text later reflows it normally). Texts already on screen when
  // the page opens keep their simple reveal (site.css).
  const LINE_TEXTS = '.giant-head__lead, .section-head__lead';

  const revealLines = (block) => {
    const text = block.matches('p') ? block : block.querySelector('p');
    if (!text) {
      return;
    }
    const others = [...block.children].filter((child) => child !== text);
    block.removeAttribute('data-reveal');
    block.classList.add('lines');
    text.classList.add('lines__text');
    others.forEach((other) => other.classList.add('lines__other'));
    let split = null;
    const cut = () => {
      if (!split) {
        split = SplitText.create(text, { type: 'lines', mask: 'lines', linesClass: 'text-lines', propIndex: true });
        text.classList.add('is-cut');
      }
    };
    onEnter(block, cut, '0px 0px 30% 0px');
    onEnter(block, () => {
      cut();
      let risen = 0;
      const arrive = (event) => {
        if (event.animationName === 'line-rise') {
          risen += 1;
          if (risen === split.lines.length) {
            split.revert();
          }
        } else if (event.animationName === 'line-other-in') {
          event.target.classList.remove('lines__other');
        }
      };
      block.addEventListener('animationend', arrive);
      block.classList.add('is-rising');
    }, '0px 0px 4% 0px');
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
