'use strict';
// IPC handlers for the internal pages (window.paneInternal). Every handler re-verifies the
// sender is a pane:// page — the preload guard is convenience; this is the real boundary.
const { ipcMain } = require('electron');
const history = require('./history');

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
}

module.exports = { registerInternalIpc, fromInternal };
