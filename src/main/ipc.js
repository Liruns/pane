'use strict';
const { ipcMain } = require('electron');
const CH = require('../shared/channels');

/**
 * Register the toolbar→main handlers once. Page commands route to the active tab;
 * tab commands route to the active window's TabManager. Resolved lazily via
 * getWindow() so the wiring is window/tab-aware.
 */
function registerIpc(getWindow) {
  const tabsOf = () => { const w = getWindow(); return w ? w.tabs : null; };
  const active = () => { const t = tabsOf(); return t ? t.active : null; };
  const onActive = (fn) => () => { const p = active(); if (p) fn(p); };

  ipcMain.handle(CH.NAVIGATE, (_e, url) => { const p = active(); if (p) p.navigate(url); });
  ipcMain.handle(CH.BACK, onActive((p) => p.back()));
  ipcMain.handle(CH.FORWARD, onActive((p) => p.forward()));
  ipcMain.handle(CH.RELOAD, onActive((p) => p.reload()));
  ipcMain.handle(CH.STOP, onActive((p) => p.stop()));
  ipcMain.handle(CH.TOGGLE_DEVTOOLS, onActive((p) => p.toggleDevTools()));

  ipcMain.handle(CH.TAB_NEW, () => { const t = tabsOf(); if (t) t.newTab(); });
  ipcMain.handle(CH.TAB_CLOSE, (_e, id) => { const t = tabsOf(); if (t) t.closeTab(id); });
  ipcMain.handle(CH.TAB_ACTIVATE, (_e, id) => { const t = tabsOf(); if (t) t.activate(id); });
  ipcMain.handle(CH.TOGGLE_MAXIMIZE, () => {
    const w = getWindow();
    if (w) { w.win.isMaximized() ? w.win.unmaximize() : w.win.maximize(); }
  });
  ipcMain.handle(CH.SET_CHROME_HEIGHT, (_e, h) => { const w = getWindow(); if (w) w.setChromeHeight(h); });
}

module.exports = { registerIpc };
