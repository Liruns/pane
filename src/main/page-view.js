'use strict';
const path = require('node:path');
const { WebContentsView } = require('electron');
const { EventEmitter } = require('node:events');
const { canGoBack, canGoForward, goBack, goForward } = require('./nav-history');
const { COLORS } = require('../shared/config');

const isInternalUrl = (u) => typeof u === 'string' && u.startsWith('pane://');

/**
 * One web-page surface — a native WebContentsView plus its navigation behavior.
 * Internal surfaces (new-tab, error, …) are served over the pane:// protocol.
 * Emits: 'loading'(bool), 'nav-state'(...), 'load-error'(...), 'title'(string),
 *        'favicon'(url), 'navigated'(url), 'found'(result), 'open-external'(url).
 */
class PageView extends EventEmitter {
  constructor() {
    super();
    this.view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'page.js'), // scoped to pane:// pages
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.view.setBackgroundColor(COLORS.canvas); // seam-hider (DESIGN §2)
    this._displayUrl = null;    // address-bar override for internal pages
    this._internalLoad = false; // suppress the loading bar for instant local pages
    this._wireEvents();
  }

  get webContents() { return this.view.webContents; }

  _wireEvents() {
    const wc = this.webContents;

    wc.on('did-start-loading', () => { if (!this._internalLoad) this.emit('loading', true); });
    wc.on('did-stop-loading', () => { this._internalLoad = false; this.emit('loading', false); this._emitState(); });

    wc.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace) return;
      if (isInternalUrl(url)) { this._internalLoad = true; return; }
      this._displayUrl = null;
      this.emit('favicon', '');
      this.emit('loading', true);
    });

    wc.on('did-navigate', (_e, url) => { this.emit('navigated', url); this._emitState(); });
    wc.on('did-navigate-in-page', () => this._emitState());

    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !isInternalUrl(url)) this.loadError(url, code, desc);
    });

    wc.on('page-title-updated', (_e, title) => this.emit('title', title));
    wc.on('page-favicon-updated', (_e, favs) => this.emit('favicon', (favs && favs[0]) || ''));
    wc.on('found-in-page', (_e, result) => this.emit('found', result));

    wc.setWindowOpenHandler(({ url }) => {
      this.emit('open-external', url);
      return { action: 'deny' };
    });
  }

  _emitState() {
    const wc = this.webContents;
    const real = wc.getURL();
    const url = this._displayUrl !== null ? this._displayUrl : (isInternalUrl(real) ? '' : real);
    this.emit('nav-state', { url, canGoBack: canGoBack(wc), canGoForward: canGoForward(wc) });
  }

  navigate(url) { this.webContents.loadURL(url); }

  /** Re-emit the current nav state (used when this tab becomes active). */
  refreshState() { this._emitState(); }

  /** Release the webContents when the tab is closed. */
  destroy() {
    this.removeAllListeners();
    const wc = this.webContents;
    if (wc && !wc.isDestroyed() && typeof wc.close === 'function') {
      try { wc.close(); } catch { /* already gone */ }
    }
  }

  /** The new-tab / start page (DESIGN §14). */
  loadStart() {
    this._displayUrl = '';
    this._internalLoad = true;
    this.webContents.loadURL('pane://newtab/');
  }

  /** The custom error surface (DESIGN §14). Keeps the attempted URL in the address bar. */
  loadError(url, code, desc) {
    this._displayUrl = url || '';
    this._internalLoad = true;
    this.emit('loading', false);
    this.emit('load-error', { code, desc, url });
    const q = new URLSearchParams({ url: url || '', code: String(code ?? ''), desc: desc || '' });
    this.webContents.loadURL('pane://error/?' + q.toString());
  }

  back() { if (this.canGoBack()) goBack(this.webContents); }
  forward() { if (this.canGoForward()) goForward(this.webContents); }
  reload() { this.webContents.reload(); }
  stop() { this.webContents.stop(); }
  canGoBack() { return canGoBack(this.webContents); }
  canGoForward() { return canGoForward(this.webContents); }

  zoomBy(delta) {
    const wc = this.webContents;
    wc.setZoomLevel(Math.max(-3, Math.min(5, wc.getZoomLevel() + delta)));
  }
  resetZoom() { this.webContents.setZoomLevel(0); }

  findInPage(text, opts) { if (text) this.webContents.findInPage(text, opts); }
  stopFind() { this.webContents.stopFindInPage('clearSelection'); }

  toggleDevTools() {
    const wc = this.webContents;
    // DESIGN §4: detached in v0 (docking into a custom layout is a roadmap item).
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  }
}

module.exports = PageView;
