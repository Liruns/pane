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
    // Completion leg eases 80→100% (DESIGN §15: ease-standard over motion-standard),
    // then fades. Tokens resolve from :root; reduced-motion drops the transition (base.css).
    bar.style.transition = 'width var(--motion-standard) var(--ease-standard), opacity 0.2s ease';
    bar.style.width = '100%';
    reset = setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => { bar.style.width = '0%'; }, 220);
    }, 300); // hold for the completion leg before fading out
  }

  window.pane.onLoading((d) => (d.loading ? start() : stop()));
}
