// Shared SVG icon set for the chrome. 24×24 stroke icons; size and color come from CSS
// (currentColor + width/height on the host element). One source so a glyph never drifts.
const svg = (inner, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const ICONS = {
  close:       svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  globe:       svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>', 1.7),
  reload:      svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  chevronUp:   svg('<path d="M6 15l6-6 6 6"/>'),
  chevronDown: svg('<path d="M6 9l6 6 6-6"/>'),
  arrowRight:  svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  search:      svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  history:     svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  lock:        svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 1.8),
  unlock:      svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.6"/>', 1.8),
  warning:     svg('<path d="M12 3.5L21 19H3z"/><path d="M12 10v4M12 16.5h.01"/>', 1.8),
  // Command-palette action glyphs (DESIGN §4 component grammar — 24×24 stroke, currentColor).
  plus:        svg('<path d="M12 5v14M5 12h14"/>'),
  reopen:      svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  code:        svg('<path d="M9 8l-4 4 4 4"/><path d="M15 8l4 4-4 4"/>'),
  bookmark:    svg('<path d="M7 4h10v16l-5-3.5L7 20z"/>', 1.8),
  download:    svg('<path d="M12 4v10M8 11l4 4 4-4"/><path d="M5 19h14"/>', 1.8),
  settings:    svg('<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2.2"/><circle cx="9" cy="16" r="2.2"/>', 1.8),
};
