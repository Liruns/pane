'use strict';
// Pane — main-process entry. App lifecycle + window bootstrap.
const { app, BaseWindow } = require('electron');
const PaneWindow = require('./pane-window');
const { registerIpc } = require('./ipc');

/** @type {PaneWindow | null} */
let current = null;

function createWindow() {
  current = new PaneWindow();
}

app.whenReady().then(() => {
  // IPC handlers resolve the active window lazily (→ its TabManager → active tab).
  registerIpc(() => current);
  createWindow();
  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
