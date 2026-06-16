// The ⋮ menu — a chrome overlay (via the overlay helper). A pure launcher: it opens
// pane:// internal pages (History, Settings). Settings logic lives on those pages, not here.
import { $, on } from '../lib/dom.js';
import { openOverlay, closeOverlay } from '../lib/overlay.js';
import { initMenuNav, focusFirstItem } from '../lib/menu-nav.js';

let panel, btn;

export function initMenu() {
  btn = $('#menu-btn');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  panel = document.createElement('div');
  panel.id = 'menu';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;
  document.body.append(panel);
  initMenuNav(panel);

  on(btn, 'click', (e) => { e.stopPropagation(); panel.hidden ? open() : close(); });
  on(window, 'mousedown', (e) => {
    if (panel.hidden) return;
    if (e.target.closest('#menu') || e.target.closest('#menu-btn')) return;
    close();
  });
  // Escape closes and returns focus to the trigger (keyboard round-trip).
  on(window, 'keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); } });
}

function open() {
  render();

  const r = btn.getBoundingClientRect();
  panel.style.top = `${r.bottom + 6}px`;
  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  const pr = panel.getBoundingClientRect(); // measure to right-align under the button
  panel.style.left = `${Math.max(8, r.right - pr.width)}px`;
  openOverlay(close, Math.ceil(panel.getBoundingClientRect().bottom + 8));
  focusFirstItem(panel); // land keyboard focus in the menu so arrows/Enter work
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  closeOverlay(close);
}

function render() {
  panel.replaceChildren();
  item('Bookmarks', '', 'pane://bookmarks/');
  item('History', 'Ctrl+H', 'pane://history/');
  item('Downloads', 'Ctrl+J', 'pane://downloads/');
  sep();
  item('Settings', 'Ctrl+,', 'pane://settings/');
}

function item(label, hint, target) {
  const row = document.createElement('div');
  row.className = 'm-row';
  row.setAttribute('role', 'menuitem');
  row.tabIndex = -1;
  row.innerHTML = `<span class="m-label">${label}</span>` + (hint ? `<span class="m-key">${hint}</span>` : '');
  on(row, 'click', () => { window.pane.navigate(target); close(); });
  panel.append(row);
}

function sep() {
  const s = document.createElement('div');
  s.className = 'm-sep';
  panel.append(s);
}
