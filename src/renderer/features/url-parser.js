// Smart address parsing — minimal v0 of DESIGN.md §10.
// Pure function (no DOM, no IPC) so it stays unit-testable. The full pipeline
// (Public Suffix List, IDN→punycode, IPv6, single-label intranet) is a follow-up.

const PACKAGE_DENYLIST = /^(socket\.io|node\.js|vue\.js|next\.js|nuxt\.js|three\.js)$/i;
const SEARCH = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);

/** @returns {string|null} a URL to load, or null for empty input. */
export function toNavURL(raw) {
  const s = raw.trim();
  if (!s) return null;

  // 1. explicit scheme wins (whitelist about:blank)
  if (s === 'about:blank') return s;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;

  // 2. loopback / IP [:port]
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(s)) return 'http://' + s;
  if (/^\[?::1\]?(:\d+)?(\/.*)?$/.test(s)) return 'http://' + s;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(s)) return 'http://' + s;

  // 3. bare host: no spaces, has a dot, last label looks like a TLD, not a known package
  const head = s.split(/[/?#]/)[0];
  if (!/\s/.test(s) && /^[^\s.]+(\.[^\s.]+)+(:\d+)?$/.test(head) && /\.[a-z]{2,}(:\d+)?$/i.test(head)) {
    if (!PACKAGE_DENYLIST.test(head)) return 'https://' + s;
  }

  // 4. otherwise: search
  return SEARCH(s);
}
