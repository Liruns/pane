'use strict';
// Pane — main-process entry. App lifecycle + window bootstrap.
const { app, BaseWindow } = require('electron');
const PaneWindow = require('./pane-window');
const { registerIpc } = require('./ipc');
const settings = require('./settings');
const session = require('./session');

/** @type {PaneWindow | null} */
let current = null;

function createWindow() {
  const restore = settings.get('restoreSession') ? session.load() : null;
  current = new PaneWindow(restore);
}

app.whenReady().then(() => {
  // IPC handlers resolve the active window lazily (→ its TabManager → active tab).
  registerIpc(() => current);
  createWindow();
  app.on('activate', () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (current && settings.get('restoreSession')) session.saveNow(current.serialize());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
