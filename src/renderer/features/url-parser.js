// Smart address parsing — DESIGN.md §10. Pure function (no DOM/IPC), unit-testable.
// Uses the URL API for IDN→punycode + validation. The Public Suffix List is the
// remaining hardening (documented follow-up); a dotted host that turns out dead
// is rescued by the custom error page's "Search instead".

export const SEARCH_BASE = 'https://www.google.com/search?q=';
export const search = (q) => SEARCH_BASE + encodeURIComponent(q);

const isIPv4 = (h) => {
  const parts = h.split('.');
  return parts.length === 4 && parts.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255);
};

/**
 * Resolve raw omnibox input to a URL to load, or a search URL.
 * @returns {string|null} url to load, or null for empty input.
 */
export function toNavURL(raw) {
  const s = raw.trim();
  if (!s) return null;

  // about: — only about:blank is navigable from the omnibox
  if (/^about:/i.test(s)) return /^about:blank$/i.test(s) ? 'about:blank' : search(s);

  // Windows path → file URL (C:\dir\file.html or C:/dir)
  if (/^[a-z]:[\\/]/i.test(s)) return 'file:///' + s.replace(/\\/g, '/');

  // explicit scheme → load as-is (never re-prefix). Unknown schemes typed as text → search.
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme) {
    const proto = scheme[1].toLowerCase();
    if ((proto === 'http' || proto === 'https' || proto === 'file' || proto === 'pane') && URL.canParse(s)) return s;
    return search(s);
  }

  const hostPort = s.split(/[/?#]/)[0];
  const host = hostPort.replace(/:\d+$/, '');
  const proto = /:443$/.test(hostPort) ? 'https://' : 'http://'; // DESIGN §10: :443 ⇒ https

  // loopback / IP / IPv6 [:port][/path]
  if (/^localhost$/i.test(host)) return proto + s;
  if (/^\[[0-9a-f:]+\]$/i.test(host)) return proto + s;         // [::1], [2001:db8::1]
  if (/^::1$/.test(host)) return proto + '[::1]' + s.slice(3);   // bare ::1[:port]
  if (isIPv4(host)) return proto + s;

  // bare host with a dot → likely a hostname (URL API normalizes IDN → punycode)
  if (!/\s/.test(s) && host.includes('.')) {
    const lastLabel = host.split('.').pop() || '';
    const tldLike = /^[a-z]{2,24}$/i.test(lastLabel) || /^xn--/i.test(lastLabel);
    if (tldLike && URL.canParse('https://' + s)) return 'https://' + s;
  }

  // single-label or free text → search (no synchronous DNS; "Go to" suggestion is a follow-up)
  return search(s);
}
