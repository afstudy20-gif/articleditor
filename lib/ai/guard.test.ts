import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAIError, checkRateLimit, timeoutSignal, AI_TIMEOUT_MS } from './guard';
import { AIError } from './provider';

describe('sanitizeAIError', () => {
  it('maps abort/timeout errors to 504 timeout', () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    assert.deepEqual(
      { status: sanitizeAIError(abort).status, code: sanitizeAIError(abort).body.code },
      { status: 504, code: 'timeout' },
    );
    const timedOut = new DOMException('The operation timed out', 'TimeoutError');
    assert.equal(sanitizeAIError(timedOut).status, 504);
    assert.equal(sanitizeAIError(timedOut).body.code, 'timeout');
  });

  it('maps AIError config stage to 503 not_configured', () => {
    const err = new AIError('gemini', 'config', 'no key');
    const s = sanitizeAIError(err);
    assert.equal(s.status, 503);
    assert.equal(s.body.code, 'not_configured');
  });

  it('maps rate-limit style AIError messages to 502 upstream_busy', () => {
    for (const msg of ['HTTP 429', 'rate limit exceeded', 'quota exhausted', 'model overloaded']) {
      const s = sanitizeAIError(new AIError('openai', 'generate', msg));
      assert.equal(s.status, 502, msg);
      assert.equal(s.body.code, 'upstream_busy', msg);
    }
  });

  it('maps auth style AIError messages to 502 upstream_auth', () => {
    for (const msg of ['401 unauthorized', 'invalid api key', 'invalid_key provided']) {
      const s = sanitizeAIError(new AIError('anthropic', 'generate', msg));
      assert.equal(s.status, 502, msg);
      assert.equal(s.body.code, 'upstream_auth', msg);
    }
  });

  it('maps other AIErrors to 502 upstream_error', () => {
    const s = sanitizeAIError(new AIError('gemini', 'stream', 'something odd happened'));
    assert.equal(s.status, 502);
    assert.equal(s.body.code, 'upstream_error');
  });

  it('maps unknown errors to 500 internal', () => {
    for (const err of [new Error('boom'), 'string error', null, 42]) {
      const s = sanitizeAIError(err);
      assert.equal(s.status, 500);
      assert.equal(s.body.code, 'internal');
    }
  });

  it('never leaks the original message to the client', () => {
    const s = sanitizeAIError(new AIError('openai', 'generate', 'secret-internal-detail sk-123'));
    assert.ok(!s.body.error.includes('secret-internal-detail'));
    assert.ok(!s.body.error.includes('sk-123'));
  });
});

describe('checkRateLimit', () => {
  const request = (ip: string): Request =>
    new Request('http://localhost/api/ai/test', {
      headers: { 'x-forwarded-for': ip },
    });

  it('allows up to 20 requests per window then returns 429 with Retry-After', () => {
    const ip = `10.1.1.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 20; i++) {
      assert.equal(checkRateLimit(request(ip)), null, `request ${i + 1} should pass`);
    }
    const res = checkRateLimit(request(ip));
    assert.ok(res, '21st request should be blocked');
    assert.equal(res.status, 429);
    const retryAfter = Number(res.headers.get('Retry-After'));
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60);
  });

  it('returns a rate_limited JSON body when blocked', async () => {
    const ip = '10.2.2.2';
    for (let i = 0; i < 20; i++) checkRateLimit(request(ip));
    const res = checkRateLimit(request(ip));
    assert.ok(res);
    const body = (await res.json()) as { code: string; error: string };
    assert.equal(body.code, 'rate_limited');
    assert.ok(body.error.length > 0);
  });

  it('tracks clients independently', () => {
    const blockedIp = '10.3.3.3';
    for (let i = 0; i < 21; i++) checkRateLimit(request(blockedIp));
    assert.notEqual(checkRateLimit(request(blockedIp)), null);
    // A different client is unaffected.
    assert.equal(checkRateLimit(request('10.4.4.4')), null);
  });

  it('uses the first hop of x-forwarded-for', () => {
    const req = new Request('http://localhost/api/ai/test', {
      headers: { 'x-forwarded-for': '10.5.5.5, 192.168.0.1' },
    });
    for (let i = 0; i < 20; i++) assert.equal(checkRateLimit(req), null);
    // Same first hop alone shares the bucket.
    const res = checkRateLimit(request('10.5.5.5'));
    assert.ok(res);
    assert.equal(res.status, 429);
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('http://localhost/api/ai/test', {
      headers: { 'x-real-ip': '10.6.6.6' },
    });
    assert.equal(checkRateLimit(req), null);
  });
});

describe('timeoutSignal', () => {
  it('returns a non-aborted AbortSignal with a sane default budget', () => {
    const signal = timeoutSignal();
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    assert.ok(AI_TIMEOUT_MS > 0);
  });

  it('fires after the given delay', async () => {
    const signal = timeoutSignal(5);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(signal.aborted, true);
  });
});
