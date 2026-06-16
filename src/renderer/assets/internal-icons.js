'use strict';
// Shared SVG glyphs for pane:// internal pages. Loaded as a CLASSIC script over pane://
// (a cross-host <script src> is not CORS-gated, unlike an ES module), so it just assigns
// window.PaneIcons before each page's own script runs. One source so the delete "X" never
// drifts across history / bookmarks / downloads.
window.PaneIcons = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>',
};
