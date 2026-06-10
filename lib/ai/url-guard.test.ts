import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBaseUrl } from './url-guard';

describe('sanitizeBaseUrl', () => {
  it('accepts public https endpoints', () => {
    assert.ok(sanitizeBaseUrl('https://api.openai.com/v1'));
    assert.ok(sanitizeBaseUrl('https://my-llm-proxy.example.com/v1'));
  });

  it('rejects http, credentials, and garbage', () => {
    assert.equal(sanitizeBaseUrl('http://api.openai.com/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://user:pass@api.openai.com/v1'), undefined);
    assert.equal(sanitizeBaseUrl('not a url'), undefined);
    assert.equal(sanitizeBaseUrl(undefined), undefined);
  });

  it('rejects localhost and internal names', () => {
    assert.equal(sanitizeBaseUrl('https://localhost:8080/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://metadata.google.internal/'), undefined);
    assert.equal(sanitizeBaseUrl('https://printer.local/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://svc.cluster.internal/v1'), undefined);
  });

  it('rejects IP literals (private and public)', () => {
    assert.equal(sanitizeBaseUrl('https://127.0.0.1/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://10.0.0.5/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://169.254.169.254/latest'), undefined);
    assert.equal(sanitizeBaseUrl('https://172.16.0.1/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://192.168.1.1/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://8.8.8.8/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://[::1]/v1'), undefined);
    assert.equal(sanitizeBaseUrl('https://[fe80::1]/v1'), undefined);
  });
});
