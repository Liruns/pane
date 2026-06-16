// The ⋮ settings menu — a chrome overlay (like the suggestions dropdown). Holds the
// session-restore toggle and the clear-history action.
import { $, on } from '../lib/dom.js';
import { close as closeSuggestions } from './suggestions.js';

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

async function open() {
  closeSuggestions();
  const settings = await window.pane.getSettings();
  render(settings);

  const r = btn.getBoundingClientRect();
  panel.style.top = `${r.bottom + 6}px`;
  panel.hidden = false;
  const pr = panel.getBoundingClientRect(); // measure to right-align under the button
  panel.style.left = `${Math.max(8, r.right - pr.width)}px`;
  window.pane.setChromeHeight(Math.ceil(panel.getBoundingClientRect().bottom + 8));
}

function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  window.pane.setChromeHeight(Math.ceil($('#toolbar').getBoundingClientRect().bottom));
}

function render(settings) {
  panel.replaceChildren();

  const toggle = document.createElement('div');
  toggle.className = 'm-row toggle' + (settings.restoreSession ? ' checked' : '');
  toggle.innerHTML = '<span class="m-label">Restore last session</span><span class="m-switch"></span>';
  on(toggle, 'click', () => {
    const next = !toggle.classList.contains('checked');
    toggle.classList.toggle('checked', next);
    window.pane.setSetting('restoreSession', next);
  });
  panel.append(toggle);

  const clear = document.createElement('div');
  clear.className = 'm-row';
  clear.innerHTML = '<span class="m-label">Clear history</span>';
  on(clear, 'click', async () => {
    await window.pane.clearHistory();
    clear.querySelector('.m-label').textContent = 'History cleared';
    setTimeout(close, 700);
  });
  panel.append(clear);
}
