import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Ref } from '@/store/types';
import { appendUniqueRefs, findMatchingRef, normalizeDoi, normalizePmid } from './dedupe';

function ref(patch: Partial<Ref>): Ref {
  return {
    id: patch.id ?? 'r',
    type: patch.type ?? 'journal-article',
    authors: patch.authors ?? [],
    ...patch,
  };
}

describe('reference dedupe', () => {
  it('normalizes DOI and PMID identifiers', () => {
    assert.equal(normalizeDoi('https://doi.org/10.1000/ABC.123.'), '10.1000/abc.123');
    assert.equal(normalizeDoi('doi:10.1000/ABC.123'), '10.1000/abc.123');
    assert.equal(normalizePmid('PMID: 12345678'), '12345678');
  });

  it('matches references by DOI variants', () => {
    const existing = ref({ id: 'a', doi: '10.1000/ABC.123' });
    const candidate = ref({ id: 'b', doi: 'https://doi.org/10.1000/abc.123' });
    assert.equal(findMatchingRef([existing], candidate)?.id, 'a');
  });

  it('matches references by PMID', () => {
    const existing = ref({ id: 'a', pmid: '12345678' });
    const candidate = ref({ id: 'b', pmid: 'PMID: 12345678' });
    assert.equal(findMatchingRef([existing], candidate)?.id, 'a');
  });

  it('matches exact titles only when years are compatible', () => {
    const title = 'STEMI-Related Mortality';
    const existing = ref({ id: 'a', title, year: 2023 });
    assert.equal(findMatchingRef([existing], ref({ id: 'b', title, year: 2023 }))?.id, 'a');
    assert.equal(findMatchingRef([existing], ref({ id: 'c', title, year: 2020 })), undefined);
  });

  it('appends only new references and reports duplicates', () => {
    const existing = ref({ id: 'a', doi: '10.1000/abc' });
    const duplicate = ref({ id: 'b', doi: 'doi:10.1000/ABC' });
    const fresh = ref({ id: 'c', doi: '10.1000/new' });

    const result = appendUniqueRefs([existing], [duplicate, fresh]);

    assert.deepEqual(result.refs.map((r) => r.id), ['a', 'c']);
    assert.deepEqual(result.added.map((r) => r.id), ['c']);
    assert.deepEqual(result.duplicates.map(({ existing: r }) => r.id), ['a']);
  });
});
