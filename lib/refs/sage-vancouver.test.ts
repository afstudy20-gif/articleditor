import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Ref } from '@/store/types';
import {
  formatBibEntry,
  formatInTextCitation,
  isNumericStyle,
  isSuperscriptCitationStyle,
  STYLE_LABELS,
} from './styles';

const ref: Ref = {
  id: 'sage-1',
  type: 'journal-article',
  authors: [
    { family: 'Smith', given: 'John A' },
    { family: 'Doe', given: 'Ruth B' },
    { family: 'Brown', given: 'Carol C' },
    { family: 'Jones', given: 'David D' },
  ],
  title: 'A clinical research article',
  containerTitle: 'J Int Med Res',
  year: 2024,
  volume: '52',
  issue: '3',
  pages: '123-130',
  doi: '10.1000/example',
};

describe('SAGE Vancouver style', () => {
  it('is selectable as a superscript numeric style', () => {
    assert.equal(STYLE_LABELS['sage-vancouver'], 'SAGE Vancouver');
    assert.equal(isNumericStyle('sage-vancouver'), true);
    assert.equal(isSuperscriptCitationStyle('sage-vancouver'), true);
  });

  it('renders bare numbers and compresses only runs of three or more', () => {
    assert.equal(formatInTextCitation('sage-vancouver', [], [1]), '1');
    assert.equal(formatInTextCitation('sage-vancouver', [], [1, 2]), '1,2');
    assert.equal(formatInTextCitation('sage-vancouver', [], [1, 2, 3, 5]), '1–3,5');
  });

  it('lists the first three authors followed by et al.', () => {
    assert.equal(
      formatBibEntry('sage-vancouver', ref, 1),
      '1. Smith JA, Doe RB, Brown CC, et al. A clinical research article. J Int Med Res. 2024;52(3):123-130. doi:10.1000/example',
    );
  });
});
