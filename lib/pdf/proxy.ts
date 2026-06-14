const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '0.0.0.0',
]);

const PRIVATE_IP_RE =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|fc00:|fe80:|fd[0-9a-f]{2}:)/i;

export function sanitizePdfUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return null;
    if (PRIVATE_IP_RE.test(host)) return null;
    if (host.endsWith('.local') || host.endsWith('.internal')) return null;
    return url;
  } catch {
    return null;
  }
}

export function extractPmcid(url: URL): string | null {
  if (url.hostname.toLowerCase() !== 'pmc.ncbi.nlm.nih.gov') return null;
  return url.pathname.match(/\/articles\/(PMC\d+)(?:\/|$)/i)?.[1]?.toUpperCase() ?? null;
}
