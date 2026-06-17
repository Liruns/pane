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
  SET_VERTICAL_TABS: 'pane:set-vertical-tabs', // toggle the left-rail tab list (DESIGN §11)
  // Infinite canvas (DESIGN §11 / CANVAS.md). The canvas view + toolbar drive these; main owns the
  // Camera + pane world rects (single source of truth) and pushes CANVAS_STATE back.
  SET_CANVAS_MODE: 'pane:set-canvas-mode',     // renderer → main: toggle canvas mode on/off
  CANVAS_PAN: 'pane:canvas-pan',               // canvas → main: pan by a region-local screen delta {dx,dy}
  CANVAS_ZOOM: 'pane:canvas-zoom',             // canvas → main: zoom {factor, ax, ay} about a screen anchor
  CANVAS_PANE_MOVE: 'pane:canvas-pane-move',   // canvas → main: move a pane by a screen delta {id,dx,dy}
  CANVAS_PANE_RAISE: 'pane:canvas-pane-raise', // canvas → main: focus/raise a pane {id}
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
  WINDOW_ACTIVE: 'pane:window-active', // { active } — window focus/blur → chrome inert shift (DESIGN §14)
  FOCUS_ADDRESS: 'pane:focus-address',
  OPEN_PALETTE: 'pane:open-palette',
  TABS_STATE: 'pane:tabs-state',
  LAYOUT_STATE: 'pane:layout-state', // { verticalTabs, canvasMode } — chrome reflects mode (menu checks, body class)
  CANVAS_STATE: 'pane:canvas-state', // main → canvas: { on, scale, panes:[{id,title,favicon,active,loading,screen}] }
  TOAST: 'pane:toast',
};
