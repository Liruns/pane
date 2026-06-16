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
};
