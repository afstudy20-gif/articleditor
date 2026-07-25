import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFlowBaseUrl, flowBaseUrlFromEnv, FlowUrlError } from './flow-url';
import {
  createFlowClient,
  FlowUnavailableError,
  FlowSpecError,
  FlowAuthError,
  FlowRenderError,
  renderResultToDataUrl,
} from './flow-client';
import { parseCliTextBackend, buildClaudeTextArgs, buildCodexTextArgs, CLI_TEXT_LABELS } from '@/lib/ai/cli-text';

describe('sanitizeFlowBaseUrl', () => {
  it('accepts a loopback origin', () => {
    assert.equal(sanitizeFlowBaseUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
    assert.equal(sanitizeFlowBaseUrl('http://localhost:8787/'), 'http://localhost:8787');
    assert.equal(sanitizeFlowBaseUrl('  http://127.0.0.1:8787  '), 'http://127.0.0.1:8787');
  });

  it('rejects a host that merely contains a loopback name', () => {
    // "127.0.0.1.evil.com" resolves off-machine; substring matching would let it through.
    assert.throws(() => sanitizeFlowBaseUrl('http://127.0.0.1.evil.com'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl('http://not-localhost.example'), FlowUrlError);
  });

  it('rejects the cloud metadata endpoint and other off-machine hosts', () => {
    // The call is made server-side, so a permissive URL is an SSRF proxy on the server's
    // own network, not merely in the browser.
    assert.throws(() => sanitizeFlowBaseUrl('http://169.254.169.254'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl('https://evil.com'), FlowUrlError);
  });

  it('rejects a URL carrying a path, query, fragment or credentials', () => {
    // /v1/command is a total escape hatch, so only a bare origin is allowed.
    assert.throws(() => sanitizeFlowBaseUrl('http://127.0.0.1:8787/v1/command'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl('http://127.0.0.1:8787?x=1'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl('http://127.0.0.1:8787#f'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl('http://user:pw@127.0.0.1:8787'), FlowUrlError);
  });

  it('rejects a non-http scheme and an unparseable value', () => {
    assert.throws(() => sanitizeFlowBaseUrl('file:///etc/passwd'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl('not a url'), FlowUrlError);
    assert.throws(() => sanitizeFlowBaseUrl(''), FlowUrlError);
  });

  it('treats an unset env var as "feature not configured"', () => {
    assert.equal(flowBaseUrlFromEnv({}), null);
    assert.equal(flowBaseUrlFromEnv({ FLOW_SERVER_URL: '  ' }), null);
    assert.equal(flowBaseUrlFromEnv({ FLOW_SERVER_URL: 'http://127.0.0.1:9999' }), 'http://127.0.0.1:9999');
  });
});

/** Minimal Response stand-in so the client can be exercised with no network. */
function fakeResponse(
  body: string | Uint8Array,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers(init.headers ?? {});
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe('createFlowClient', () => {
  it('posts the spec to /v1/render with the API key and returns the artwork', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      apiKey: 'secret',
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return fakeResponse('<svg/>', {
          headers: { 'Content-Type': 'image/svg+xml', 'X-AF-Width': '1100', 'X-AF-Height': '560' },
        });
      },
    });

    const result = await client.render({ title: 'x' }, { format: 'svg' });

    assert.equal(calls[0].url, 'http://127.0.0.1:8787/v1/render');
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal((calls[0].init?.headers as Record<string, string>)['X-API-Key'], 'secret');
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).spec, { title: 'x' });
    assert.equal(new TextDecoder().decode(result.body), '<svg/>');
    assert.equal(result.width, 1100);
    assert.equal(result.height, 560);
  });

  it('omits the key header when none is configured', async () => {
    let sent: Record<string, string> = {};
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async (_url, init) => {
        sent = init?.headers as Record<string, string>;
        return fakeResponse('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
      },
    });
    await client.render({ title: 'x' });
    assert.equal('X-API-Key' in sent, false);
  });

  it('surfaces flow-app validation errors verbatim', async () => {
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () =>
        fakeResponse(JSON.stringify({ ok: false, error: 'Invalid spec', detail: ['unknown layout "triptych"'] }), {
          status: 422,
        }),
    });
    await assert.rejects(
      () => client.render({}),
      (err: unknown) => err instanceof FlowSpecError && err.errors[0].includes('triptych'),
    );
  });

  it('distinguishes a stopped server from a bad spec', async () => {
    // These need different messages: one is fixed by starting a server, the other by
    // regenerating. A shared 500 would make the feature undiagnosable.
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8787');
      },
    });
    await assert.rejects(() => client.render({}), FlowUnavailableError);
  });

  it('reports a rejected API key distinctly', async () => {
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      apiKey: 'wrong',
      fetchImpl: async () => fakeResponse('{}', { status: 401 }),
    });
    await assert.rejects(() => client.render({}), FlowAuthError);
  });

  it('reports other server failures as render errors', async () => {
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () => fakeResponse(JSON.stringify({ error: 'Chromium not installed' }), { status: 500 }),
    });
    await assert.rejects(
      () => client.render({}),
      (err: unknown) => err instanceof FlowRenderError && err.message.includes('Chromium'),
    );
  });

  it('reports health without throwing when the server is down', async () => {
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.deepEqual(await client.health(), { up: false });
  });

  it('reports the spec version so drift against flow-app is visible', async () => {
    const client = createFlowClient({
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl: async () => fakeResponse(JSON.stringify({ specVersion: 1, version: '1.2.3' })),
    });
    assert.deepEqual(await client.health(), { up: true, specVersion: 1, version: '1.2.3' });
  });

  it('builds a data URL from a render result', () => {
    const url = renderResultToDataUrl({
      body: new TextEncoder().encode('<svg/>'),
      contentType: 'image/svg+xml',
    });
    assert.equal(url, `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`);
  });
});

describe('cli-text backend selection', () => {
  it('accepts only the named backends', () => {
    assert.equal(parseCliTextBackend('claude'), 'claude');
    assert.equal(parseCliTextBackend('CODEX'), 'codex');
    assert.equal(parseCliTextBackend('kimi'), 'kimi');
  });

  it('rejects vague opt-ins so a stray value never shells out', () => {
    for (const v of ['auto', 'true', '1', '', undefined, 'yes']) {
      assert.equal(parseCliTextBackend(v), null, String(v));
    }
  });

  it('does not offer zcode', () => {
    // zcode runs --mode yolo, and this path feeds a tool-enabled agent manuscript text
    // the author pasted from elsewhere.
    assert.equal(parseCliTextBackend('zcode'), null);
  });

  it('passes the prompt as a file path, never as an argv element', () => {
    // A graphical-abstract prompt is tens of kilobytes; argv plus environment share a
    // fixed 1 MB limit on macOS.
    const args = buildClaudeTextArgs('/tmp/x/prompt.md');
    assert.ok(args.every((a) => a.length < 500), 'no argument should carry the prompt body');
    assert.ok(args.some((a) => a.includes('/tmp/x/prompt.md')));
  });

  it('runs codex in a read-only sandbox', () => {
    const args = buildCodexTextArgs('/tmp/x/prompt.md', '/tmp/x/answer.txt');
    const sandbox = args[args.indexOf('-s') + 1];
    assert.equal(sandbox, 'read-only');
    assert.ok(args.includes('--skip-git-repo-check'));
  });

  it('names every backend for the manuscript disclosure', () => {
    for (const b of ['claude', 'kimi', 'codex'] as const) {
      assert.ok(CLI_TEXT_LABELS[b].length > 0);
    }
  });
});
