'use strict';
const CH = require('../shared/channels');

/**
 * Global-ish keyboard shortcuts that must work even when the page (not the toolbar)
 * has focus. Registered on the page's webContents via before-input-event.
 */
function registerShortcuts(page, chrome) {
  page.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    const key = (input.key || '').toLowerCase();

    if (mod && key === 'l') { chrome.send(CH.FOCUS_ADDRESS); e.preventDefault(); }
    else if (mod && key === 'r') { page.reload(); }
    else if (mod && input.shift && key === 'i') { page.toggleDevTools(); }
    else if (input.alt && input.key === 'ArrowLeft' && page.canGoBack()) { page.back(); }
    else if (input.alt && input.key === 'ArrowRight' && page.canGoForward()) { page.forward(); }
  });
}

module.exports = { registerShortcuts };
