'use strict';
const { BaseWindow, shell, screen } = require('electron');
const { TABSTRIP_HEIGHT, CHROME_HEIGHT, WINDOW, COLORS } = require('../shared/config');
const CH = require('../shared/channels');
const ChromeView = require('./chrome-view');
const TabManager = require('./tab-manager');
const TabLayout = require('./tab-layout');
const Camera = require('./canvas/camera');
const CanvasLayout = require('./canvas/canvas-layout');
const Canvas = require('./canvas/canvas');
const arrange = require('./canvas/arrange');
const DevtoolsDock = require('./devtools-dock');
const Sidebar = require('./sidebar');
const { handlePageKey } = require('./shortcuts');
const settings = require('./settings');
const session = require('./session');

/** Clamp saved window bounds onto a currently-connected display so a window restored from a
 *  now-disconnected monitor (or a changed layout) can't open fully off-screen. */
function clampToDisplay(b) {
  if (!b) return null;
  try {
    const area = screen.getDisplayMatching({
      x: b.x | 0, y: b.y | 0, width: b.width || WINDOW.width, height: b.height || WINDOW.height,
    }).workArea;
    const width = Math.min(b.width || WINDOW.width, area.width);
    const height = Math.min(b.height || WINDOW.height, area.height);
    const x = Math.min(Math.max(b.x ?? area.x, area.x), area.x + area.width - width);
    const y = Math.min(Math.max(b.y ?? area.y, area.y), area.y + area.height - height);
    return { x, y, width, height };
  } catch { return null; }
}

/**
 * One browser window: a BaseWindow hosting the toolbar (ChromeView) over the active
 * tab's page. Owns layout/resize, swaps the visible page on tab change, bridges
 * TabManager events → the toolbar, and persists/restores the session.
 */
class PaneWindow {
  constructor(restore = null) {
    const b = clampToDisplay((restore && restore.bounds) || null);
    this.win = new BaseWindow({
      width: (b && b.width) || WINDOW.width,
      height: (b && b.height) || WINDOW.height,
      x: b ? b.x : undefined,
      y: b ? b.y : undefined,
      minWidth: WINDOW.minWidth,
      minHeight: WINDOW.minHeight,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: COLORS.surface, symbolColor: COLORS.symbol, height: TABSTRIP_HEIGHT },
      backgroundColor: COLORS.canvas,
      // NB: Mica (backgroundMaterial:'mica') is intentionally NOT set — it renders black with
      // titleBarOverlay and breaks on maximize (electron/electron issues 42393, 39959, 41824).
      // Native window buttons win per the brief, so the toolbar ships opaque. Revisit if fixed.
    });

    this.chrome = new ChromeView();
    this.tabs = new TabManager();
    this._activeView = null;       // the active/focused pane (drives the toolbar, dock, focus)
    this._mounted = new Set();      // PageViews currently added as child views (visible). Tabs mode
                                    // mounts just the active view; canvas mode mounts every pane (CANVAS.md).
    this._mode = 'tabs';            // 'tabs' | 'canvas' — which layout strategy is live (CANVAS.md)
    this._lastBounds = null;
    this._chromeHeight = CHROME_HEIGHT; // grows while an overlay is open; layout() honors it

    // Docked devtools (DESIGN §4) — placement / splitter / detach / persistence live in this
    // controller, injected with the few window capabilities it needs. The window keeps the layout
    // math (delegating the page region to dock.layoutInto) and the tab-event bridging.
    this.dock = new DevtoolsDock({
      win: this.win,
      getActiveView: () => this._activeView,
      relayout: () => { this._lastBounds = null; this.layout(); },
      sendState: (payload) => { if (!this.win.isDestroyed()) this.chrome.send(CH.DEVTOOLS_STATE, payload); },
      // The dock tiles within the region right of the vertical-tabs rail; getInset() is the rail's
      // current width so a splitter drag clamps against the same span layout() does (DESIGN §5).
      getInset: () => this.sidebar.width(),
    });

    // Vertical tabs (DESIGN §11) — a left rail hosting the tab list as a second WebContentsView,
    // tiled left of the page like the devtools dock. Off by default; restored on chrome load below.
    this.sidebar = new Sidebar({ win: this.win, refreshTabs: () => this.tabs.refresh() });
    this._verticalTabs = !!settings.get('verticalTabs');

