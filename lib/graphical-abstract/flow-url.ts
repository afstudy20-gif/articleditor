/**
 * Guards the AcademicFlow render-server URL.
 *
 * ARTED's CSP blocks the browser from reaching the render server, so the call is made
 * server-side. That makes a permissive URL far more dangerous than the browser case: an
 * attacker-controlled value would turn a Next.js route into an SSRF proxy sitting on the
 * server's own loopback interface, with access to metadata endpoints and anything else
 * bound locally.
 *
 * The policy is therefore loopback-only and the value comes from the environment, never
 * from a request. Note this is the exact inverse of `lib/ai/url-guard.ts`, which is
 * https-only and blocks localhost — do not swap one for the other.
 */

/** Hostnames that are unambiguously this machine. Matched exactly, never by substring. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export class FlowUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowUrlError';
  }
}

/**
 * Normalised origin of the render server, e.g. `http://127.0.0.1:8787`.
 * Throws rather than falling back to a default: a misconfigured URL should surface as a
 * setup error, not silently send manuscript text somewhere unintended.
 */
export function sanitizeFlowBaseUrl(raw: string): string {
  const value = raw?.trim();
  if (!value) throw new FlowUrlError('FLOW_SERVER_URL is empty');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FlowUrlError(`FLOW_SERVER_URL is not a valid URL: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FlowUrlError(`FLOW_SERVER_URL must be http or https, got ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new FlowUrlError('FLOW_SERVER_URL must not embed credentials');
  }
  // Exact host match. "127.0.0.1.evil.com" and "not-localhost" both contain a loopback
  // name as a substring and both resolve off-machine.
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new FlowUrlError(
      `FLOW_SERVER_URL must point at this machine (127.0.0.1 or localhost), got ${url.hostname}`,
    );
  }
  // A path would let a caller aim at a specific endpoint; /v1/command is a total escape
  // hatch, so only the bare origin is accepted.
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new FlowUrlError(`FLOW_SERVER_URL must be an origin with no path, got ${url.pathname}`);
  }
  if (url.search || url.hash) {
    throw new FlowUrlError('FLOW_SERVER_URL must not carry a query string or fragment');
  }

  return url.origin;
}

export const DEFAULT_FLOW_SERVER_URL = 'http://127.0.0.1:8787';

/** The configured render-server origin, or null when the feature is not set up. */
export function flowBaseUrlFromEnv(env: Record<string, string | undefined>): string | null {
  const raw = env.FLOW_SERVER_URL;
  if (!raw?.trim()) return null;
  return sanitizeFlowBaseUrl(raw);
}
