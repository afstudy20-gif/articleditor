/**
 * HTTP client for the AcademicFlow render server.
 *
 * `fetch` is injected so the whole client is unit-testable without a network, which the
 * repo's test rules require. The error classes exist so the route can tell "the render
 * server is not running" (a setup problem the author can fix in one command) apart from
 * "this spec is invalid" (a problem with what the model produced) — fusing those into one
 * 500 would make the feature undiagnosable.
 */

export class FlowUnavailableError extends Error {
  constructor(cause: string) {
    super(`AcademicFlow render server unreachable: ${cause}`);
    this.name = 'FlowUnavailableError';
  }
}

export class FlowAuthError extends Error {
  constructor() {
    super('AcademicFlow render server rejected the API key');
    this.name = 'FlowAuthError';
  }
}

export class FlowSpecError extends Error {
  constructor(public readonly errors: string[]) {
    super(`AcademicFlow rejected the spec: ${errors.join('; ')}`);
    this.name = 'FlowSpecError';
  }
}

export class FlowRenderError extends Error {
  constructor(message: string) {
    super(`AcademicFlow render failed: ${message}`);
    this.name = 'FlowRenderError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FlowClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  /** Render is a Chromium round-trip; the default leaves room for a cold start. */
  timeoutMs?: number;
}

export interface FlowHealth {
  up: boolean;
  specVersion?: number;
  version?: string;
}

export interface RenderResult {
  /** SVG markup, or a base64 PNG payload, depending on the requested format. */
  body: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
  /** flow-app falls back to this when the content outgrew the requested preset. */
  preset?: string;
}

export type RenderFormat = 'svg' | 'png';

const DEFAULT_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 2_000;

export interface FlowClient {
  health(): Promise<FlowHealth>;
  render(spec: unknown, opts?: { format?: RenderFormat; dpi?: number; pad?: number }): Promise<RenderResult>;
}

export function createFlowClient(options: FlowClientOptions): FlowClient {
  const { baseUrl, apiKey } = options;
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    return apiKey ? { ...extra, 'X-API-Key': apiKey } : extra;
  }

  async function call(path: string, init: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await doFetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      // A refused connection is the normal case when the author has not started the
      // server; it is a setup state, not a bug, and the message has to say so.
      throw new FlowUnavailableError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async health(): Promise<FlowHealth> {
      try {
        const res = await call('/v1/info', { method: 'GET', headers: headers() }, HEALTH_TIMEOUT_MS);
        if (res.status === 401) throw new FlowAuthError();
        if (!res.ok) return { up: false };
        const info = (await res.json()) as { specVersion?: number; version?: string };
        return { up: true, specVersion: info.specVersion, version: info.version };
      } catch (err) {
        if (err instanceof FlowAuthError) throw err;
        return { up: false };
      }
    },

    async render(spec, opts = {}): Promise<RenderResult> {
      const format = opts.format ?? 'svg';
      const res = await call(
        '/v1/render',
        {
          method: 'POST',
          headers: headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ spec, format, dpi: opts.dpi, pad: opts.pad }),
        },
        timeoutMs,
      );

      if (res.status === 401) throw new FlowAuthError();
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string[]; error?: string };
        throw new FlowSpecError(body.detail ?? [body.error ?? 'invalid spec']);
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new FlowRenderError(body.error ?? `HTTP ${res.status}`);
      }

      const width = Number(res.headers.get('X-AF-Width'));
      const height = Number(res.headers.get('X-AF-Height'));
      return {
        body: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get('Content-Type') ?? (format === 'png' ? 'image/png' : 'image/svg+xml'),
        width: Number.isFinite(width) && width > 0 ? width : undefined,
        height: Number.isFinite(height) && height > 0 ? height : undefined,
        preset: res.headers.get('X-AF-Preset') ?? undefined,
      };
    },
  };
}

/** `data:` URL for embedding a render result in a project asset or the editor. */
export function renderResultToDataUrl(result: RenderResult): string {
  const base64 = Buffer.from(result.body).toString('base64');
  return `data:${result.contentType};base64,${base64}`;
}