    // The content-region layout strategies (CANVAS.md). layout() does the window-level math and hands
    // the post-rail region to _layout.place(); _layout points at one strategy, so swapping it swaps
    // the mode and the window stays closed to the difference.
    //  • TabLayout   — fills the region with the active tab (deferring to the devtools dock).
    //  • CanvasLayout — tiles every pane from the shared Camera (zoom/pan).
    this._camera = new Camera();
    this._tabLayout = new TabLayout({ dock: this.dock, getActiveView: () => this._activeView });
    this._canvasLayout = new CanvasLayout({ camera: this._camera, getPanes: () => this._canvasPanes() });
    this._layout = this._tabLayout;

    // The canvas surface view (off until canvas mode). Owns only the WebContentsView lifecycle; the
    // Camera / world rects / gesture math live here in the window. onReady → push the first frame.
    this.canvas = new Canvas({ win: this.win, onReady: () => this._pushCanvas() });

    this.win.contentView.addChildView(this.chrome.view);
    this._connect();

    // Chrome-focus keyboard shortcuts via before-input-event — preventDefault here reliably
    // stops the input reaching the page, so Ctrl+Tab etc. don't trigger focus traversal.
    this.chrome.webContents.on('before-input-event', (e, input) => handlePageKey(this.tabs, e, input));

    this._restoreTabs(restore);
    if (restore && restore.maximized) this.win.maximize();

    // DESIGN §5: reposition synchronously on resize (don't gate behind renderer rAF).
    // 'will-resize' carries the size the window is BECOMING — lay out to that, not the stale current size.
    this.win.on('will-resize', (_e, bounds) => this.layout(bounds));
    this.win.on('resize', () => this.layout());
    this.win.on('resized', () => { this.layout(); this._saveSession(); });
    this.win.on('moved', () => this._saveSession());
    // Take any detached devtools windows + per-tab hosts down with the main window. The OS 'X' fires
    // 'closed' without routing through TabManager teardown, so the dock retires them explicitly.
    this.win.on('closed', () => { this.dock.handleWindowClosed(this.tabs.tabs); this.sidebar.destroy(); this.canvas.destroy(); });

    // DESIGN §14: when the app loses focus the chrome goes inert (a subtle muted shift, matching
    // native Win11 inactive-window behavior). The renderer applies the visual; main just reports state.
    this.win.on('focus', () => this._sendActive(true));
    this.win.on('blur', () => this._sendActive(false));

