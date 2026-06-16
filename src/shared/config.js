'use strict';
// App-wide constants shared by main-process modules.
// (Renderer visual tokens live in renderer/styles/tokens.css — DESIGN.md is the spec for both.)
module.exports = {
  TOOLBAR_HEIGHT: 48,
  DEFAULT_URL: 'https://example.com',
  WINDOW: { width: 1200, height: 800, minWidth: 640, minHeight: 480 },
  COLORS: {
    canvas: '#0a0a0b',   // window/page seam-hider
    surface: '#1d1d1f',  // toolbar fallback / WCO overlay tint
    symbol: '#f5f5f7',   // WCO caption-button glyphs
  },
};
