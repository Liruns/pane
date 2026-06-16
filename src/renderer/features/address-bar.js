// The smart address bar: input → parse → navigate, plus URL/status sync.
import { $, on } from '../lib/dom.js';
import { toNavURL } from './url-parser.js';

export function initAddressBar() {
  const addr = $('#address');
  const statusGlyph = $('#statusGlyph');

  on(addr, 'keydown', (e) => {
    if (e.key === 'Enter') {
      const url = toNavURL(addr.value);
      if (url) window.pane.navigate(url);
      addr.blur();
    } else if (e.key === 'Escape') {
      addr.blur();
    }
  });
  on(addr, 'focus', () => addr.select());

  // Ctrl+L when the toolbar itself has focus (page-focus case handled in main/shortcuts).
  on(window, 'keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      addr.focus();
      addr.select();
    }
  });
  window.pane.onFocusAddress(() => { addr.focus(); addr.select(); });

  window.pane.onNavState((d) => {
    if (document.activeElement !== addr) {
      addr.value = d.url && d.url !== 'about:blank' ? d.url : '';
    }
    statusGlyph.classList.remove('secure', 'error');
    if (d.url && d.url.startsWith('https://')) statusGlyph.classList.add('secure');
  });

  window.pane.onLoadError(() => {
    statusGlyph.classList.remove('secure');
    statusGlyph.classList.add('error');
  });
}
