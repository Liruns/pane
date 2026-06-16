'use strict';
const path = require('node:path');
const { WebContentsView } = require('electron');
const { EventEmitter } = require('node:events');
const { canGoBack, canGoForward, goBack, goForward } = require('./nav-history');
const { COLORS } = require('../shared/config');

const PAGES_DIR = path.join(__dirname, '..', 'renderer', 'pages');
const START_PAGE = path.join(PAGES_DIR, 'start.html');
const ERROR_PAGE = path.join(PAGES_DIR, 'error.html');
const isInternalUrl = (u) => typeof u === 'string' && u.includes('/renderer/pages/');

/**
 * One web-page surface — a native WebContentsView plus its navigation behavior.
 * Self-contained controller: one instance today, many later (tabs → canvas).
 * Internal pages (start / error) are local file:// docs; the toolbar address bar
 * shows a clean override (empty for start, the attempted URL for error) instead
 * of their file path.
 * Emits: 'loading'(bool), 'nav-state'({url,canGoBack,canGoForward}),
 *        'load-error'({code,desc,url}), 'title'(string), 'open-external'(url).
 */
class PageView extends EventEmitter {
  constructor() {
    super();
    this.view = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    this.view.setBackgroundColor(COLORS.canvas); // seam-hider (DESIGN §2)
    this._displayUrl = null;     // override for the address bar on internal pages
    this._internalLoad = false;  // suppress the loading bar for instant local pages
    this._wireEvents();
  }

  get webContents() { return this.view.webContents; }

  _wireEvents() {
    const wc = this.webContents;

    wc.on('did-start-loading', () => { if (!this._internalLoad) this.emit('loading', true); });
    wc.on('did-stop-loading', () => { this._internalLoad = false; this.emit('loading', false); this._emitState(); });

    // DESIGN §4/§15: main-frame navigations only (ignore SPA in-page + subframes).
    wc.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace) return;
      if (isInternalUrl(url)) { this._internalLoad = true; return; } // keep override, no bar
      this._displayUrl = null; // a real navigation → show the real URL
      this.emit('loading', true);
    });

    wc.on('did-navigate', () => this._emitState());
    wc.on('did-navigate-in-page', () => this._emitState());

    // DESIGN §14: a failed main-frame nav paints the custom error page (and never hangs).
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !isInternalUrl(url)) this.loadError(url, code, desc);
    });

    wc.on('page-title-updated', (_e, title) => this.emit('title', title));

    // Dev-tool hand-off (brief): window.open / target=_blank → system browser.
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
    this.webContents.loadFile(START_PAGE);
  }

  /** The custom error surface (DESIGN §14). Keeps the attempted URL in the address bar. */
  loadError(url, code, desc) {
    this._displayUrl = url || '';
    this._internalLoad = true;
    this.emit('loading', false);
    this.emit('load-error', { code, desc, url });
    this.webContents.loadFile(ERROR_PAGE, {
      query: { url: url || '', code: String(code ?? ''), desc: desc || '' },
    });
  }

  back() { if (this.canGoBack()) goBack(this.webContents); }
  forward() { if (this.canGoForward()) goForward(this.webContents); }
  reload() { this.webContents.reload(); }
  stop() { this.webContents.stop(); }
  canGoBack() { return canGoBack(this.webContents); }
  canGoForward() { return canGoForward(this.webContents); }

  toggleDevTools() {
    const wc = this.webContents;
    // DESIGN §4: detached in v0 (docking into a custom layout is a roadmap item).
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  }
}

module.exports = PageView;
