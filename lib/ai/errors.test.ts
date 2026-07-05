import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAbortError, isTransientError } from './errors';

describe('isAbortError', () => {
  it('detects errors named AbortError', () => {
    const err = new Error('whatever');
    err.name = 'AbortError';
    assert.equal(isAbortError(err), true);
  });

  it('detects DOMException AbortError and TimeoutError', () => {
    assert.equal(isAbortError(new DOMException('The operation was aborted', 'AbortError')), true);
    assert.equal(isAbortError(new DOMException('The operation timed out', 'TimeoutError')), true);
  });

  it('detects abort/timeout wording in plain Error messages', () => {
    assert.equal(isAbortError(new Error('request was aborted by the client')), true);
    assert.equal(isAbortError(new Error('upstream timed out')), true);
    assert.equal(isAbortError(new Error('connection timeout')), true);
  });

  it('returns false for ordinary errors', () => {
    assert.equal(isAbortError(new Error('boom')), false);
    assert.equal(isAbortError(new Error('500 internal server error')), false);
  });

  it('returns false for non-Error values', () => {
    assert.equal(isAbortError('aborted'), false);
    assert.equal(isAbortError(null), false);
    assert.equal(isAbortError(undefined), false);
    assert.equal(isAbortError({ name: 'AbortError' }), false);
  });
});

describe('isTransientError', () => {
  it('detects HTTP status hints', () => {
    for (const code of ['429', '500', '502', '503', '504', '529']) {
      assert.equal(isTransientError(new Error(`upstream returned ${code}`)), true, code);
    }
  });

  it('detects network failure patterns', () => {
    for (const msg of [
      'ECONNRESET',
      'getaddrinfo ENOTFOUND api.example.com',
      'fetch failed',
      'socket hang up',
      'model is overloaded',
      'temporarily unavailable',
      'rate limit exceeded',
      'quota exhausted',
    ]) {
      assert.equal(isTransientError(new Error(msg)), true, msg);
    }
  });

  it('never treats abort/timeout errors as transient (abort wins)', () => {
    assert.equal(isTransientError(new DOMException('aborted', 'AbortError')), false);
    const named = new Error('429 rate limit');
    named.name = 'AbortError';
    assert.equal(isTransientError(named), false);
    // Quirk: 'ETIMEDOUT' is listed in TRANSIENT_RE, but isAbortError's
    // /timed?\s*out/i heuristic matches the 'TIMEDOUT' substring first, so
    // socket-timeout errors are classified as aborts and never retried.
    assert.equal(isTransientError(new Error('connect ETIMEDOUT 1.2.3.4:443')), false);
  });

  it('returns false for ordinary errors', () => {
    assert.equal(isTransientError(new Error('validation failed')), false);
    assert.equal(isTransientError(new Error('404 not found')), false);
  });

  it('stringifies non-Error values before matching', () => {
    assert.equal(isTransientError('429 too many requests'), true);
    assert.equal(isTransientError('all good'), false);
    assert.equal(isTransientError(null), false);
  });
});
