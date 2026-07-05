/**
 * SSRF guard for OpenAI-compatible base URLs. Kept for env-supplied custom
 * endpoints and future server-side configuration.
 *
 * Policy: https only, no embedded credentials, no localhost/private/link-local
 * hosts. DNS-rebinding is out of scope (we don't resolve hostnames here), but
 * direct IP-literal and well-known internal names are rejected.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);
const BLOCKED_SUFFIXES = ['.local', '.internal', '.localdomain'];

export function sanitizeBaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) return undefined;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return undefined;
  if (isPrivateIpLiteral(host)) return undefined;

  return url.toString();
}

function isPrivateIpLiteral(host: string): boolean {
  // IPv6 literal (URL hostname keeps the brackets — strip them)
  if (host.includes(':') || host.startsWith('[')) {
    const h = host.replace(/^\[|\]$/g, '');
    return (
      h === '::' ||
      h === '::1' ||
      h.startsWith('fe80:') || // link-local
      h.startsWith('fc') || h.startsWith('fd') || // unique-local fc00::/7
      h.startsWith('::ffff:') // v4-mapped — be conservative
    );
  }
  // IPv4 literal
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return true; // any other raw IP literal: reject (no legitimate AI API uses one)
}
