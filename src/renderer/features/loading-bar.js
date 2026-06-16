// The 2px trickle loading bar (DESIGN §15) — ease only, never hangs.
import { $ } from '../lib/dom.js';

export function initLoadingBar() {
  const bar = $('#loadingbar');
  let trickle = null;
  let reset = null;

  function start() {
    clearInterval(trickle);
    clearTimeout(reset);
    bar.style.transition = 'width 0.15s linear, opacity 0.2s ease';
    bar.style.opacity = '1';
    let w = 8;
    bar.style.width = w + '%';
    trickle = setInterval(() => {
      w += (80 - w) * 0.12; // ease toward the 80% wall
      bar.style.width = w.toFixed(1) + '%';
      if (w > 79.5) clearInterval(trickle);
    }, 180);
  }

  function stop() {
    clearInterval(trickle);
    bar.style.width = '100%';
    reset = setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => { bar.style.width = '0%'; }, 220);
    }, 160);
  }

  window.pane.onLoading((d) => (d.loading ? start() : stop()));
}
