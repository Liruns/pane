'use strict';
// IPC channel names — the single source of truth shared by main and preload.
// The renderer never sees these strings; it talks through the window.pane bridge.
module.exports = {
  // renderer → main (invoke)
  NAVIGATE: 'pane:navigate',
  BACK: 'pane:back',
  FORWARD: 'pane:forward',
  RELOAD: 'pane:reload',
  STOP: 'pane:stop',
  TOGGLE_DEVTOOLS: 'pane:toggle-devtools',
  // main → renderer (send)
  NAV_STATE: 'pane:nav-state',
  LOADING: 'pane:loading',
  LOAD_ERROR: 'pane:load-error',
  TITLE: 'pane:title',
  FOCUS_ADDRESS: 'pane:focus-address',
};
