import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cosineSimilarity, mmrReRank, topK, type Vector } from './cosine';

function vector(values: number[]): Vector {
  return new Float32Array(values);
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    assert.equal(cosineSimilarity(vector([1, 2, 3]), vector([1, 2, 3])), 1);
  });

  it('returns 0 for orthogonal vectors', () => {
    assert.equal(cosineSimilarity(vector([1, 0]), vector([0, 1])), 0);
  });

  it('returns -1 for opposite vectors', () => {
    assert.equal(cosineSimilarity(vector([2, 0]), vector([-4, 0])), -1);
  });

  it('throws for dimension mismatch', () => {
    assert.throws(
      () => cosineSimilarity(vector([1, 2]), vector([1])),
      /same dimension/,
    );
  });

  it('returns 0 for empty vectors', () => {
    assert.equal(cosineSimilarity(vector([]), vector([])), 0);
  });

  it('returns 0 for zero-norm vectors', () => {
    assert.equal(cosineSimilarity(vector([0, 0]), vector([1, 2])), 0);
  });
});

describe('topK', () => {
  it('returns an empty array for empty candidates', () => {
    assert.deepEqual(topK(vector([1, 0]), [], 3), []);
  });

  it('returns all candidates when k is greater than candidate count', () => {
    const result = topK(
      vector([1, 0]),
      [{ id: 'a', vector: vector([1, 0]) }],
      10,
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'a');
    assert.equal(result[0]?.score, 1);
  });

  it('keeps ties stable by original index', () => {
    const result = topK(
      vector([1, 0]),
      [
        { id: 'first', vector: vector([1, 0]) },
        { id: 'second', vector: vector([1, 0]) },
        { id: 'third', vector: vector([1, 0]) },
      ],
      2,
    );

    assert.deepEqual(
      result.map((candidate) => candidate.id),
      ['first', 'second'],
    );
  });

  it('orders results by descending score', () => {
    const result = topK(
      vector([1, 0]),
      [
        { id: 'low', vector: vector([0, 1]) },
        { id: 'high', vector: vector([1, 0]) },
        { id: 'mid', vector: vector([1, 1]) },
      ],
      3,
    );

    assert.deepEqual(
      result.map((candidate) => candidate.id),
      ['high', 'mid', 'low'],
    );
    assert.ok((result[0]?.score ?? 0) > (result[1]?.score ?? 0));
    assert.ok((result[1]?.score ?? 0) > (result[2]?.score ?? -1));
  });
});

describe('mmrReRank', () => {
  it('returns an empty array when candidates are empty', () => {
    assert.deepEqual(mmrReRank(vector([1, 0]), [], 3), []);
  });

  it('returns at most k candidates', () => {
    const candidates = topK(
      vector([1, 0]),
      [
        { id: 'a', vector: vector([1, 0]) },
        { id: 'b', vector: vector([0, 1]) },
      ],
      2,
    );

    assert.equal(mmrReRank(vector([1, 0]), candidates, 1).length, 1);
  });

  it('uses pure relevance when lambda is 1', () => {
    const candidates = topK(
      vector([1, 0]),
      [
        { id: 'near', vector: vector([1, 0]) },
        { id: 'also-near', vector: vector([0.9, 0.1]) },
        { id: 'diverse', vector: vector([0, 1]) },
      ],
      3,
    );

    const result = mmrReRank(vector([1, 0]), candidates, 2, 1);

    assert.deepEqual(
      result.map((candidate) => candidate.id),
      ['near', 'also-near'],
    );
  });

  it('prioritizes diversity after the first stable pick when lambda is 0', () => {
    const candidates = topK(
      vector([1, 0]),
      [
        { id: 'near', vector: vector([1, 0]) },
        { id: 'also-near', vector: vector([0.9, 0.1]) },
        { id: 'diverse', vector: vector([0, 1]) },
      ],
      3,
    );

    const result = mmrReRank(vector([1, 0]), candidates, 2, 0);

    assert.deepEqual(
      result.map((candidate) => candidate.id),
      ['near', 'diverse'],
    );
  });
});
