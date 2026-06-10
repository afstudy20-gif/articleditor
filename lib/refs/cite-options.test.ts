import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatInTextCitation } from './styles';
import type { Ref } from '@/store/types';

function ref(id: string, family: string, year: number, extra?: Partial<Ref>): Ref {
  return {
    id,
    type: 'journal-article',
    authors: [{ family, given: 'A.' }],
    year,
    title: `Title ${family}`,
    ...extra,
  };
}

const smith = ref('r1', 'Smith', 2020);

describe('formatInTextCitation with CiteOptions', () => {
  it('vancouver: locator inside bracket, prefix/suffix outside', () => {
    assert.equal(formatInTextCitation('vancouver', [smith], [3]), '[3]');
    assert.equal(
      formatInTextCitation('vancouver', [smith], [3], { locator: 's. 12' }),
      '[3, s. 12]',
    );
    assert.equal(
      formatInTextCitation('vancouver', [smith], [3], { prefix: 'bkz.', suffix: 'ayrıca' }),
      'bkz. [3] ayrıca',
    );
  });

  it('apa: locator inside parens', () => {
    assert.equal(formatInTextCitation('apa', [smith], [1]), '(Smith, 2020)');
    assert.equal(
      formatInTextCitation('apa', [smith], [1], { locator: 'p. 12' }),
      '(Smith, 2020, p. 12)',
    );
    assert.equal(
      formatInTextCitation('apa', [smith], [1], { prefix: 'see' }),
      '(see Smith, 2020)',
    );
  });

  it('apa: suppressAuthor renders year only', () => {
    assert.equal(
      formatInTextCitation('apa', [smith], [1], { suppressAuthor: true }),
      '(2020)',
    );
    assert.equal(
      formatInTextCitation('apa', [smith], [1], { suppressAuthor: true, locator: 'p. 5' }),
      '(2020, p. 5)',
    );
  });

  it('no options → unchanged output (regression)', () => {
    const two = [ref('r1', 'Smith', 2020), ref('r2', 'Jones', 2021, { authors: [{ family: 'Jones', given: 'B.' }, { family: 'Kim', given: 'C.' }] })];
    assert.equal(formatInTextCitation('vancouver', two, [1, 2]), '[1-2]');
    assert.equal(formatInTextCitation('apa', two, [1, 2]), '(Smith, 2020; Jones & Kim, 2021)');
  });
});
