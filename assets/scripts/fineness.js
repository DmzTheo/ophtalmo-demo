// How finely a 3D scene is drawn (pixels per point), after the graphics chip. The scene is drawn at
// each refresh of the screen; when too many frames come late (a modest phone, an old computer), it is
// drawn a step less finely, and finer again after a few quiet seconds, never above a step found too
// slow. (Drawn only at every other refresh of a 120 Hz screen, the frames came unevenly in Firefox:
// one early, the next one late.) The same rule as the iris of the home page (hero.js).
const WINDOW = 60;

export function fineness({ max, min, start, onChange }) {
  let ratio = start;
  let ceiling = max;
  let intervals = [];
  let shortest = [];
  let quietWindows = 0;
  let settleUntil = 0;
  let last = 0;
  return {
    get ratio() {
      return ratio;
    },
    // At each frame drawn, with its time (ms). About every second (WINDOW frames), the frames are
    // looked at: the refresh of the screen is the shortest time between two frames over the last few
    // seconds (a phone changes it by itself), and a frame is late after half again that time.
    frame(now) {
      const interval = last ? now - last : 0;
      last = now;
      if (!interval || now < settleUntil) {
        return;
      }
      intervals.push(interval);
      if (intervals.length < WINDOW) {
        return;
      }
      shortest = [...shortest.slice(-4), Math.max(4, Math.min(...intervals))];
      const refresh = Math.min(...shortest);
      const late = intervals.filter((each) => each > refresh * 1.45).length;
      intervals = [];
      quietWindows = late < WINDOW * 0.03 ? quietWindows + 1 : 0;
      if (late > WINDOW * 0.2 && ratio > min) {
        ceiling = Math.max(min, ratio * 0.92);
        ratio = Math.max(min, ratio * 0.8);
        settleUntil = now + 600;
        onChange(ratio);
      } else if (quietWindows >= 5 && ratio < ceiling) {
        quietWindows = 0;
        ratio = Math.min(ceiling, ratio * 1.1);
        settleUntil = now + 600;
        onChange(ratio);
      }
    },
    // The scene has stopped drawing (nothing moves, or off screen): the wait is not a late frame.
    rest() {
      last = 0;
      intervals = [];
    },
  };
}
