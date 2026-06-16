'use strict';
// Pane — preload. The single bridge between the toolbar renderer and main.
// The renderer only ever sees `window.pane`; channel names stay in shared/channels.
const { contextBridge, ipcRenderer } = require('electron');
const CH = require('../shared/channels');

contextBridge.exposeInMainWorld('pane', {
  // actions → main
  navigate: (url) => ipcRenderer.invoke(CH.NAVIGATE, url),
  back: () => ipcRenderer.invoke(CH.BACK),
  forward: () => ipcRenderer.invoke(CH.FORWARD),
  reload: () => ipcRenderer.invoke(CH.RELOAD),
  stop: () => ipcRenderer.invoke(CH.STOP),
  toggleDevTools: () => ipcRenderer.invoke(CH.TOGGLE_DEVTOOLS),

  // events ← main
  onNavState: (cb) => ipcRenderer.on(CH.NAV_STATE, (_e, d) => cb(d)),
  onLoading: (cb) => ipcRenderer.on(CH.LOADING, (_e, d) => cb(d)),
  onLoadError: (cb) => ipcRenderer.on(CH.LOAD_ERROR, (_e, d) => cb(d)),
  onTitle: (cb) => ipcRenderer.on(CH.TITLE, (_e, d) => cb(d)),
  onFocusAddress: (cb) => ipcRenderer.on(CH.FOCUS_ADDRESS, () => cb()),
});
