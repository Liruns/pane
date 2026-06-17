// The infinite-canvas renderer (DESIGN §11 roadmap — "many Pane instances float and arrange on one
// surface"). Runs in its own WebContentsView (the "canvas view") filling the content region,
// rendered BEHIND the live page views (separate native views floating on top at their own rects).
//
// So this surface draws ONLY pane chrome — a 28px title bar above each pane and a 1px hairline ring
// around the pane's page rect — and acts as the gesture surface for the empty canvas. The rect
// interior is left empty (the native page shows through); we never paint opaque over it. Mirrors
// sidebar.js: same bridge (window.pane), same dom/icons libs, same SAFE_FAVICON guard.
import { $, on } from './lib/dom.js';
import { ICONS } from './lib/icons.js';

// Only let web favicons into this privileged chrome document (no file:/pane:/js: schemes).
const SAFE_FAVICON = /^(?:https?|data):/i;

const TITLE_H = 28; // title-bar height in fixed screen px, drawn ABOVE the page rect

const root = $('#canvas');
const els = new Map(); // pane id → { wrap, ring, titleBar, favicon, titleText, img } (diffed across renders)

let state = { on: false, scale: 1, panes: [] };

window.pane.onCanvasState((s) => {
  state = s || { on: false, scale: 1, panes: [] };
  if (!state.on) {
    clear();
    return;
  }
  render(state.panes || []);
});

initCanvasGestures();

/* ── Render / diff the pane set ──────────────────────────────────────────────
   Each onCanvasState fires on any camera or pane change, so positions move every frame during a
   pan/zoom. We diff by id (reuse DOM nodes, just reposition) to avoid thrashing the favicon <img>
   and to keep it cheap under continuous camera motion. */
function render(panes) {
  const seen = new Set();

  for (const p of panes) {
    const sc = p.screen;
    // A pane fully off-region arrives clamped to 0×0 — skip it entirely.
    if (!sc || sc.width <= 0 || sc.height <= 0) continue;
    seen.add(p.id);

    let rec = els.get(p.id);
    if (!rec) rec = createPane(p.id);

    position(rec, p, sc);
  }

  // Drop panes that are gone (closed) or fell off-region.
  for (const [id, rec] of els) {
    if (!seen.has(id)) {
      rec.wrap.remove();
      els.delete(id);
    }
  }
}

function clear() {
  for (const rec of els.values()) rec.wrap.remove();
  els.clear();
}

function createPane(id) {
  const wrap = document.createElement('div');
  wrap.className = 'pane';
  wrap.dataset.id = id;

  const ring = document.createElement('div');
  ring.className = 'pane-ring';

  const titleBar = document.createElement('div');
  titleBar.className = 'pane-title';

  const favicon = document.createElement('span');
  favicon.className = 'favicon';

  const titleText = document.createElement('span');
  titleText.className = 'title';

  const close = document.createElement('button');
  close.className = 'close';
  close.setAttribute('aria-label', 'Close pane');
  close.innerHTML = ICONS.close;

  titleBar.append(favicon, titleText, close);
  wrap.append(ring, titleBar);
  root.append(wrap);

  const rec = { wrap, ring, titleBar, favicon, titleText, img: null, favKey: null };

  // Title-bar click raises/focuses the pane (DESIGN: blue marks the active one).
  on(titleBar, 'click', () => window.pane.canvasRaisePane(id));
  // Close button — stop the raise click from also firing.
  on(close, 'click', (e) => { e.stopPropagation(); window.pane.closeTab(id); });
  // Title-bar pointer-drag moves the pane (screen-delta per move).
  initTitleDrag(titleBar, id);

  els.set(id, rec);
  return rec;
}

