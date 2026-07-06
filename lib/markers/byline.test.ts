import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeAuthorByline } from './byline';

describe('looksLikeAuthorByline', () => {
  it('detects author/affiliation paragraph styles regardless of text', () => {
    assert.equal(looksLikeAuthorByline('anything', 'MDPI13authornames'), true);
    assert.equal(looksLikeAuthorByline('anything', 'MDPI16affiliation'), true);
    assert.equal(looksLikeAuthorByline('anything', 'Authors'), true);
    assert.equal(looksLikeAuthorByline('anything', 'Byline'), true);
    assert.equal(looksLikeAuthorByline('anything', 'Correspondence'), true);
  });

  it('detects numbered affiliation lines', () => {
    assert.equal(
      looksLikeAuthorByline('1 Department of Cardiology, Ordu University, Ordu, Türkiye'),
      true,
    );
    assert.equal(looksLikeAuthorByline('2 Faculty of Medicine, Ankara University'), true);
  });

  it('detects multi-author bylines with numeric affiliation markers', () => {
    assert.equal(looksLikeAuthorByline('Fatih Akkaya 1, Nihan Bahadır 1 and Ayşe Yılmaz 2'), true);
    assert.equal(looksLikeAuthorByline('John Smith 1,2, Jane Doe 3'), true);
  });

  it('does NOT flag ordinary body text with citations', () => {
    assert.equal(
      looksLikeAuthorByline('Previous studies have shown improved outcomes [1,2] in this cohort.'),
      false,
    );
    assert.equal(
      looksLikeAuthorByline('The median follow-up was 12 months, and mortality was low.'),
      false,
    );
  });

  it('does NOT flag headings or short strings', () => {
    assert.equal(looksLikeAuthorByline('Introduction'), false);
    assert.equal(looksLikeAuthorByline(''), false);
  });
});
