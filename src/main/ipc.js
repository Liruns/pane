'use strict';
const { ipcMain } = require('electron');
const CH = require('../shared/channels');

/**
 * Register the toolbar→main command handlers once. Each routes to the *active* page,
 * resolved lazily via getActivePage() — single window now, tab/window-aware later.
 */
function registerIpc(getActivePage) {
  const withPage = (fn) => () => { const p = getActivePage(); if (p) fn(p); };

  ipcMain.handle(CH.NAVIGATE, (_e, url) => { const p = getActivePage(); if (p) p.navigate(url); });
  ipcMain.handle(CH.BACK, withPage((p) => p.back()));
  ipcMain.handle(CH.FORWARD, withPage((p) => p.forward()));
  ipcMain.handle(CH.RELOAD, withPage((p) => p.reload()));
  ipcMain.handle(CH.STOP, withPage((p) => p.stop()));
  ipcMain.handle(CH.TOGGLE_DEVTOOLS, withPage((p) => p.toggleDevTools()));
}

module.exports = { registerIpc };
