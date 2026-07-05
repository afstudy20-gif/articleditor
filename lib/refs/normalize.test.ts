import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWhitespace,
  parseAuthors,
  firstAuthorFamily,
  authorsToCsl,
  initialsOf,
  vancouverAuthor,
  vancouverAuthorList,
} from './normalize';

describe('normalizeWhitespace', () => {
  it('collapses runs of whitespace and trims', () => {
    assert.equal(normalizeWhitespace('  a\t b\n\nc  '), 'a b c');
    assert.equal(normalizeWhitespace(''), '');
  });
});

describe('parseAuthors', () => {
  it('parses "Last, J." form and drops periods from initials', () => {
    // Note: a full "Smith, John" alone is ambiguous with a comma-separated
    // Vancouver list, so only initials after the comma are merged back.
    const a = parseAuthors('Smith, J.');
    assert.equal(a.length, 1);
    assert.equal(a[0].family, 'Smith');
    assert.equal(a[0].given, 'J');
  });

  it('parses "First Last" form', () => {
    const a = parseAuthors('John Smith');
    assert.equal(a.length, 1);
    assert.deepEqual(a[0], { given: 'John', family: 'Smith' });
  });

  it('parses Vancouver "Family II" initials form', () => {
    const a = parseAuthors('Smith JA');
    assert.deepEqual(a[0], { family: 'Smith', given: 'JA' });
  });

  it('splits comma-separated Vancouver author lists', () => {
    const a = parseAuthors('Smith J, Jones K, Brown L');
    assert.equal(a.length, 3);
    assert.deepEqual(a[0], { family: 'Smith', given: 'J' });
    assert.deepEqual(a[2], { family: 'Brown', given: 'L' });
  });

  it('splits semicolon-separated lists of "Last, First"', () => {
    const a = parseAuthors('Smith, John; Doe, Jane');
    assert.equal(a.length, 2);
    assert.equal(a[0].family, 'Smith');
    assert.equal(a[1].family, 'Doe');
    assert.equal(a[1].given, 'Jane');
  });

  it('handles "and" separators', () => {
    const a = parseAuthors('John Smith and Jane Doe');
    assert.equal(a.length, 2);
    assert.equal(a[0].family, 'Smith');
    assert.equal(a[1].family, 'Doe');
  });

  it('strips a trailing "et al."', () => {
    const a = parseAuthors('Smith J, Jones K, et al.');
    assert.equal(a.length, 2);
    assert.equal(a[1].family, 'Jones');
  });

  it('keeps corporate authors as a single literal', () => {
    const a = parseAuthors('GUSTO Investigators');
    assert.equal(a.length, 1);
    assert.equal(a[0].literal, 'GUSTO Investigators');
    assert.equal(a[0].family, undefined);
  });

  it('handles Turkish diacritics in initials form', () => {
    const a = parseAuthors('Çelik Ö');
    assert.deepEqual(a[0], { family: 'Çelik', given: 'Ö' });
  });

  it('returns [] for empty input', () => {
    assert.deepEqual(parseAuthors(''), []);
    assert.deepEqual(parseAuthors('et al.'), []);
  });
});

describe('firstAuthorFamily', () => {
  it('prefers family, then literal, then given', () => {
    assert.equal(firstAuthorFamily([{ family: 'Smith', given: 'J' }]), 'Smith');
    assert.equal(firstAuthorFamily([{ literal: 'WHO' }]), 'WHO');
    assert.equal(firstAuthorFamily([{ given: 'Prince' }]), 'Prince');
  });

  it('falls back to Anonymous for empty list', () => {
    assert.equal(firstAuthorFamily([]), 'Anonymous');
  });
});

describe('authorsToCsl', () => {
  it('returns copies, not the same objects', () => {
    const src = [{ family: 'Smith', given: 'J' }];
    const out = authorsToCsl(src);
    assert.deepEqual(out, src);
    assert.notEqual(out[0], src[0]);
  });
});

describe('initialsOf', () => {
  it('handles periods, spaces, hyphens and case', () => {
    assert.equal(initialsOf('Vanessa S.'), 'VS');
    assert.equal(initialsOf('Kyung Hoon'), 'KH');
    assert.equal(initialsOf('J-P'), 'JP');
    assert.equal(initialsOf('J. P.'), 'JP');
    assert.equal(initialsOf('jean-paul'), 'JP');
    assert.equal(initialsOf(undefined), '');
    assert.equal(initialsOf(''), '');
  });

  it('uppercases Turkish lowercase initials', () => {
    assert.equal(initialsOf('özlem şafak'), 'ÖŞ');
  });
});

describe('vancouverAuthor', () => {
  it('renders "Family II"', () => {
    assert.equal(vancouverAuthor({ family: 'Smith', given: 'John A' }), 'Smith JA');
  });

  it('parses a "Last, First" literal', () => {
    assert.equal(vancouverAuthor({ literal: 'Smith, John A' }), 'Smith JA');
  });

  it('keeps a non-parseable literal as-is', () => {
    assert.equal(vancouverAuthor({ literal: 'WHO Study Group' }), 'WHO Study Group');
  });

  it('handles family-only and given-only authors', () => {
    assert.equal(vancouverAuthor({ family: 'Smith' }), 'Smith');
    assert.equal(vancouverAuthor({ given: 'John' }), 'J');
    assert.equal(vancouverAuthor({}), '');
  });
});

describe('vancouverAuthorList', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ family: `Fam${i + 1}`, given: 'A' }));

  it('joins up to the max without et al', () => {
    const out = vancouverAuthorList(many(6));
    assert.equal(out, 'Fam1 A, Fam2 A, Fam3 A, Fam4 A, Fam5 A, Fam6 A');
    assert.equal(out.includes('et al'), false);
  });

  it('truncates 7+ authors to six plus et al', () => {
    const out = vancouverAuthorList(many(7));
    assert.equal(out, 'Fam1 A, Fam2 A, Fam3 A, Fam4 A, Fam5 A, Fam6 A, et al');
    assert.equal(out.includes('Fam7'), false);
  });

  it('respects a custom max', () => {
    assert.equal(vancouverAuthorList(many(4), 3), 'Fam1 A, Fam2 A, Fam3 A, et al');
  });

  it('returns empty string for no authors', () => {
    assert.equal(vancouverAuthorList([]), '');
  });
});
