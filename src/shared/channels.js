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
  DEVTOOLS_SET_DOCK: 'pane:devtools-set-dock', // side: 'right' | 'bottom' | 'detach'
  SPLITTER_DRAG: 'pane:splitter-drag',         // splitter → main (screenX, screenY)
  SPLITTER_DRAG_END: 'pane:splitter-drag-end',
  TAB_NEW: 'pane:tab-new',
  TAB_CLOSE: 'pane:tab-close',
  TAB_ACTIVATE: 'pane:tab-activate',
  TAB_MOVE: 'pane:tab-move',
  TAB_RELOAD: 'pane:tab-reload',
  TAB_DUPLICATE: 'pane:tab-duplicate',
  TAB_CLOSE_OTHERS: 'pane:tab-close-others',
  TAB_REOPEN: 'pane:tab-reopen',
  TOGGLE_MAXIMIZE: 'pane:toggle-maximize',
  SET_CHROME_HEIGHT: 'pane:set-chrome-height',
  HISTORY_QUERY: 'pane:history-query',
  GET_SETTINGS: 'pane:get-settings',
  SET_SETTING: 'pane:set-setting',
  CLEAR_HISTORY: 'pane:clear-history',
  FIND: 'pane:find',
  FIND_STOP: 'pane:find-stop',
  FOUND_RESULT: 'pane:found-result',
  OPEN_FIND: 'pane:open-find',
  // main → renderer (send)
  NAV_STATE: 'pane:nav-state',
  LOADING: 'pane:loading',
  DEVTOOLS_STATE: 'pane:devtools-state', // { open, dock: 'right'|'bottom'|'detach'|null }
  SPLITTER_ORIENTATION: 'pane:splitter-orientation', // main → splitter ('col' | 'row')
  LOAD_ERROR: 'pane:load-error',
  FOCUS_ADDRESS: 'pane:focus-address',
  TABS_STATE: 'pane:tabs-state',
  TOAST: 'pane:toast',
};
