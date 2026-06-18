import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chunkText } from './chunker';

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    const text = 'A short paragraph with a few words.';
    const chunks = chunkText(text);

    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], {
      text,
      charStart: 0,
      charEnd: text.length,
      tokenCount: 10,
    });
  });

  it('returns one empty chunk for empty text', () => {
    assert.deepEqual(chunkText(''), [
      { text: '', charStart: 0, charEnd: 0, tokenCount: 0 },
    ]);
  });

  it('splits long text into multiple chunks', () => {
    const text = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
    const chunks = chunkText(text, { tokens: 13, overlap: 0 });

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.tokenCount <= 13));
  });

  it('moves chunk ends to nearby sentence boundaries', () => {
    const text = 'One two three four. Five six seven eight. Nine ten eleven twelve.';
    const chunks = chunkText(text, { tokens: 7, overlap: 0 });

    assert.equal(chunks[0]?.text, 'One two three four.');
    assert.equal(chunks[1]?.text, 'Five six seven eight.');
  });

  it('moves chunk ends to nearby paragraph boundaries', () => {
    const text = 'Alpha beta gamma delta\n\nEpsilon zeta eta theta\n\nIota kappa lambda mu';
    const chunks = chunkText(text, { tokens: 7, overlap: 0 });

    assert.equal(chunks[0]?.text, 'Alpha beta gamma delta');
    assert.equal(chunks[1]?.text, 'Epsilon zeta eta theta');
  });

  it('applies overlap between adjacent chunks', () => {
    const text = 'one two three four five six seven eight nine ten';
    const chunks = chunkText(text, { tokens: 5, overlap: 3 });

    assert.ok(chunks.length > 1);
    assert.equal(chunks[0]?.text, 'one two three');
    assert.equal(chunks[1]?.text, 'two three four');
    assert.equal(chunks[2]?.text, 'three four five');
  });

  it('reports charStart and charEnd indexes from the original text', () => {
    const text = 'zero one two three four five six';
    const chunks = chunkText(text, { tokens: 5, overlap: 0 });

    for (const chunk of chunks) {
      assert.equal(chunk.text, text.slice(chunk.charStart, chunk.charEnd));
    }

    assert.equal(chunks[1]?.charStart, text.indexOf('three'));
    assert.equal(chunks[1]?.charEnd, text.indexOf('six') - 1);
  });
});