    this.chrome.webContents.once('did-finish-load', () => {
      // Restore the rail (if persisted on) and tell the chrome which mode it's in, so the top strip
      // hides and the menu toggle reflects reality from the first paint.
      if (this._verticalTabs) this.setVerticalTabs(true);
      if (settings.get('canvasMode')) this.setCanvasMode(true); // restore canvas mode (CANVAS.md)
      this._sendLayoutState();
      this.tabs.refresh();
      this._sendActive(this.win.isFocused()); // sync initial inert state once the toolbar is listening
    });
  }

  /** Tell the chrome which layout modes are live (menu checks, body classes). */
  _sendLayoutState() {
    this.chrome.send(CH.LAYOUT_STATE, { verticalTabs: this.sidebar.enabled, canvasMode: this._mode === 'canvas' });
  }

  _restoreTabs(restore) {
    const urls = restore && Array.isArray(restore.tabs) && restore.tabs.length ? restore.tabs : null;
    if (urls) {
      urls.forEach((u) => this.tabs.newTab(u || undefined));
      const arr = this.tabs.tabs;
      const idx = Math.min(Math.max(0, restore.activeIndex | 0), arr.length - 1);
      if (arr[idx]) this.tabs.activate(arr[idx].id);
    } else {
      this.tabs.newTab(); // fresh start page
    }
  }

  serialize() {
    const tabs = this.tabs.tabs;
    return {
      tabs: tabs.map((t) => (/^https?:\/\//i.test(t.url) ? t.url : '')),
      activeIndex: Math.max(0, tabs.findIndex((t) => t.id === this.tabs.activeId)),
      // When maximized, persist the NORMAL bounds so un-maximize after restore returns a sane size.
      bounds: this.win.isMaximized() ? this.win.getNormalBounds() : this.win.getBounds(),
      maximized: this.win.isMaximized(),
    };
  }

  _saveSession() {
    if (this.win.isDestroyed() || !settings.get('restoreSession')) return;
    session.save(this.serialize());
  }

  _sendActive(active) {
    if (this.win.isDestroyed()) return;
    this.chrome.send(CH.WINDOW_ACTIVE, { active: !!active });
  }

  layout(targetBounds) {
    if (this.win.isDestroyed()) return; // a resize event can still fire mid-teardown
    // Prefer the target size from 'will-resize' (the size the window is becoming) over the stale
    // current content bounds, so the native view tracks the drag without a one-frame lag (DESIGN §5).
    const { width, height } = targetBounds || this.win.getContentBounds();
    if (this._lastBounds && this._lastBounds.width === width && this._lastBounds.height === height) return;
    this._lastBounds = { width, height };

    this.chrome.view.setBounds({ x: 0, y: 0, width, height: this._chromeHeight });
    if (!this._activeView) return;

    const top = CHROME_HEIGHT - 1; // 1px overlap hides the seam (DESIGN §5)
    const regionH = Math.max(0, height - top);
    // The vertical-tabs rail (when on) takes the region's left edge; the page region starts after it.
    const left = this.sidebar.layout({ top, regionH, width });
    // In canvas mode the canvas surface fills the whole region (under the page views); the page
    // views are then tiled over it by CanvasLayout.
    if (this._mode === 'canvas') this.canvas.layout({ left, top, width, regionH });
    // Hand the post-rail content region to the active layout strategy. Tabs mode fills it with the
    // active tab (deferring to the devtools dock for page │ splitter │ host); CanvasLayout tiles
    // every pane from the camera (CANVAS.md).
    this._layout.place({ left, top, width, regionH });
  }

  /** Grow/shrink the chrome view to host an overlay (suggestions / menu). The view is
   *  transparent below the toolbar, so the page shows through around the panel. */
  setChromeHeight(h) {
    if (this.win.isDestroyed()) return;
    this._chromeHeight = Math.max(CHROME_HEIGHT, Math.round(h)); // remember so a resize won't collapse an open overlay
    const { width } = this.win.getContentBounds();
    this.chrome.view.setBounds({ x: 0, y: 0, width, height: this._chromeHeight });
  }

  _setActiveView(view) {
    if (this._activeView === view) return;
    this._activeView = view;
    this._syncMountedViews(); // mount the set this mode shows (tabs: active only; canvas: every pane)
    if (view) {
      // The active view changed, so the new view must be (re)tiled even when the window size is
      // unchanged. dock.reconcile() only relayouts when the dock state itself changes (it early-outs
      // otherwise), so it can't be relied on to size the new view — invalidate the size-cache and
      // lay out explicitly. Order matters: nulling before reconcile lets a dock-driven relayout
      // reset _lastBounds so the trailing layout() no-ops instead of tiling twice.
      this._lastBounds = null;
      if (this._mode !== 'canvas') this.dock.reconcile(); // canvas mode runs no docked devtools
      this.layout();         // tile page │ (splitter │ devtools), or the whole canvas
      // Keep keyboard focus on the visible tab — otherwise a tab switch orphans focus
      // and the next Ctrl+Tab (a before-input-event) lands on no webContents.
      if (!view.webContents.isDestroyed()) view.webContents.focus();
      this._pushCanvas(); // the active pane changed → refresh the canvas frames (active ring)
    }
  }

  /** Recompute which page views are mounted (visible) for the current layout mode and reconcile the
   *  child-view set. Tabs mode shows exactly the active view; canvas mode shows every pane. */
  _syncMountedViews() {
    if (this._mode === 'canvas') {
      this._mountViews(this.tabs.tabs.map((t) => t.view));
      this._restackCanvas();
    } else {
      this._mountViews(this._activeView ? [this._activeView] : []);
    }
  }

  /** Mount exactly `list` (PageViews) as child views below the chrome, diffing against what's already
   *  mounted — add the new, remove the gone. The window's single place a page view becomes visible. */
  _mountViews(list) {
    const next = new Set(list);
    for (const v of this._mounted) {
      if (!next.has(v)) { this.win.contentView.removeChildView(v.view); this._mounted.delete(v); }
    }
    for (const v of next) {
      if (!this._mounted.has(v)) { this.win.contentView.addChildView(v.view, 0); this._mounted.add(v); } // below the chrome in z-order
    }
  }

  /** Enforce canvas z-order (bottom → top): canvas surface · inactive panes · active pane · chrome.
   *  addChildView moves an existing child, so re-adding in order restacks without re-creating views. */
  _restackCanvas() {
    const cv = this.win.contentView;
    if (this.canvas.view) cv.addChildView(this.canvas.view, 0); // the surface sits beneath the panes
    for (const t of this.tabs.tabs) if (t.id !== this.tabs.activeId) cv.addChildView(t.view.view);
    const act = this.tabs.tabs.find((t) => t.id === this.tabs.activeId);
    if (act) cv.addChildView(act.view.view); // the focused pane rises to the top of the stack
    cv.addChildView(this.chrome.view);        // chrome always on top (overlays, WCO)
  }

  _connect() {
    const { tabs, chrome, win } = this;
    tabs.on('active-page', (view) => this._setActiveView(view));
    tabs.on('all-closed', () => this.win.close());
    tabs.on('loading', (loading) => chrome.send(CH.LOADING, { loading }));
    // Any change in the active tab's devtools (open/close/tab-switch) → re-fit the dock and
    // re-sync the toolbar's icon + dock indicator. The boolean is ignored; placement is the truth.
    tabs.on('devtools', () => this.dock.refresh());
    tabs.on('devtools-toggle', () => this.dock.toggle()); // Ctrl+Shift+I (page focus)
    tabs.on('toggle-vertical-tabs', () => this.setVerticalTabs(!this.sidebar.enabled)); // Ctrl+Shift+E
    tabs.on('tab-closed', (view) => this.dock.teardown(view));
    tabs.on('nav-state', (state) => chrome.send(CH.NAV_STATE, state));
    tabs.on('load-error', (err) => chrome.send(CH.LOAD_ERROR, err));
    tabs.on('focus-address', () => chrome.send(CH.FOCUS_ADDRESS));
    tabs.on('open-find', () => chrome.send(CH.OPEN_FIND));
    // The command palette is a full-window modal: focus the chrome so its input gets keys, and hand
    // the renderer the content height so it can grow the chrome view to cover (and dim) the page.
    tabs.on('open-palette', () => {
      if (win.isDestroyed()) return;
      chrome.webContents.focus();
      chrome.send(CH.OPEN_PALETTE, { height: win.getContentBounds().height });
    });
    tabs.on('found', (r) => chrome.send(CH.FOUND_RESULT, r));
    tabs.on('toast', (m) => chrome.send(CH.TOAST, m));
    tabs.on('open-external', (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });
    tabs.on('tabs', (state) => {
      chrome.send(CH.TABS_STATE, state);
      this.sidebar.send(CH.TABS_STATE, state); // the rail mirrors the top strip (no-op until enabled)
      this._ensureWorlds();                    // a new pane needs a world rect before it can be tiled
      this._pushCanvas();                      // refresh canvas frames (title / favicon / loading)
      this._saveSession();
      if (win.isDestroyed()) return;
      const a = state.tabs.find((t) => t.id === state.activeId);
      win.setTitle(a && a.title && a.title !== 'New Tab' ? `${a.title} — Pane` : 'Pane');
    });
  }

  /* ── Docked devtools (DESIGN §4) ────────────────────────────────────────────
     All placement / splitter / detach / persistence lives in DevtoolsDock. The window keeps thin
     facades for the IPC + keyboard paths and delegates page-region tiling to dock.layoutInto(). */
  toggleDevtools() { this.dock.toggle(); }            // toolbar click / Ctrl+Shift+I
  setDevtoolsDock(side) { this.dock.setDock(side); }  // dock picker: 'right' | 'bottom' | 'detach'
  onSplitterDrag(x, y) { this.dock.onSplitterDrag(x, y); }
  onSplitterDragEnd() { this.dock.onSplitterDragEnd(); }

  /* ── Vertical tabs (DESIGN §11) ──────────────────────────────────────────────
     Toggle the left rail on/off: persist the choice, attach/detach the rail view, re-tile so the
     page region insets/un-insets, and tell the chrome renderer (it hides the top strip + checks the
     menu toggle off the LAYOUT_STATE push). Page-region math stays in layout(); the rail owns only
     its own bounds + inset width. */
  setVerticalTabs(on) {
    if (this.win.isDestroyed()) return;
    on = !!on;
    this._verticalTabs = on;
    settings.set('verticalTabs', on);
    // If the rail being removed currently holds keyboard focus, re-home it to the page — otherwise
    // focus is orphaned on the detached view and the next before-input-event shortcut (Ctrl+Tab …)
    // lands on no webContents (mirrors the tab-switch focus guard in _setActiveView).
    const rehome = !on && this.sidebar.isFocused();
    this.sidebar.setEnabled(on);
    if (rehome && this._activeView && !this._activeView.webContents.isDestroyed()) {
      this._activeView.webContents.focus();
    }
    this._lastBounds = null; // region width changed — force a full re-tile
    this.layout();
    this._sendLayoutState();
  }

  /* ── Infinite canvas (DESIGN §11 / CANVAS.md) ────────────────────────────────
     Canvas mode tiles every pane on one zoom-/pan-able surface instead of swapping one active tab.
     The window owns the Camera, the per-tab world rects, and the gesture math; the Canvas controller
     owns only the surface view, and CanvasLayout does the tiling. v1 is static+zoom: drag the canvas
     to pan, wheel to zoom, drag a pane's title bar to move it. Devtools docking and the rail are off
     in canvas mode (they'd fight the surface for the region). */
  setCanvasMode(on) {
    if (this.win.isDestroyed()) return;
    on = !!on;
    const mode = on ? 'canvas' : 'tabs';
    if (mode === this._mode) return;
    this._mode = mode;
    settings.set('canvasMode', on);
    if (on) {
      if (this.sidebar.enabled) this.setVerticalTabs(false); // the canvas owns the whole region (v1)
      for (const t of this.tabs.tabs) t.view.closeDevtools();  // no docked devtools over the canvas
      this.dock.refresh();
      this._ensureWorlds();
      this.canvas.setEnabled(true);
      this._layout = this._canvasLayout;
    } else {
      this.canvas.setEnabled(false);
      this._layout = this._tabLayout;
    }
    this._syncMountedViews(); // canvas: mount every pane (+ restack); tabs: the active view only
    this._lastBounds = null;  // mode changed the whole region — force a full re-tile
    this.layout();
    this._sendLayoutState();
    this._pushCanvas();
  }

  /** Give every pane a world rect if it lacks one (a fresh tab) — seeded on a grid (arrange.js). */
  _ensureWorlds() {
    this.tabs.tabs.forEach((t, i) => { if (!t.world) t.world = arrange.slotRect(i); });
  }

  /** The current content region (right of the rail, below the chrome) in window coords. */
  _region() {
    const { width, height } = this.win.getContentBounds();
    const top = CHROME_HEIGHT - 1;
    return { left: this.sidebar.width(), top, width, regionH: Math.max(0, height - top) };
  }

  /** Panes adapted for CanvasLayout: a world rect + a setBounds that tiles the native page view. */
  _canvasPanes() {
    return this.tabs.tabs
      .filter((t) => t.world && !t.view.webContents.isDestroyed())
      .map((t) => ({ world: t.world, setBounds: (r) => t.view.view.setBounds(r) }));
  }

  /** Push the canvas frame state (camera + each pane's region-local clamped screen rect) to the
   *  surface renderer. No-op outside canvas mode. */
  _pushCanvas() {
    if (this._mode !== 'canvas') return;
    const region = this._region();
    const { left, top } = region;
    const panes = this.tabs.tabs.filter((t) => t.world).map((t) => {
      const abs = this._canvasLayout.screenRectFor(t.world, region); // absolute, clamped to the region
      return {
        id: t.id,
        title: t.title || 'New Tab',
        favicon: t.favicon || '',
        active: t.id === this.tabs.activeId,
        loading: !!t.loading,
        screen: { x: abs.x - left, y: abs.y - top, width: abs.width, height: abs.height }, // region-local
      };
    });
    this.canvas.send(CH.CANVAS_STATE, { on: true, scale: this._camera.scale, panes });
  }

  /** Re-tile the page views after a camera/world change and refresh the frames. */
  _canvasRelayout() {
    this._lastBounds = null; // camera moves don't change window size — bypass the size cache
    this.layout();
    this._pushCanvas();
  }

  /* Gesture handlers (canvas → main, forwarded by ipc.js). All no-op outside canvas mode. */
  onCanvasPan(dx, dy) {
    if (this._mode !== 'canvas') return;
    this._camera.panBy(dx, dy);
    this._canvasRelayout();
  }
  onCanvasZoom(factor, ax, ay) {
    if (this._mode !== 'canvas') return;
    this._camera.zoomBy(factor, ax, ay);
    this._canvasRelayout();
  }
  onCanvasPaneMove(id, dx, dy) {
    if (this._mode !== 'canvas') return;
    const t = this.tabs.tabs.find((x) => x.id === id);
    if (!t || !t.world) return;
    // The drag delta is in screen px; divide by scale to move the pane the same distance in world space.
    t.world.x += dx / this._camera.scale;
    t.world.y += dy / this._camera.scale;
    this._canvasRelayout();
  }
  raiseCanvasPane(id) {
    if (this._mode !== 'canvas') return;
    this.tabs.activate(id); // → active-page → _setActiveView restacks (pane to top) + refreshes frames
  }

  /** IPC trust boundary (defense-in-depth): only this window's own chrome (toolbar) and splitter
   *  views may drive the window.pane / splitter channels. Page/web views get the scoped
   *  `paneInternal` bridge (re-validated in internal-ipc) and no raw ipcRenderer, so they can't reach
   *  the chrome lane — but ipc.js validates every sender through here so the lane never trusts a
   *  stray view (a compromised/embedded frame, a future extra view) by default.
   *
   *  Per-sender routing: ipc.js resolves the window via `windows.fromSender(sender)` (which calls
   *  owns() below), so this gate validates against the *sender's own* window — the canvas/multi-window
   *  groundwork (DESIGN §11). With one window it resolves to that window; with several, a second
   *  window's legit chrome routes to — and is trusted by — its own window, not "the current" one. */
  isTrustedChromeSender(wc) {
    if (this.win.isDestroyed() || !wc) return false;
    if (wc === this.chrome.webContents) return true;
    // The vertical-tabs rail is privileged chrome (same preload as the toolbar) — it drives the
    // tab channels (activate/close/new/move), so it must be trusted alongside the chrome + splitter.
    if (this.sidebar.isSender(wc)) return true;
    // The canvas surface is privileged chrome too — it drives pan/zoom/move + tab channels (CANVAS.md).
    if (this.canvas.isSender(wc)) return true;
    return this.dock.isSplitterSender(wc);
  }

  /** Does `wc` belong to this window? Used by the registry (windows.fromSender) to route IPC to the
   *  sender's window — the multi-window / canvas story (DESIGN §11). Broader than
   *  isTrustedChromeSender, which gates the *trusted chrome lane* specifically: owns() also matches
   *  the page views (and their devtools hosts) so the internal-page lane (window.paneInternal) routes
   *  to the right window too. Routing ≠ trust — each lane still re-gates (chrome via
   *  isTrustedChromeSender, pages via internal-ipc's fromInternal). */
  owns(wc) {
    if (this.win.isDestroyed() || !wc) return false;
    if (this.isTrustedChromeSender(wc)) return true; // chrome + sidebar rail + devtools splitter
    for (const t of this.tabs.tabs) {
      if (t.view.webContents === wc) return true;          // a tab's page view
      const dt = t.view.devtoolsView;                      // …or its (lazy) devtools host
      if (dt && !dt.webContents.isDestroyed() && dt.webContents === wc) return true;
    }
    return false;
  }
}

module.exports = PaneWindow;
