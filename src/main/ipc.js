'use strict';
const { ipcMain } = require('electron');
const CH = require('../shared/channels');
const history = require('./history');
const settings = require('./settings');
const session = require('./session');

/**
 * Register the toolbar→main handlers once. Page commands route to the active tab;
 * tab/window commands route to the active window. Resolved lazily via getWindow().
 *
 * Every channel here is part of the trusted CHROME lane (the toolbar + the devtools splitter).
 * `handle`/`on` below drop any message whose sender isn't one of the window's own chrome views,
 * so a web/page view can't reach these even if it somehow obtained a raw ipcRenderer. The page
 * lane is separate (window.paneInternal, re-validated in internal-ipc.js).
 */
function registerIpc(getWindow) {
  const tabsOf = () => { const w = getWindow(); return w ? w.tabs : null; };
  const active = () => { const t = tabsOf(); return t ? t.active : null; };
  const onActive = (fn) => () => { const p = active(); if (p) fn(p); };

  // Sender trust gate (defense-in-depth): only the window's chrome/splitter views drive these.
  const trusted = (e) => { const w = getWindow(); return !!w && w.isTrustedChromeSender(e.sender); };
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (trusted(e) ? fn(e, ...a) : undefined));
  const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (trusted(e)) fn(e, ...a); });

  handle(CH.NAVIGATE, (_e, url) => { const p = active(); if (p) p.navigate(url); });
  handle(CH.BACK, onActive((p) => p.back()));
  handle(CH.FORWARD, onActive((p) => p.forward()));
  handle(CH.RELOAD, onActive((p) => p.reload()));
  handle(CH.STOP, onActive((p) => p.stop()));
  // Devtools placement is a window concern (it owns the dock layout), not a page concern.
  handle(CH.TOGGLE_DEVTOOLS, () => { const w = getWindow(); if (w) w.toggleDevtools(); });
  handle(CH.DEVTOOLS_SET_DOCK, (_e, side) => { const w = getWindow(); if (w) w.setDevtoolsDock(side); });
  // High-frequency splitter drag uses send (not invoke) — no round-trip ack per pointermove.
  on(CH.SPLITTER_DRAG, (_e, x, y) => { const w = getWindow(); if (w) w.onSplitterDrag(x, y); });
  on(CH.SPLITTER_DRAG_END, () => { const w = getWindow(); if (w) w.onSplitterDragEnd(); });

  handle(CH.TAB_NEW, () => { const t = tabsOf(); if (t) t.newTab(); });
  handle(CH.TAB_CLOSE, (_e, id) => { const t = tabsOf(); if (t) t.closeTab(id); });
  handle(CH.TAB_ACTIVATE, (_e, id) => { const t = tabsOf(); if (t) t.activate(id); });
  handle(CH.TAB_MOVE, (_e, id, pos) => { const t = tabsOf(); if (t) t.moveTab(id, pos); });
  handle(CH.TAB_RELOAD, (_e, id) => { const t = tabsOf(); if (t) t.reloadTab(id); });
  handle(CH.TAB_DUPLICATE, (_e, id) => { const t = tabsOf(); if (t) t.duplicate(id); });
  handle(CH.TAB_CLOSE_OTHERS, (_e, id) => { const t = tabsOf(); if (t) t.closeOthers(id); });
  handle(CH.TAB_REOPEN, () => { const t = tabsOf(); if (t) t.reopenClosed(); });

  handle(CH.TOGGLE_MAXIMIZE, () => {
    const w = getWindow();
    if (w) { w.win.isMaximized() ? w.win.unmaximize() : w.win.maximize(); }
  });
  handle(CH.SET_CHROME_HEIGHT, (_e, h) => { const w = getWindow(); if (w) w.setChromeHeight(h); });
  handle(CH.FIND, (_e, text, opts) => { const p = active(); if (p) p.findInPage(text, opts); });
  handle(CH.FIND_STOP, onActive((p) => p.stopFind()));

  handle(CH.HISTORY_QUERY, (_e, input) => history.query(input));
  handle(CH.CLEAR_HISTORY, () => history.clear());

  handle(CH.GET_SETTINGS, () => settings.getAll());
  handle(CH.SET_SETTING, (_e, key, value) => {
    settings.set(key, value);
    if (key === 'restoreSession' && !value) session.clear(); // privacy: drop the saved session
  });
}

module.exports = { registerIpc };
