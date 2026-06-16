// Back / forward / reload(↔stop) / devtools buttons + their state.
import { $, on } from '../lib/dom.js';

const RELOAD_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
const STOP_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

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
    reload.innerHTML = loading ? STOP_SVG : RELOAD_SVG;
    reload.title = loading ? 'Stop' : 'Reload (Ctrl+R)';
    reload.setAttribute('aria-label', loading ? 'Stop' : 'Reload');
  });
}
