import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import {
  formatFullAuthorJournalRef,
  refsToFullAuthorJournalList,
  refsToOrderedDoiList,
} from './export-library';

const ref: Ref = {
  id: 'r1',
  type: 'journal-article',
  authors: [
    { family: 'Smith', given: 'Alice B' },
    { family: 'Doe', given: 'C' },
  ],
  year: 2024,
  title: 'A complete article title.',
  containerTitle: 'Journal of Clinical Medicine',
  volume: '13',
  issue: '6',
  pages: '120-129',
  doi: 'https://doi.org/10.3390/jcm13060120',
};

describe('library reference exports', () => {
  it('exports DOI-only lines in library order', () => {
    const second: Ref = { ...ref, id: 'r2', doi: 'doi:10.1000/example.' };
    const noDoi: Ref = { ...ref, id: 'r3', doi: undefined };

    assert.equal(
      refsToOrderedDoiList([ref, noDoi, second]),
      '10.3390/jcm13060120\n10.1000/example',
    );
  });

  it('formats all authors as Family, A. B. with full journal metadata', () => {
    assert.equal(
      formatFullAuthorJournalRef(ref),
      'Smith, A. B.; Doe, C. 2024. "A complete article title", Journal of Clinical Medicine, 13(6), 120-129. doi:10.3390/jcm13060120',
    );
  });

  it('joins formatted references with one reference per line', () => {
    assert.equal(refsToFullAuthorJournalList([ref]).split('\n').length, 1);
  });
});
