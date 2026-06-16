// The ⋮ menu — a chrome overlay (via the overlay helper). A pure launcher: it opens
// pane:// internal pages (History, Settings). Settings logic lives on those pages, not here.
import { $, on } from '../lib/dom.js';
import { openOverlay, closeOverlay } from '../lib/overlay.js';

let panel, btn;

export function initMenu() {
  btn = $('#menu-btn');
  panel = document.createElement('div');
  panel.id = 'menu';
  panel.hidden = true;
  document.body.append(panel);

  on(btn, 'click', (e) => { e.stopPropagation(); panel.hidden ? open() : close(); });
  on(window, 'mousedown', (e) => {
    if (panel.hidden) return;
    if (e.target.closest('#menu') || e.target.closest('#menu-btn')) return;
    close();
  });
  on(window, 'keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
}

function open() {
  render();

  const r = btn.getBoundingClientRect();
  panel.style.top = `${r.bottom + 6}px`;
  panel.hidden = false;
  const pr = panel.getBoundingClientRect(); // measure to right-align under the button
  panel.style.left = `${Math.max(8, r.right - pr.width)}px`;
  openOverlay(close, Math.ceil(panel.getBoundingClientRect().bottom + 8));
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  closeOverlay(close);
}

function render() {
  panel.replaceChildren();
  item('Bookmarks', '', 'pane://bookmarks/');
  item('History', 'Ctrl+H', 'pane://history/');
  sep();
  item('Settings', 'Ctrl+,', 'pane://settings/');
}

function item(label, hint, target) {
  const row = document.createElement('div');
  row.className = 'm-row';
  row.innerHTML = `<span class="m-label">${label}</span>` + (hint ? `<span class="m-key">${hint}</span>` : '');
  on(row, 'click', () => { window.pane.navigate(target); close(); });
  panel.append(row);
}

function sep() {
  const s = document.createElement('div');
  s.className = 'm-sep';
  panel.append(s);
}
