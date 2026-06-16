'use strict';
// Preload for the page view. Exposes window.paneInternal ONLY to our internal pages
// (pane:// origin) — never to remote web content. Main re-checks the sender's origin too.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'pane:') {
  contextBridge.exposeInMainWorld('paneInternal', {
    navigate: (url) => ipcRenderer.invoke('pane-internal:navigate', url),
    history: {
      list: (opts) => ipcRenderer.invoke('pane-internal:history-list', opts),
      remove: (url, time) => ipcRenderer.invoke('pane-internal:history-remove', url, time),
      clear: () => ipcRenderer.invoke('pane-internal:history-clear'),
    },
  });
}
