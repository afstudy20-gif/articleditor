import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeCitations,
  decodeCitations,
  citationPreservationInstruction,
} from './citation-safety';

// Derive the sentinel delimiters from the implementation itself so the tests
// don't hardcode the private-use-area characters.
const probe = encodeCitations('[1]').encoded; // OPEN + '0' + CLOSE
const OPEN = probe[0];
const CLOSE = probe[probe.length - 1];
const token = (i: number): string => `${OPEN}${i}${CLOSE}`;

describe('encodeCitations', () => {
  it('replaces each citation with an indexed sentinel', () => {
    const { encoded, placeholders } = encodeCitations('Alpha [1] beta [2,3] gamma.');
    assert.equal(encoded, `Alpha ${token(0)} beta ${token(1)} gamma.`);
    assert.deepEqual(placeholders, [
      { index: 0, original: '[1]' },
      { index: 1, original: '[2,3]' },
    ]);
  });

  it('handles range citations with hyphen and en-dash', () => {
    const { encoded, placeholders } = encodeCitations('See [1-3] and [4–6].');
    assert.equal(encoded, `See ${token(0)} and ${token(1)}.`);
    assert.deepEqual(
      placeholders.map((p) => p.original),
      ['[1-3]', '[4–6]'],
    );
  });

  it('leaves text without citations untouched', () => {
    const { encoded, placeholders } = encodeCitations('No citations here.');
    assert.equal(encoded, 'No citations here.');
    assert.deepEqual(placeholders, []);
  });

  it('handles empty text', () => {
    const { encoded, placeholders } = encodeCitations('');
    assert.equal(encoded, '');
    assert.deepEqual(placeholders, []);
  });

  it('does not treat non-numeric brackets as citations', () => {
    const { encoded, placeholders } = encodeCitations('array[i] and [sic]');
    assert.equal(encoded, 'array[i] and [sic]');
    assert.deepEqual(placeholders, []);
  });
});

describe('decodeCitations', () => {
  it('round-trips when all sentinels are preserved', () => {
    const original = 'Alpha [1] beta [2,3] gamma [4-6].';
    const { encoded, placeholders } = encodeCitations(original);
    const { decoded, missing, extras } = decodeCitations(encoded, placeholders);
    assert.equal(decoded, original);
    assert.deepEqual(missing, []);
    assert.deepEqual(extras, []);
  });

  it('survives sentinel reordering (all still present)', () => {
    const { placeholders } = encodeCitations('a [1] b [2]');
    const reordered = `x ${token(1)} y ${token(0)} z`;
    const { decoded, missing, extras } = decodeCitations(reordered, placeholders);
    assert.equal(decoded, 'x [2] y [1] z');
    assert.deepEqual(missing, []);
    assert.deepEqual(extras, []);
  });

  it('reports dropped sentinels as missing', () => {
    const { placeholders } = encodeCitations('a [1] b [2] c [3]');
    // LLM dropped the middle citation.
    const response = `a ${token(0)} b c ${token(2)}`;
    const { decoded, missing, extras } = decodeCitations(response, placeholders);
    assert.equal(decoded, 'a [1] b c [3]');
    assert.deepEqual(missing, [1]);
    assert.deepEqual(extras, []);
  });

  it('reports all sentinels missing when the LLM stripped everything', () => {
    const { placeholders } = encodeCitations('a [1] b [2]');
    const { decoded, missing, extras } = decodeCitations('plain rewrite', placeholders);
    assert.equal(decoded, 'plain rewrite');
    assert.deepEqual(missing, [0, 1]);
    assert.deepEqual(extras, []);
  });

  it('reports invented sentinel indices as extras and strips them', () => {
    const { placeholders } = encodeCitations('a [1]');
    const response = `a ${token(0)} b ${token(5)}`;
    const { decoded, missing, extras } = decodeCitations(response, placeholders);
    assert.equal(decoded, 'a [1] b ');
    assert.deepEqual(missing, []);
    assert.deepEqual(extras, [5]);
  });

  it('restores duplicated valid sentinels at every occurrence without flagging', () => {
    // Defined behavior: a duplicated *valid* index is restored twice; only
    // out-of-range indices count as extras.
    const { placeholders } = encodeCitations('a [7]');
    const response = `${token(0)} and again ${token(0)}`;
    const { decoded, missing, extras } = decodeCitations(response, placeholders);
    assert.equal(decoded, '[7] and again [7]');
    assert.deepEqual(missing, []);
    assert.deepEqual(extras, []);
  });

  it('handles empty response text', () => {
    const { placeholders } = encodeCitations('a [1]');
    const { decoded, missing, extras } = decodeCitations('', placeholders);
    assert.equal(decoded, '');
    assert.deepEqual(missing, [0]);
    assert.deepEqual(extras, []);
  });

  it('handles empty placeholder list', () => {
    const { decoded, missing, extras } = decodeCitations('no tokens', []);
    assert.equal(decoded, 'no tokens');
    assert.deepEqual(missing, []);
    assert.deepEqual(extras, []);
  });
});

describe('citationPreservationInstruction', () => {
  it('returns empty string for zero citations', () => {
    assert.equal(citationPreservationInstruction(0), '');
  });

  it('mentions the count and the sentinel delimiters', () => {
    const instr = citationPreservationInstruction(3);
    assert.ok(instr.includes('3'));
    assert.ok(instr.includes(OPEN));
    assert.ok(instr.includes(CLOSE));
  });
});
