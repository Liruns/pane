'use strict';
const { BaseWindow, shell } = require('electron');
const { TABSTRIP_HEIGHT, CHROME_HEIGHT, WINDOW, COLORS } = require('../shared/config');
const CH = require('../shared/channels');
const ChromeView = require('./chrome-view');
const TabManager = require('./tab-manager');
const { handlePageKey } = require('./shortcuts');
const settings = require('./settings');
const session = require('./session');

/**
 * One browser window: a BaseWindow hosting the toolbar (ChromeView) over the active
 * tab's page. Owns layout/resize, swaps the visible page on tab change, bridges
 * TabManager events → the toolbar, and persists/restores the session.
 */
class PaneWindow {
  constructor(restore = null) {
    const b = (restore && restore.bounds) || null;
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

    this.win.contentView.addChildView(this.chrome.view);
    this._connect();

    // Chrome-focus keyboard shortcuts via before-input-event — preventDefault here reliably
    // stops the input reaching the page, so Ctrl+Tab etc. don't trigger focus traversal.
    this.chrome.webContents.on('before-input-event', (e, input) => handlePageKey(this.tabs, e, input));

    this._restoreTabs(restore);

    // DESIGN §5: reposition synchronously on resize (don't gate behind renderer rAF).
    this.win.on('will-resize', () => this.layout());
    this.win.on('resize', () => this.layout());
    this.win.on('resized', () => { this.layout(); this._saveSession(); });
    this.win.on('moved', () => this._saveSession());

    this.chrome.webContents.once('did-finish-load', () => this.tabs.refresh());
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
      bounds: this.win.getBounds(),
    };
  }

  _saveSession() {
    if (!settings.get('restoreSession')) return;
    session.save(this.serialize());
  }

  layout() {
    const { width, height } = this.win.getContentBounds();
    if (this._lastBounds && this._lastBounds.width === width && this._lastBounds.height === height) return;
    this._lastBounds = { width, height };

    this.chrome.view.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
    if (this._activeView) {
      const top = CHROME_HEIGHT - 1; // 1px overlap hides the seam (DESIGN §5)
      this._activeView.view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
    }
  }

  /** Grow/shrink the chrome view to host an overlay (suggestions / menu). The view is
   *  transparent below the toolbar, so the page shows through around the panel. */
  setChromeHeight(h) {
    const { width } = this.win.getContentBounds();
    this.chrome.view.setBounds({ x: 0, y: 0, width, height: Math.max(CHROME_HEIGHT, Math.round(h)) });
  }

  _setActiveView(view) {
    if (this._activeView === view) return;
    if (this._activeView) this.win.contentView.removeChildView(this._activeView.view);
    this._activeView = view;
    if (view) {
      this.win.contentView.addChildView(view.view, 0); // below the chrome in z-order
      this._lastBounds = null; // force re-layout for the newly shown view
      this.layout();
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
      const a = state.tabs.find((t) => t.id === state.activeId);
      win.setTitle(a && a.title && a.title !== 'New Tab' ? `${a.title} — Pane` : 'Pane');
    });
  }
}

module.exports = PaneWindow;
