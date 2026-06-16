// Back / forward / reload / devtools buttons + their enabled state.
import { $, on } from '../lib/dom.js';

export function initNavigation() {
  const back = $('#back');
  const forward = $('#forward');
  const reload = $('#reload');
  const devtools = $('#devtools');

  on(back, 'click', () => window.pane.back());
  on(forward, 'click', () => window.pane.forward());
  on(reload, 'click', () => window.pane.reload());
  on(devtools, 'click', (e) => {
    e.currentTarget.classList.toggle('active');
    window.pane.toggleDevTools();
  });

  window.pane.onNavState((d) => {
    back.disabled = !d.canGoBack;
    forward.disabled = !d.canGoForward;
  });
}
