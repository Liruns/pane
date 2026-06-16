'use strict';
const { BaseWindow, shell } = require('electron');
const { TOOLBAR_HEIGHT, WINDOW, COLORS } = require('../shared/config');
const CH = require('../shared/channels');
const ChromeView = require('./chrome-view');
const PageView = require('./page-view');
const { registerShortcuts } = require('./shortcuts');

/**
 * One browser window: a BaseWindow hosting the toolbar (ChromeView) over a single
 * page (PageView). Owns layout/resize and the page→toolbar event bridge.
 */
class PaneWindow {
  constructor() {
    this.win = new BaseWindow({
      width: WINDOW.width,
      height: WINDOW.height,
      minWidth: WINDOW.minWidth,
      minHeight: WINDOW.minHeight,
      // Frameless-with-native-buttons = titleBarStyle 'hidden' + titleBarOverlay
      // (NOT frame:false, which removes the native caption buttons + resize borders).
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: COLORS.surface, symbolColor: COLORS.symbol, height: TOOLBAR_HEIGHT },
      backgroundColor: COLORS.canvas,
      backgroundMaterial: 'mica', // Win11 translucency (DESIGN §1/§6)
    });

    this.chrome = new ChromeView();
    this.page = new PageView();
    this.win.contentView.addChildView(this.chrome.view);
    this.win.contentView.addChildView(this.page.view);

    this._lastBounds = null;
    this._connect();
    this.layout();
    this.page.loadStart(); // open on the new-tab start page (DESIGN §14)

    // DESIGN §5: reposition synchronously on resize (don't gate behind renderer rAF).
    this.win.on('will-resize', () => this.layout());
    this.win.on('resize', () => this.layout());
    this.win.on('resized', () => this.layout());

    registerShortcuts(this.page, this.chrome);
  }

  layout() {
    const { width, height } = this.win.getContentBounds();
    // optimization: skip redundant setBounds when the size hasn't changed.
    if (this._lastBounds && this._lastBounds.width === width && this._lastBounds.height === height) return;
    this._lastBounds = { width, height };

    this.chrome.view.setBounds({ x: 0, y: 0, width, height: TOOLBAR_HEIGHT });
    const top = TOOLBAR_HEIGHT - 1; // 1px overlap hides the seam (DESIGN §5)
    this.page.view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
  }

  _connect() {
    const { page, chrome, win } = this;
    page.on('loading', (loading) => chrome.send(CH.LOADING, { loading }));
    page.on('nav-state', (state) => chrome.send(CH.NAV_STATE, state));
    page.on('load-error', (err) => chrome.send(CH.LOAD_ERROR, err));
    page.on('title', (title) => {
      win.setTitle(title ? `${title} — Pane` : 'Pane');
      chrome.send(CH.TITLE, { title });
    });
    page.on('open-external', (url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });
  }
}

module.exports = PaneWindow;
