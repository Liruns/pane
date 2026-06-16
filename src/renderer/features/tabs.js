// The tab strip: renders the tab list from main, routes clicks back as tab actions.
import { $, on } from '../lib/dom.js';

const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const GLOBE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';

let state = { tabs: [], activeId: null };

export function initTabs() {
  const list = $('#tabs');
  on($('#newtab'), 'click', () => window.pane.newTab());
  window.pane.onTabs((next) => { state = next; render(list, next); });

  // Ctrl+T / Ctrl+W / Ctrl+Tab when the chrome has focus (page-focus case handled in main).
  on(window, 'keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 't') { e.preventDefault(); window.pane.newTab(); }
    else if (k === 'w') { e.preventDefault(); if (state.activeId != null) window.pane.closeTab(state.activeId); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const ids = state.tabs.map((t) => t.id);
      if (ids.length < 2) return;
      const i = ids.indexOf(state.activeId);
      const dir = e.shiftKey ? -1 : 1;
      window.pane.activateTab(ids[(i + dir + ids.length) % ids.length]);
    }
  });
}

function faviconEl(tab) {
  const fav = document.createElement('span');
  fav.className = 'favicon';
  if (tab.favicon) {
    const img = document.createElement('img');
    img.src = tab.favicon;
    img.onerror = () => { fav.innerHTML = GLOBE_SVG; };
    fav.append(img);
  } else {
    fav.innerHTML = GLOBE_SVG;
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
    close.innerHTML = CLOSE_SVG;

    tab.append(faviconEl(t), title, close);
    on(tab, 'click', () => window.pane.activateTab(t.id));
    on(close, 'click', (e) => { e.stopPropagation(); window.pane.closeTab(t.id); });
    list.append(tab);
  }
}
