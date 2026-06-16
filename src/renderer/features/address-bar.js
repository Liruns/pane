// The smart address bar: input → parse → navigate, with a suggestion dropdown.
import { $, on } from '../lib/dom.js';
import { toNavURL } from './url-parser.js';
import { ICONS } from '../lib/icons.js';
import { initSuggestions, update, close as closeSuggest, isOpen, move, selectedUrl } from './suggestions.js';

export function initAddressBar() {
  const addr = $('#address');
  const statusGlyph = $('#statusGlyph');
  initSuggestions();

  on(addr, 'input', () => update(addr.value));

  on(addr, 'keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      const url = selectedUrl() || toNavURL(addr.value);
      closeSuggest();
      if (url) window.pane.navigate(url);
      addr.blur();
    } else if (e.key === 'Escape') {
      if (isOpen()) closeSuggest();
      else addr.blur();
    }
  });

  on(addr, 'focus', () => addr.select());
  on(addr, 'blur', () => setTimeout(closeSuggest, 120)); // delay so a row mousedown can commit

  // Ctrl+L (focus address) is handled in main via before-input-event → this event.
  window.pane.onFocusAddress(() => { addr.focus(); addr.select(); });

  // DESIGN §4/§12: the leading glyph must tell the truth by SHAPE, not just color — lock when
  // secure, warning when the load failed, search otherwise. (Color alone made HTTPS a green magnifier.)
  const setGlyph = (name) => { statusGlyph.innerHTML = ICONS[name]; };

  window.pane.onNavState((d) => {
    if (document.activeElement !== addr) {
      addr.value = d.url && d.url !== 'about:blank' ? d.url : '';
    }
    statusGlyph.classList.remove('secure', 'error');
    if (d.url && d.url.startsWith('https://')) { statusGlyph.classList.add('secure'); setGlyph('lock'); }
    else setGlyph('search');
  });

  window.pane.onLoadError(() => {
    statusGlyph.classList.remove('secure');
    statusGlyph.classList.add('error');
    setGlyph('warning');
  });
}
