import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, topK } from './cosine';

const approx = (actual: number, expected: number, eps = 1e-9): void => {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} ≈ ${expected}`);
};

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    approx(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
  });

  it('returns 1 for parallel vectors of different magnitude', () => {
    approx(cosineSimilarity([1, 2, 3], [2, 4, 6]), 1);
  });

  it('returns 0 for orthogonal vectors', () => {
    approx(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  it('returns -1 for opposite vectors', () => {
    approx(cosineSimilarity([1, 2], [-1, -2]), -1);
  });

  it('returns 0 when either vector is all zeros', () => {
    assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
    assert.equal(cosineSimilarity([1, 2, 3], [0, 0, 0]), 0);
    assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
  });

  it('returns 0 for mismatched lengths', () => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0);
    assert.equal(cosineSimilarity([1], [1, 0, 0]), 0);
  });

  it('returns 0 for empty vectors', () => {
    assert.equal(cosineSimilarity([], []), 0);
    assert.equal(cosineSimilarity([], [1, 2]), 0);
  });

  it('computes a known intermediate value', () => {
    // cos(45°) between [1,0] and [1,1]
    approx(cosineSimilarity([1, 0], [1, 1]), Math.SQRT1_2);
  });
});

describe('topK', () => {
  type Item = { id: string; emb?: number[] };
  const items: Item[] = [
    { id: 'exact', emb: [1, 0] },
    { id: 'close', emb: [1, 0.5] },
    { id: 'orthogonal', emb: [0, 1] },
    { id: 'no-embedding' },
    { id: 'empty-embedding', emb: [] },
  ];
  const get = (i: Item): number[] | undefined => i.emb;

  it('returns the k best matches sorted by descending score', () => {
    const result = topK(items, [1, 0], get, 2);
    assert.deepEqual(
      result.map((r) => r.item.id),
      ['exact', 'close'],
    );
    approx(result[0].score, 1);
    assert.ok(result[0].score >= result[1].score);
  });

  it('skips items with missing or empty embeddings', () => {
    const result = topK(items, [1, 0], get, 10);
    assert.deepEqual(
      result.map((r) => r.item.id).sort(),
      ['close', 'exact', 'orthogonal'],
    );
  });

  it('returns an empty array for empty input or k = 0', () => {
    assert.deepEqual(topK([], [1, 0], get, 3), []);
    assert.deepEqual(topK(items, [1, 0], get, 0), []);
  });
});
