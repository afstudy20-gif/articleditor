import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { hmacSha256Hex, verifyBodyHmac } from './webhook-signature';

test('verifies hex HMAC over raw body', () => {
  const body = '{"status":"completed","score":1}';
  const signature = hmacSha256Hex(body, 'secret');

  assert.equal(verifyBodyHmac(body, 'secret', signature), true);
  assert.equal(verifyBodyHmac(`${body} `, 'secret', signature), false);
});

test('accepts sha256-prefixed and base64 HMAC signatures', () => {
  const body = '{"status":"completed"}';
  const digest = createHmac('sha256', 'secret').update(body, 'utf8').digest();

  assert.equal(verifyBodyHmac(body, 'secret', `sha256=${digest.toString('hex')}`), true);
  assert.equal(verifyBodyHmac(body, 'secret', digest.toString('base64')), true);
});

test('rejects missing or malformed signatures', () => {
  assert.equal(verifyBodyHmac('{}', 'secret', null), false);
  assert.equal(verifyBodyHmac('{}', 'secret', 'not-a-signature'), false);
});
