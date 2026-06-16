'use strict';
const { WebContentsView } = require('electron');
const { EventEmitter } = require('node:events');
const { canGoBack, canGoForward, goBack, goForward } = require('./nav-history');
const { COLORS } = require('../shared/config');

/**
 * One web-page surface — a native WebContentsView plus its navigation behavior.
 * Self-contained controller: one instance today, many later (tabs → canvas).
 * Emits: 'loading'(bool), 'nav-state'({url,canGoBack,canGoForward}), 'load-error',
 *        'title'(string), 'open-external'(url).
 */
class PageView extends EventEmitter {
  constructor() {
    super();
    this.view = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    this.view.setBackgroundColor(COLORS.canvas); // seam-hider (DESIGN §2)
    this._wireEvents();
  }

  get webContents() { return this.view.webContents; }

  _wireEvents() {
    const wc = this.webContents;
    wc.on('did-start-loading', () => this.emit('loading', true));
    wc.on('did-stop-loading', () => { this.emit('loading', false); this._emitState(); });
    // DESIGN §4/§15: main-frame navigations only (ignore SPA in-page + subframes).
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) this.emit('loading', true);
    });
    wc.on('did-navigate', () => this._emitState());
    wc.on('did-navigate-in-page', () => this._emitState());
    // DESIGN §14: a failed nav must end the loading bar (never hang). -3 = ERR_ABORTED.
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        this.emit('loading', false);
        this.emit('load-error', { code, desc, url });
      }
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
    this.emit('nav-state', {
      url: wc.getURL(),
      canGoBack: canGoBack(wc),
      canGoForward: canGoForward(wc),
    });
  }

  navigate(url) { this.webContents.loadURL(url); }
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
