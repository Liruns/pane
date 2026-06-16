// The tab strip: renders the tab list from main, routes clicks back as tab actions.
// (Keyboard shortcuts — Ctrl+T/W/Tab — are handled in the main process via
// before-input-event so their preventDefault reliably stops focus traversal.)
import { $, on } from '../lib/dom.js';
import { ICONS } from '../lib/icons.js';

// Only let web favicons into the privileged chrome document (no file:/pane:/js: schemes).
const SAFE_FAVICON = /^(?:https?|data):/i;

export function initTabs() {
  const list = $('#tabs');
  on($('#newtab'), 'click', () => window.pane.newTab());
  window.pane.onTabs((s) => render(list, s));
}

function faviconEl(tab) {
  const fav = document.createElement('span');
  fav.className = 'favicon';
  if (tab.favicon && SAFE_FAVICON.test(tab.favicon)) {
    const img = document.createElement('img');
    img.src = tab.favicon;
    img.onerror = () => { fav.innerHTML = ICONS.globe; };
    fav.append(img);
  } else {
    fav.innerHTML = ICONS.globe;
  }
  return fav;
}

function render(list, s) {
  list.replaceChildren();
  for (const t of s.tabs) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (t.id === s.activeId ? ' active' : '') + (t.loading ? ' loading' : '');
    tab.title = t.url || t.title || '';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = t.title || 'New Tab';

    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', 'Close tab');
    close.innerHTML = ICONS.close;

    tab.append(faviconEl(t), title, close);
    on(tab, 'click', () => window.pane.activateTab(t.id));
    on(close, 'click', (e) => { e.stopPropagation(); window.pane.closeTab(t.id); });
    list.append(tab);
  }
}
