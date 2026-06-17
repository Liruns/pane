// The infinite-canvas renderer (DESIGN §11 roadmap — "many Pane instances float and arrange on one
// surface"). Runs in its own WebContentsView (the "canvas view") filling the content region.
//
// Frozen-tile model (CANVAS.md §5): only the ACTIVE pane is a live native view, floating on top of
// this surface at its rect — there we draw chrome (title bar + ring) and leave the interior a hole
// for the live page. Every OTHER pane is a frozen SNAPSHOT this surface renders as a scaled <img>,
// so just one renderer is ever live. Clicking a tile (or its title bar) makes it the live pane.
// Mirrors sidebar.js: same bridge (window.pane), same dom/icons libs, same SAFE_FAVICON guard.
import { $, on } from './lib/dom.js';
import { ICONS } from './lib/icons.js';

// Only let web favicons into this privileged chrome document (no file:/pane:/js: schemes).
const SAFE_FAVICON = /^(?:https?|data):/i;

const TITLE_H = 28; // title-bar height in fixed screen px, drawn ABOVE the page rect

const root = $('#canvas');
const els = new Map(); // pane id → { wrap, shot, ring, titleBar, favicon, titleText, img } (diffed across renders)

let state = { on: false, scale: 1, panes: [] };
let panMoved = false; // set while a pan drag moves, so the trailing click doesn't also raise a tile

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

  // The frozen snapshot tile (shown for non-active panes; the active pane is the live view, so its
  // shot is hidden and the page shows through the hole). Scaled to the pane's screen rect.
  const shot = document.createElement('div');
  shot.className = 'pane-shot';

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
  wrap.append(shot, ring, titleBar);
  root.append(wrap);

  const rec = { wrap, shot, ring, titleBar, favicon, titleText, img: null, favKey: null, shotKey: null };

  // Title-bar click raises/focuses the pane (DESIGN: blue marks the active one).
  on(titleBar, 'click', () => window.pane.canvasRaisePane(id));
  // Clicking a frozen tile's body raises it too — but only a clean click, not the tail of a pan drag.
  on(shot, 'click', () => { if (!panMoved) window.pane.canvasRaisePane(id); });
  // Close button — stop the raise click from also firing.
  on(close, 'click', (e) => { e.stopPropagation(); window.pane.closeTab(id); });
  // Title-bar pointer-drag moves the pane (screen-delta per move).
  initTitleDrag(titleBar, id);

  els.set(id, rec);
  return rec;
}

// Position the chrome from the region-local PAGE rect: ring overlays the rect, title bar sits
// directly above it ([x, y - TITLE_H], width × TITLE_H), and the snapshot tile (non-active panes)
// fills the rect.
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

  // The frozen tile: shown for non-active panes (the active pane is the live native view → no tile).
  rec.shot.style.left = `${sc.x}px`;
  rec.shot.style.top = `${sc.y}px`;
  rec.shot.style.width = `${sc.width}px`;
  rec.shot.style.height = `${sc.height}px`;
  setShot(rec, p);

  const label = p.title || 'New Tab';
  if (rec.titleText.textContent !== label) rec.titleText.textContent = label;
  rec.titleBar.title = label;

  setFavicon(rec, p.favicon);
}

// Paint the frozen snapshot as a background-image (cheap to scale). Active pane → no tile (hole for
// the live view); a pane with no snapshot yet → an empty placeholder (the ring + title still mark it).
function setShot(rec, p) {
  const key = !p.active && p.snapshot ? p.snapshot : null;
  if (rec.shotKey !== key) {
    rec.shotKey = key;
    rec.shot.style.backgroundImage = key ? `url("${key}")` : 'none';
  }
  rec.shot.classList.toggle('hidden', !!p.active);
  rec.shot.classList.toggle('empty', !p.active && !p.snapshot);
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
  let captured = false;
  let px = 0;
  let py = 0;

  on(root, 'pointerdown', (e) => {
    // Left-drag pans from empty space or a frozen tile body; middle-mouse pans from anywhere. Never
    // start a pan from the title bar (that's the move handle). Capture is deferred to the first real
    // move so a clean click still reaches the tile (→ raise).
    const onTitle = e.target.closest('.pane-title');
    const start = (e.button === 1) || (e.button === 0 && !onTitle);
    if (!start) return;
    panning = true;
    captured = false;
    panMoved = false;
    px = e.clientX;
    py = e.clientY;
  });

  on(root, 'pointermove', (e) => {
    if (!panning) return;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    if (dx === 0 && dy === 0) return;
    px = e.clientX;
    py = e.clientY;
    panMoved = true;
    if (!captured) { captured = true; root.classList.add('panning'); try { root.setPointerCapture(e.pointerId); } catch { /* unsupported */ } }
    window.pane.canvasPan(dx, dy);
  });

  const end = (e) => {
    if (!panning) return;
    panning = false;
    root.classList.remove('panning');
    if (captured) { try { root.releasePointerCapture(e.pointerId); } catch { /* already released */ } captured = false; }
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
