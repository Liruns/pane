'use strict';
// IPC handlers for the internal pages (window.paneInternal). Every handler re-verifies the
// sender is a pane:// page — the preload guard is convenience; this is the real boundary.
const { ipcMain } = require('electron');

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

  // history.* handlers are registered by the history feature (see registerHistoryIpc).
}

module.exports = { registerInternalIpc, fromInternal };
