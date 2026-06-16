// The omnibox suggestion dropdown (DESIGN §10). History matches (from main) rank on top,
// then the Go-to / Search actions. While open, the chrome view grows to cover the panel
// (via the overlay helper); the chrome is transparent around it so the page shows through.
import { $, on } from '../lib/dom.js';
import { toNavURL, search, SEARCH_BASE } from './url-parser.js';
import { openOverlay, closeOverlay } from '../lib/overlay.js';
import { ICONS } from '../lib/icons.js';

const ROW_H = 36;

// Row glyphs keyed by the item's `icon` field (set in actions()/history mapping).
const ICON = { go: ICONS.arrowRight, search: ICONS.search, history: ICONS.history };

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
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  document.body.append(panel);
  lastW = window.innerWidth;

  // combobox a11y (DESIGN §6) — the input owns the listbox; selection is announced.
  addr.setAttribute('role', 'combobox');
  addr.setAttribute('aria-autocomplete', 'list');
  addr.setAttribute('aria-controls', 'suggestions');
  addr.setAttribute('aria-expanded', 'false');

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
  if (url.startsWith(SEARCH_BASE)) {
    const se = { icon: 'search', label: `Search for “${s}”`, url };
    // Plausibly a host (no spaces, dotted, parseable)? Surface "Go to" as #1 — search stays the
    // default action (nothing is pre-selected), but the host is one keystroke away. DESIGN §10.5/6.
    if (!/\s/.test(s) && s.includes('.') && URL.canParse('https://' + s)) {
      return [{ icon: 'go', label: `Go to ${s}`, url: 'https://' + s }, se];
    }
    return [se];
  }
  return [
    { icon: 'go', label: `Go to ${hostOf(url)}`, url },
    { icon: 'search', label: `Search for “${s}”`, url: search(s) },
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
    row.setAttribute('role', 'option');
    row.id = `sg-row-${i}`;
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
  addr.setAttribute('aria-expanded', 'true');
  openOverlay(close, Math.ceil(r.bottom + 4 + items.length * ROW_H + 20));
}

export function close() {
  if (panel.hidden) return;
  panel.hidden = true;
  rows = [];
  sel = -1;
  addr.setAttribute('aria-expanded', 'false');
  addr.removeAttribute('aria-activedescendant');
  closeOverlay(close);
}

export function isOpen() { return !panel.hidden; }

export function move(dir) {
  if (panel.hidden || !rows.length) return;
  highlight((sel + dir + rows.length) % rows.length);
}

function highlight(i) {
  sel = i;
  [...panel.children].forEach((c, j) => {
    const on = j === i;
    c.classList.toggle('selected', on);
    c.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (i >= 0 && panel.children[i]) addr.setAttribute('aria-activedescendant', panel.children[i].id);
  else addr.removeAttribute('aria-activedescendant');
}

export function selectedUrl() {
  return sel >= 0 && rows[sel] ? rows[sel].url : null;
}

function commit(url) {
  close();
  if (url) window.pane.navigate(url);
  addr.blur();
}
