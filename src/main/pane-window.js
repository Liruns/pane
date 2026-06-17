'use strict';
const { BaseWindow, shell, screen } = require('electron');
const { TABSTRIP_HEIGHT, CHROME_HEIGHT, WINDOW, COLORS } = require('../shared/config');
const CH = require('../shared/channels');
const ChromeView = require('./chrome-view');
const TabManager = require('./tab-manager');
const DevtoolsDock = require('./devtools-dock');
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
    this._activeView = null;
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
    });

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
    this.win.on('closed', () => this.dock.handleWindowClosed(this.tabs.tabs));

    // DESIGN §14: when the app loses focus the chrome goes inert (a subtle muted shift, matching
    // native Win11 inactive-window behavior). The renderer applies the visual; main just reports state.
    this.win.on('focus', () => this._sendActive(true));
    this.win.on('blur', () => this._sendActive(false));

    this.chrome.webContents.once('did-finish-load', () => {
      this.tabs.refresh();
      this._sendActive(this.win.isFocused()); // sync initial state once the toolbar is listening
    });
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
    const page = this._activeView.view;
    // When devtools is docked the dock tiles page │ splitter │ host; otherwise the page fills.
    if (!this.dock.layoutInto(page, { top, width, regionH })) {
      page.setBounds({ x: 0, y: top, width, height: regionH });
    }
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
    if (this._activeView) this.win.contentView.removeChildView(this._activeView.view);
    this._activeView = view;
    if (view) {
      this.win.contentView.addChildView(view.view, 0); // below the chrome in z-order
      this.dock.reconcile(); // swap in this tab's dock (or none) and re-lay everything out
      // Keep keyboard focus on the visible tab — otherwise a tab switch orphans focus
      // and the next Ctrl+Tab (a before-input-event) lands on no webContents.
      if (!view.webContents.isDestroyed()) view.webContents.focus();
    }
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
    tabs.on('tab-closed', (view) => this.dock.teardown(view));
    tabs.on('nav-state', (state) => chrome.send(CH.NAV_STATE, state));
    tabs.on('load-error', (err) => chrome.send(CH.LOAD_ERROR, err));
    tabs.on('focus-address', () => chrome.send(CH.FOCUS_ADDRESS));
    tabs.on('open-find', () => chrome.send(CH.OPEN_FIND));
    tabs.on('found', (r) => chrome.send(CH.FOUND_RESULT, r));
    tabs.on('toast', (m) => chrome.send(CH.TOAST, m));
    tabs.on('open-external', (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });
    tabs.on('tabs', (state) => {
      chrome.send(CH.TABS_STATE, state);
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

  /** IPC trust boundary (defense-in-depth): only this window's own chrome (toolbar) and splitter
   *  views may drive the window.pane / splitter channels. Page/web views get the scoped
   *  `paneInternal` bridge (re-validated in internal-ipc) and no raw ipcRenderer, so they can't reach
   *  the chrome lane — but ipc.js validates every sender through here so the lane never trusts a
   *  stray view (a compromised/embedded frame, a future extra view) by default.
   *
   *  Single-window assumption: ipc.js resolves the window via `getWindow()` (today the one live
   *  window), so this gate validates against that window's views. The multi-window / canvas future
   *  must route each message to the *sender's* window before gating — not the current one — or a
   *  second window's legit chrome would be dropped here. v0 has one window, so this is correct now. */
  isTrustedChromeSender(wc) {
    if (this.win.isDestroyed() || !wc) return false;
    if (wc === this.chrome.webContents) return true;
    return this.dock.isSplitterSender(wc);
  }
}

module.exports = PaneWindow;
