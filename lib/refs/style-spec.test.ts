import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import { presetSpec, formatInTextSpec, formatBibEntrySpec, renderAuthorList } from './style-spec';

const twoAuthor: Ref = {
  id: 'a',
  type: 'journal-article',
  authors: [
    { family: 'Smith', given: 'John A' },
    { family: 'Doe', given: 'Roberta B' },
  ],
  title: 'A study of things',
  containerTitle: 'Nature',
  year: 2019,
  volume: '15',
  issue: '3',
  pages: '123-130',
  doi: '10.1/x',
};

const sevenAuthor: Ref = {
  ...twoAuthor,
  id: 'b',
  authors: Array.from({ length: 7 }, (_, i) => ({ family: `Auth${i}`, given: 'X Y' })),
};

describe('vancouver preset spec', () => {
  const s = presetSpec('vancouver');
  it('numeric in-text with square brackets and ranges', () => {
    assert.equal(formatInTextSpec(s, [twoAuthor], [1]), '[1]');
    assert.equal(formatInTextSpec(s, [], [1, 2, 3]), '[1-3]');
    assert.equal(formatInTextSpec(s, [], [1, 3]), '[1,3]');
  });
  it('bib entry numbered, family-initials, et al after 6', () => {
    const e = formatBibEntrySpec(s, twoAuthor, 1);
    assert.match(e, /^1\. Smith JA, Doe RB\. A study of things\. Nature\. 2019;15\(3\):123-130\. doi:10\.1\/x$/);
    const e7 = formatBibEntrySpec(s, sevenAuthor, 2);
    assert.match(e7, /Auth5 XY, et al\./);
  });
});

describe('apa preset spec', () => {
  const s = presetSpec('apa');
  it('author-year in-text', () => {
    assert.equal(formatInTextSpec(s, [twoAuthor], [1]), '(Smith & Doe, 2019)');
    assert.equal(formatInTextSpec(s, [sevenAuthor], [1]), '(Auth0 et al., 2019)');
  });
  it('bib entry has year in parens and italic journal', () => {
    const e = formatBibEntrySpec(s, twoAuthor, 1);
    assert.match(e, /Smith, J\. A\., & Doe, R\. B\. \(2019\)\./);
    assert.match(e, /\*Nature\*, 15\(3\), 123-130\./);
    assert.match(e, /https:\/\/doi\.org\/10\.1\/x/);
  });
});

describe('ieee preset spec', () => {
  const s = presetSpec('ieee');
  it('bracket number, quoted title, vol/no/pp', () => {
    const e = formatBibEntrySpec(s, twoAuthor, 3);
    assert.equal(e, '[3] Smith JA, Doe RB. "A study of things," Nature, vol. 15, no. 3, pp. 123-130, 2019. doi: 10.1/x');
  });
});

describe('renderAuthorList knobs', () => {
  it('family-comma-initials with periods+spaces', () => {
    const out = renderAuthorList(twoAuthor.authors, {
      ...presetSpec('apa').authors,
      maxBeforeEtAl: 6,
      showCount: 6,
    });
    assert.equal(out, 'Smith, J. A., & Doe, R. B.');
  });
  it('initials-family order', () => {
    const out = renderAuthorList([{ family: 'Smith', given: 'John A' }], {
      ...presetSpec('ieee').authors,
      nameOrder: 'initials-family',
      initialPeriods: true,
      initialSpaces: true,
    });
    assert.equal(out, 'J. A. Smith');
  });
  it('truncates to et al. past max', () => {
    const out = renderAuthorList(sevenAuthor.authors, { ...presetSpec('vancouver').authors });
    assert.match(out, /Auth5 XY, et al$/);
  });
});
