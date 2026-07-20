import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes } from './base64';

describe('base64ToBytes', () => {
  it('decodes standard base64 to the original bytes', () => {
    const bytes = base64ToBytes(Buffer.from('%PDF-1.7\n').toString('base64'));
    assert.equal(Buffer.from(bytes).toString('latin1'), '%PDF-1.7\n');
  });

  it('handles binary payloads, whitespace and URL-safe alphabets', () => {
    const original = Uint8Array.from([0, 255, 16, 251, 191, 0xbe]);
    const std = Buffer.from(original).toString('base64');
    const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_');
    assert.deepEqual(base64ToBytes(std), original);
    assert.deepEqual(base64ToBytes(`${urlSafe.slice(0, 4)}\n${urlSafe.slice(4)}`), original);
  });

  it('returns an empty array for an empty string', () => {
    assert.equal(base64ToBytes('').length, 0);
  });
});
