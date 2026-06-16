// Back / forward / reload(↔stop) / devtools buttons + their state.
import { $, on } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';

export function initNavigation() {
  const back = $('#back');
  const forward = $('#forward');
  const reload = $('#reload');
  const devtools = $('#devtools');
  let loading = false;

  on(back, 'click', () => window.pane.back());
  on(forward, 'click', () => window.pane.forward());
  on(reload, 'click', () => (loading ? window.pane.stop() : window.pane.reload()));
  on(devtools, 'click', (e) => {
    e.currentTarget.classList.toggle('active');
    window.pane.toggleDevTools();
  });

  window.pane.onNavState((d) => {
    back.disabled = !d.canGoBack;
    forward.disabled = !d.canGoForward;
  });

  // Reload ↔ Stop swap while the active tab is loading.
  window.pane.onLoading((d) => {
    loading = d.loading;
    reload.innerHTML = loading ? ICONS.close : ICONS.reload;
    reload.title = loading ? 'Stop' : 'Reload (Ctrl+R)';
    reload.setAttribute('aria-label', loading ? 'Stop' : 'Reload');
  });
}