// Position the chrome from the region-local PAGE rect: ring overlays the rect, title bar sits
// directly above it ([x, y - TITLE_H], width × TITLE_H).
function position(rec, p, sc) {
  rec.wrap.classList.toggle('active', !!p.active);
  rec.wrap.classList.toggle('loading', !!p.loading);

  rec.titleBar.style.left = `${sc.x}px`;
  rec.titleBar.style.top = `${sc.y - TITLE_H}px`;
  rec.titleBar.style.width = `${sc.width}px`;

  rec.ring.style.left = `${sc.x}px`;
  rec.ring.style.top = `${sc.y}px`;
  rec.ring.style.width = `${sc.width}px`;
  rec.ring.style.height = `${sc.height}px`;

  const label = p.title || 'New Tab';
  if (rec.titleText.textContent !== label) rec.titleText.textContent = label;
  rec.titleBar.title = label;

  setFavicon(rec, p.favicon);
}

function setFavicon(rec, favicon) {
  const key = favicon && SAFE_FAVICON.test(favicon) ? favicon : null;
  if (rec.favKey === key) return; // unchanged — don't reload the image
  rec.favKey = key;

  if (key) {
    if (!rec.img) {
      rec.img = document.createElement('img');
      rec.img.onerror = () => { rec.favKey = null; rec.img = null; rec.favicon.innerHTML = ICONS.globe; };
    }
    rec.img.src = key;
    rec.favicon.replaceChildren(rec.img);
  } else {
    rec.img = null;
    rec.favicon.innerHTML = ICONS.globe;
  }
}

/* ── Title-bar drag: move a pane ─────────────────────────────────────────────
   Pointer events + capture; track the previous pointer position and send screen-deltas. A drag
   suppresses the click-to-raise that would otherwise fire on pointerup. */
function initTitleDrag(titleBar, id) {
  let dragging = false;
  let moved = false;
  let px = 0;
  let py = 0;

  on(titleBar, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.close')) return; // the close button isn't a drag handle
    dragging = true;
    moved = false;
    px = e.clientX;
    py = e.clientY;
    titleBar.classList.add('dragging');
    titleBar.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  on(titleBar, 'pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    if (dx === 0 && dy === 0) return;
    px = e.clientX;
    py = e.clientY;
    moved = true;
    window.pane.canvasPaneMove(id, dx, dy);
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    titleBar.classList.remove('dragging');
    try { titleBar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  on(titleBar, 'pointerup', end);
  on(titleBar, 'pointercancel', end);

  // Swallow the synthetic click that follows a real drag so it doesn't also raise the pane.
  on(titleBar, 'click', (e) => { if (moved) { e.stopImmediatePropagation(); moved = false; } }, true);
}

/* ── Canvas gestures: pan, zoom, new pane ────────────────────────────────────
   Empty-area drag (or middle-mouse drag anywhere) pans the camera; wheel zooms about the cursor;
   double-click on empty space opens a new pane. */
function initCanvasGestures() {
  let panning = false;
  let px = 0;
  let py = 0;

  on(root, 'pointerdown', (e) => {
    // Left-drag pans only from empty space; middle-mouse pans from anywhere (incl. title bars).
    const onChrome = e.target.closest('.pane-title');
    const start = (e.button === 1) || (e.button === 0 && !onChrome);
    if (!start) return;
    panning = true;
    px = e.clientX;
    py = e.clientY;
    root.classList.add('panning');
    root.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  on(root, 'pointermove', (e) => {
    if (!panning) return;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    if (dx === 0 && dy === 0) return;
    px = e.clientX;
    py = e.clientY;
    window.pane.canvasPan(dx, dy);
  });

  const end = (e) => {
    if (!panning) return;
    panning = false;
    root.classList.remove('panning');
    try { root.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  on(root, 'pointerup', end);
  on(root, 'pointercancel', end);

  // Wheel zooms about the cursor (region-local offset). Steady factor — felt, not faked.
  on(root, 'wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    window.pane.canvasZoom(factor, e.offsetX, e.offsetY);
  }, { passive: false });

  // Double-click empty space → open a new pane.
  on(root, 'dblclick', (e) => {
    if (e.target.closest('.pane-title')) return;
    window.pane.newTab();
  });
}
