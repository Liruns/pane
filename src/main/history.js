'use strict';
// Visited-page history → powers the omnibox autocomplete. Persisted to history.json.
const { readJSON, writeJSON } = require('./store');

const FILE = 'history.json';
let entries = null; // { [url]: { url, title, visits, last } }
let saveTimer = null;

function load() { if (!entries) entries = readJSON(FILE, {}); return entries; }
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeJSON(FILE, entries), 1000); }

function record(url) {
  if (!url || !/^https?:\/\//i.test(url)) return; // only real web pages
  load();
  const e = entries[url] || { url, title: '', visits: 0, last: 0 };
  e.visits += 1;
  e.last = Date.now();
  entries[url] = e;
  scheduleSave();
}

function updateTitle(url, title) {
  if (!url || !title) return;
  load();
  if (entries[url]) { entries[url].title = title; scheduleSave(); }
}

/** Rank history by match + frequency + recency. @returns [{url, title}] */
function query(input, limit = 5) {
  const q = (input || '').trim().toLowerCase();
  if (!q) return [];
  load();
  const now = Date.now();
  const out = [];
  for (const e of Object.values(entries)) {
    const url = e.url.toLowerCase();
    const stripped = url.replace(/^https?:\/\/(www\.)?/, '');
    if (!url.includes(q) && !(e.title || '').toLowerCase().includes(q)) continue;
    const recency = Math.max(0, 30 - (now - e.last) / 86400000) / 30; // 0..1 over 30 days
    const prefix = stripped.startsWith(q) ? 3 : 0;
    out.push({ url: e.url, title: e.title, score: e.visits + recency * 3 + prefix });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ url, title }) => ({ url, title }));
}

function clear() { entries = {}; writeJSON(FILE, entries); }

module.exports = { record, updateTitle, query, clear };
