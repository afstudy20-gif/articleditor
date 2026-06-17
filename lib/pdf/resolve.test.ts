import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeProxyUrlParam } from './resolve';

test('decodeProxyUrlParam reads base64 url param', () => {
  const raw = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9575015/pdf/test.pdf';
  const b = Buffer.from(raw, 'utf8').toString('base64url');
  const params = new URLSearchParams({ b });
  const url = decodeProxyUrlParam(params);
  assert.equal(url?.href, raw);
});

test('decodeProxyUrlParam still accepts plain url query', () => {
  const raw = 'https://arxiv.org/pdf/2401.00001';
  const params = new URLSearchParams({ url: raw });
  const url = decodeProxyUrlParam(params);
  assert.equal(url?.href, raw);
});