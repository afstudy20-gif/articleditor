import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import {
  formatBibEntry,
  formatInTextCitation,
  isNumericStyle,
  orderRefsForBib,
  STYLE_LABELS,
} from './styles';

const smith: Ref = {
  id: 'smith',
  type: 'journal-article',
  authors: [
    { family: 'Smith', given: 'John A' },
    { family: 'Doe', given: 'Roberta B' },
  ],
  title: 'A complete article title',
  containerTitle: 'Journal of Clinical Medicine',
  year: 2024,
  volume: '13',
  issue: '6',
  pages: '120-129',
  doi: '10.3390/jcm13060120',
};

const adams: Ref = {
  ...smith,
  id: 'adams',
  authors: [{ family: 'Adams', given: 'Mary' }],
  year: 2023,
};

describe('MDPI reference styles', () => {
  it('lists all MDPI styles as built-in options', () => {
    assert.equal(STYLE_LABELS['mdpi-acs'], 'MDPI ACS');
    assert.equal(STYLE_LABELS['mdpi-chicago'], 'MDPI Chicago');
    assert.equal(STYLE_LABELS['mdpi-apa'], 'MDPI APA');
  });

  it('formats JCM/MDPI ACS citations with ranges and external page locators', () => {
    assert.equal(
      formatInTextCitation('mdpi-acs', [smith], [1, 2, 3]),
      '[1–3]',
    );
    assert.equal(
      formatInTextCitation('mdpi-acs', [smith], [5], { locator: 'p. 10' }),
      '[5] (p. 10)',
    );
    assert.equal(isNumericStyle('mdpi-acs'), true);
  });

  it('formats an MDPI ACS journal reference with full title and no issue number', () => {
    assert.equal(
      formatBibEntry('mdpi-acs', smith, 1),
      '1. Smith, J.A.; Doe, R.B. A complete article title. Journal of Clinical Medicine 2024, 13, 120-129. https://doi.org/10.3390/jcm13060120',
    );
  });

  it('supports MDPI Chicago and APA author-year variants', () => {
    assert.equal(
      formatInTextCitation('mdpi-chicago', [smith], [1]),
      '(Smith and Doe 2024)',
    );
    assert.equal(
      formatInTextCitation('mdpi-apa', [smith], [1]),
      '(Smith & Doe, 2024)',
    );
    assert.equal(isNumericStyle('mdpi-chicago'), false);
    assert.equal(isNumericStyle('mdpi-apa'), false);
  });

  it('sorts MDPI author-year bibliographies alphabetically', () => {
    assert.deepEqual(
      orderRefsForBib('mdpi-chicago', [smith, adams]).map((ref) => ref.id),
      ['adams', 'smith'],
    );
    assert.deepEqual(
      orderRefsForBib('mdpi-apa', [smith, adams]).map((ref) => ref.id),
      ['adams', 'smith'],
    );
  });
});
