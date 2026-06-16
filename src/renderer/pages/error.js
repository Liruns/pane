'use strict';
// Runs inside the page view (no preload / no IPC). Navigation uses plain location.href,
// which re-points this same WebContentsView — the toolbar updates via the usual events.
const q = new URLSearchParams(location.search);
const failedUrl = q.get('url') || '';
const code = q.get('code') || '';
const desc = q.get('desc') || '';

let host = failedUrl;
try { host = new URL(failedUrl).host || failedUrl; } catch { /* keep raw */ }

// Friendly, specific causes (DESIGN §10 voice) for the common Chromium net error codes.
const CAUSES = {
  '-105': `${host} doesn't resolve. Check the address.`,
  '-106': 'You appear to be offline.',
  '-102': `${host} refused the connection.`,
  '-7':   `${host} took too long to respond.`,
  '-118': `${host} took too long to respond.`,
  '-109': `${host} is unreachable.`,
  '-201': `${host} has a certificate problem.`,
  '-202': `${host} has a certificate problem.`,
};
const fallback = desc ? desc.replace(/^ERR_/, '').replace(/_/g, ' ').toLowerCase() : 'The connection failed.';

document.getElementById('cause').textContent = CAUSES[code] || fallback;
document.getElementById('url').textContent = failedUrl;

document.getElementById('retry').addEventListener('click', () => {
  if (failedUrl) location.href = failedUrl;
});
document.getElementById('search').addEventListener('click', () => {
  location.href = 'https://www.google.com/search?q=' + encodeURIComponent(host || failedUrl);
});
