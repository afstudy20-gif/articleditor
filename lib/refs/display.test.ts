import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authorList, journalLine } from './display';

describe('authorList', () => {
  it('joins family, given names with semicolons', () => {
    const out = authorList({
      authors: [
        { family: 'Smith', given: 'John' },
        { family: 'Doe', given: 'Jane' },
      ],
    });
    assert.equal(out, 'Smith, John; Doe, Jane');
  });

  it('prefers a literal name over family/given when present', () => {
    const out = authorList({ authors: [{ literal: 'World Health Organization' }] });
    assert.equal(out, 'World Health Organization');
  });

  it('falls back to the em dash for no authors, or a custom fallback', () => {
    assert.equal(authorList({ authors: [] }), '—');
    assert.equal(authorList({ authors: [] }, ''), '');
  });

  it('skips authors with neither literal nor family/given', () => {
    const out = authorList({ authors: [{}, { family: 'Kim' }] });
    assert.equal(out, 'Kim');
  });
});

describe('journalLine', () => {
  it('joins journal, volume(issue), and pages', () => {
    const out = journalLine({ containerTitle: 'J Cardiol', volume: '12', issue: '3', pages: '45-67' });
    assert.equal(out, 'J Cardiol, 12(3), 45-67');
  });

  it('omits missing pieces without leaving stray separators', () => {
    assert.equal(journalLine({ containerTitle: 'J Cardiol' }), 'J Cardiol');
    assert.equal(journalLine({ volume: '12' }), '12');
  });

  it('falls back to the em dash for nothing known, or a custom fallback', () => {
    assert.equal(journalLine({}), '—');
    assert.equal(journalLine({}, ''), '');
  });
});
