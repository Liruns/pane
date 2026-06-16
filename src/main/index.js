'use strict';
// Pane — main-process entry. App lifecycle + window bootstrap.
const { app, BaseWindow } = require('electron');
const PaneWindow = require('./pane-window');
const { registerIpc } = require('./ipc');
const { registerScheme, handle } = require('./protocol');
const { registerInternalIpc } = require('./internal-ipc');
const downloads = require('./downloads');
const settings = require('./settings');
const session = require('./session');

registerScheme(); // must run before app 'ready'

/** @type {PaneWindow | null} */
let current = null;

function createWindow() {
  const restore = settings.get('restoreSession') ? session.load() : null;
  current = new PaneWindow(restore);
}

app.whenReady().then(() => {
  handle();                              // serve pane://
  downloads.init();                      // attach to session will-download
  registerIpc(() => current);            // window.pane (toolbar)
  registerInternalIpc(() => current);    // window.paneInternal (internal pages)
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
