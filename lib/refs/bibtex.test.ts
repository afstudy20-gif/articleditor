import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBibtex } from './bibtex';

describe('parseBibtex', () => {
  it('parses a multi-line entry', () => {
    const bib = `@article{smith2020,
  title = {Effects of sleep on memory},
  author = {Smith, John and Doe, Roberta},
  journal = {Nature},
  year = {2020},
  volume = {15},
  number = {3},
  pages = {123--130},
  doi = {10.1234/abc}
}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 1);
    const r = refs[0];
    assert.equal(r.title, 'Effects of sleep on memory');
    assert.equal(r.year, 2020);
    assert.equal(r.volume, '15');
    assert.equal(r.issue, '3');
    assert.equal(r.pages, '123-130');
    assert.equal(r.doi, '10.1234/abc');
    assert.equal(r.authors.length, 2);
    assert.equal(r.authors[0].family, 'Smith');
    assert.equal(r.authors[0].given, 'John');
    assert.equal(r.authors[1].family, 'Doe');
  });

  it('parses a single-line (compact) entry', () => {
    // Regression: the old \n\s*\} regex dropped compact exports entirely.
    const bib = `@article{key1, title = {Compact Title}, author = {Lee, C.}, journal = {Science}, year = {2021}, doi = {10.5/x}}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'Compact Title');
    assert.equal(refs[0].year, 2021);
    assert.equal(refs[0].authors[0].family, 'Lee');
    assert.equal(refs[0].doi, '10.5/x');
  });

  it('parses multiple entries back-to-back', () => {
    const bib = `@article{a, title = {First}, author = {Smith, J}, year = {2020}}

@book{b, title = {Second}, author = {Jones, K}, publisher = {Pub}, year = {2021}}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].title, 'First');
    assert.equal(refs[0].type, 'journal-article');
    assert.equal(refs[1].title, 'Second');
    assert.equal(refs[1].type, 'book');
  });

  it('skips @string macro definitions', () => {
    const bib = `@string{j = {Journal of Things}}
@article{a, title = {T}, author = {Smith, J}, journal = j, year = {2020}}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'T');
  });

  it('preserves an explicit url field', () => {
    const bib = `@online{a, title = {Web}, author = {Smith, J}, year = {2022}, url = {https://example.com/page}}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].url, 'https://example.com/page');
  });

  it('keeps url undefined when only doi is present', () => {
    const bib = `@article{a, title = {T}, author = {Smith, J}, year = {2020}, doi = {10.1/x}}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].doi, '10.1/x');
    assert.equal(refs[0].url, undefined);
  });

  it('handles quoted field values and nested braces', () => {
    const bib = `@article{a, title = "A {Special} Title", author = {Smith, J}, year = {2020}}`;
    const refs = parseBibtex(bib);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'A Special Title');
  });

  it('returns empty for malformed input', () => {
    assert.deepEqual(parseBibtex('not bibtex at all'), []);
    assert.deepEqual(parseBibtex(''), []);
    // Unclosed brace — parser stops without throwing.
    assert.deepEqual(parseBibtex('@article{a, title = {T'), []);
  });
});
