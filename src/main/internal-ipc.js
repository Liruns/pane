'use strict';
// IPC handlers for the internal pages (window.paneInternal). Every handler re-verifies the
// sender is a pane:// page — the preload guard is convenience; this is the real boundary.
const { ipcMain } = require('electron');
const history = require('./history');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const downloads = require('./downloads');

const fromInternal = (event) => {
  try { return new URL(event.senderFrame.url).protocol === 'pane:'; } catch { return false; }
};

function registerInternalIpc(getWindow) {
  const active = () => { const w = getWindow(); return w && w.tabs ? w.tabs.active : null; };

  ipcMain.handle('pane-internal:navigate', (e, url) => {
    if (!fromInternal(e)) return;
    const p = active();
    if (p) p.navigate(url);
  });

  ipcMain.handle('pane-internal:history-list', (e, opts) => (fromInternal(e) ? history.list(opts) : []));
  ipcMain.handle('pane-internal:history-remove', (e, url, time) => { if (fromInternal(e)) history.remove(url, time); });
  ipcMain.handle('pane-internal:history-clear', (e) => { if (fromInternal(e)) history.clear(); });

  ipcMain.handle('pane-internal:settings-get', (e) => (fromInternal(e) ? settings.getAll() : {}));
  ipcMain.handle('pane-internal:settings-set', (e, key, value) => { if (fromInternal(e)) settings.set(key, value); });

  ipcMain.handle('pane-internal:bookmarks-list', (e, opts) => (fromInternal(e) ? bookmarks.list(opts) : []));
  ipcMain.handle('pane-internal:bookmarks-remove', (e, url) => { if (fromInternal(e)) bookmarks.remove(url); });

  ipcMain.handle('pane-internal:downloads-list', (e) => (fromInternal(e) ? downloads.list() : []));
  ipcMain.handle('pane-internal:downloads-open', (e, id) => { if (fromInternal(e)) downloads.open(id); });
  ipcMain.handle('pane-internal:downloads-show', (e, id) => { if (fromInternal(e)) downloads.showInFolder(id); });
  ipcMain.handle('pane-internal:downloads-cancel', (e, id) => { if (fromInternal(e)) downloads.cancel(id); });
  ipcMain.handle('pane-internal:downloads-remove', (e, id) => { if (fromInternal(e)) downloads.removeEntry(id); });
  ipcMain.handle('pane-internal:downloads-clear', (e) => { if (fromInternal(e)) downloads.clearCompleted(); });
}

module.exports = { registerInternalIpc, fromInternal };
