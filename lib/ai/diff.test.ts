import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffWords, diffRatio, type DiffSegment } from './diff';

const joinTypes = (segs: DiffSegment[], types: Array<DiffSegment['type']>): string =>
  segs
    .filter((s) => types.includes(s.type))
    .map((s) => s.value)
    .join('');

describe('diffWords', () => {
  it('marks equal strings as a single unchanged segment', () => {
    const segs = diffWords('the quick fox', 'the quick fox');
    assert.deepEqual(segs, [{ type: 'same', value: 'the quick fox' }]);
  });

  it('detects an insertion', () => {
    const segs = diffWords('the fox', 'the quick fox');
    const added = segs.filter((s) => s.type === 'add');
    assert.ok(added.length > 0);
    assert.ok(added.map((s) => s.value).join('').includes('quick'));
    assert.equal(joinTypes(segs, ['same', 'remove']), 'the fox');
    assert.equal(joinTypes(segs, ['same', 'add']), 'the quick fox');
  });

  it('detects a deletion', () => {
    const segs = diffWords('the quick brown fox', 'the fox');
    const removed = segs.filter((s) => s.type === 'remove');
    assert.ok(removed.length > 0);
    assert.equal(joinTypes(segs, ['same', 'remove']), 'the quick brown fox');
    assert.equal(joinTypes(segs, ['same', 'add']), 'the fox');
  });

  it('detects a replacement as remove + add', () => {
    const segs = diffWords('cats are great', 'dogs are great');
    assert.ok(segs.some((s) => s.type === 'remove' && s.value.includes('cats')));
    assert.ok(segs.some((s) => s.type === 'add' && s.value.includes('dogs')));
  });

  it('handles empty before (pure insertion)', () => {
    const segs = diffWords('', 'hello world');
    assert.equal(joinTypes(segs, ['same', 'add']), 'hello world');
    assert.equal(joinTypes(segs, ['same', 'remove']), '');
  });

  it('handles empty after (pure deletion)', () => {
    const segs = diffWords('hello world', '');
    assert.equal(joinTypes(segs, ['same', 'remove']), 'hello world');
    assert.equal(joinTypes(segs, ['same', 'add']), '');
  });

  it('reconstructs both sides for arbitrary input', () => {
    const before = 'One two three. Four five.';
    const after = 'One 2 three! Four five six.';
    const segs = diffWords(before, after);
    assert.equal(joinTypes(segs, ['same', 'remove']), before);
    assert.equal(joinTypes(segs, ['same', 'add']), after);
  });
});

describe('diffRatio', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(diffRatio('same text', 'same text'), 0);
  });

  it('returns 0 for two empty strings', () => {
    assert.equal(diffRatio('', ''), 0);
  });

  it('returns 1 for wholly different strings (no shared tokens)', () => {
    assert.equal(diffRatio('aaa', 'xyz'), 1);
  });

  it('counts shared whitespace as unchanged', () => {
    // 'aaa bbb' vs 'xxx yyy': every word differs but the space survives,
    // so the ratio lands just below 1.
    const r = diffRatio('aaa bbb', 'xxx yyy');
    assert.ok(r > 0.8 && r < 1, `got ${r}`);
  });

  it('returns a value strictly between 0 and 1 for partial edits', () => {
    const r = diffRatio('the quick brown fox jumps', 'the quick red fox jumps');
    assert.ok(r > 0 && r < 1, `got ${r}`);
  });

  it('is capped at 1', () => {
    const r = diffRatio('a', 'completely different and much longer text');
    assert.ok(r <= 1);
  });
});
