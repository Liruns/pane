// The omnibox suggestion dropdown (DESIGN §10). History matches (from main) rank on top,
// then the Go-to / Search actions. The toolbar is a fixed-height WebContentsView, so while
// the dropdown is open we grow the chrome view (setChromeHeight) to cover the panel; the
// chrome is transparent around it so the page shows through, and a click there closes it.
import { $, on } from '../lib/dom.js';
import { toNavURL } from './url-parser.js';

const SEARCH = 'https://www.google.com/search?q=';
const ROW_H = 36;

const ICON = {
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

let panel, pill, addr;
let rows = [];
let sel = -1;
let lastW = 0;
let reqId = 0;

export function initSuggestions() {
  addr = $('#address');
  pill = $('#pill');
  panel = document.createElement('div');
  panel.id = 'suggestions';
  panel.hidden = true;
  document.body.append(panel);
  lastW = window.innerWidth;

  on(window, 'mousedown', (e) => {
    if (panel.hidden) return;
    if (e.target.closest('#suggestions') || e.target.closest('#pill')) return;
    close();
  });
  on(window, 'resize', () => {
    if (window.innerWidth !== lastW) { lastW = window.innerWidth; if (!panel.hidden) close(); }
  });
}

const hostOf = (u) => { try { return new URL(u).host || u; } catch { return u; } };
const display = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function actions(s) {
  const url = toNavURL(s);
  if (!url) return [];
  if (url.startsWith(SEARCH)) {
    const out = [{ icon: 'search', label: `Search for “${s}”`, url }];
    if (!/\s/.test(s) && s.includes('.')) out.push({ icon: 'go', label: `Go to ${s}`, url: 'https://' + s });
    return out;
  }
  return [
    { icon: 'go', label: `Go to ${hostOf(url)}`, url },
    { icon: 'search', label: `Search for “${s}”`, url: SEARCH + encodeURIComponent(s) },
  ];
}

export async function update(input) {
  if (document.activeElement !== addr) { close(); return; }
  const s = input.trim();
  if (!s) { close(); return; }

  const my = ++reqId;
  let hist = [];
  try { hist = await window.pane.queryHistory(s); } catch { hist = []; }
  if (my !== reqId || document.activeElement !== addr) return; // stale / blurred

  const histItems = hist.map((h) => ({
    icon: 'history', url: h.url, label: h.title ? `${h.title} — ${display(h.url)}` : display(h.url),
  }));
  const seen = new Set(histItems.map((h) => h.url));
  const items = [...histItems, ...actions(s).filter((a) => !seen.has(a.url))];
  if (!items.length) { close(); return; }

  rows = items;
  sel = -1;
  panel.replaceChildren();
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'sg-row';
    row.innerHTML = `<span class="sg-icon">${ICON[it.icon]}</span><span class="sg-label"></span>`;
    row.querySelector('.sg-label').textContent = it.label;
    on(row, 'mousedown', (e) => { e.preventDefault(); commit(it.url); });
    on(row, 'mousemove', () => highlight(i));
    panel.append(row);
  });

  const r = pill.getBoundingClientRect();
  panel.style.left = `${r.left}px`;
  panel.style.top = `${r.bottom + 4}px`;
  panel.style.width = `${r.width}px`;
  panel.hidden = false;
  window.pane.setChromeHeight(Math.ceil(r.bottom + 4 + items.length * ROW_H + 20));
}

export function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  rows = [];
  sel = -1;
  window.pane.setChromeHeight(Math.ceil($('#toolbar').getBoundingClientRect().bottom));
}

export function isOpen() { return !panel.hidden; }

export function move(dir) {
  if (panel.hidden || !rows.length) return;
  highlight((sel + dir + rows.length) % rows.length);
}

function highlight(i) {
  sel = i;
  [...panel.children].forEach((c, j) => c.classList.toggle('selected', j === i));
}

export function selectedUrl() {
  return sel >= 0 && rows[sel] ? rows[sel].url : null;
}

function commit(url) {
  close();
  if (url) window.pane.navigate(url);
  addr.blur();
}
