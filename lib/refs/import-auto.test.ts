import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectImportFormat, importByAutoDetect, importByExtension, parsePlaintextRefs } from './import-auto';

const SAMPLES: Record<string, string> = {
  ris: 'TY  - JOUR\nAU  - Smith, John\nTI  - A study of things\nPY  - 2020\nDO  - 10.1000/xyz\nER  -\n',
  enw: '%0 Journal Article\n%A Smith, John\n%T A study of things\n%D 2020\n',
  nbib: 'PMID- 12345678\nTI  - A study of things.\nAU  - Smith J\nDP  - 2020\n',
  'endnote-xml':
    '<?xml version="1.0"?><xml><records><record><titles><title>A study</title></titles><dates><year>2020</year></dates></record></records></xml>',
  'pubmed-xml':
    '<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article><ArticleTitle>A study</ArticleTitle></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>',
  bibtex: '@article{smith2020,\n  author = {Smith, John},\n  title = {A study of things},\n  year = {2020}\n}\n',
  'csl-json':
    '[{"id":"smith2020","type":"article-journal","title":"A study of things","issued":{"date-parts":[[2020]]}}]',
  cff: 'cff-version: 1.2.0\nmessage: If you use this software, cite it.\ntitle: My software\nauthors:\n  - family-names: Smith\n    given-names: John\n',
};

describe('detectImportFormat', () => {
  for (const [format, sample] of Object.entries(SAMPLES)) {
    it(`detects ${format}`, () => {
      assert.equal(detectImportFormat(sample), format);
    });
  }

  it('falls back to plaintext for a bibliography-looking line', () => {
    const line = 'Smith J, Doe A. A study of things. J Res. 2020;12(3):45-67.';
    assert.equal(detectImportFormat(line), 'plaintext');
  });

  it('returns unknown for short garbage', () => {
    assert.equal(detectImportFormat('hello'), 'unknown');
    assert.equal(detectImportFormat(''), 'unknown');
  });
});

describe('importByAutoDetect', () => {
  it('parses each canonical sample without throwing and yields refs', () => {
    for (const [format, sample] of Object.entries(SAMPLES)) {
      const { format: got, refs } = importByAutoDetect(sample);
      assert.equal(got, format);
      assert.ok(Array.isArray(refs), format);
      assert.ok(refs.length >= 1, `${format} should yield at least one ref`);
    }
  });

  it('returns empty refs for unknown input', () => {
    const { format, refs } = importByAutoDetect('xx');
    assert.equal(format, 'unknown');
    assert.deepEqual(refs, []);
  });
});

describe('importByExtension', () => {
  it('routes by file extension', () => {
    assert.equal(importByExtension('lib.ris', SAMPLES.ris).format, 'ris');
    assert.equal(importByExtension('lib.bib', SAMPLES.bibtex).format, 'bibtex');
    assert.equal(importByExtension('lib.enw', SAMPLES.enw).format, 'enw');
    assert.equal(importByExtension('lib.nbib', SAMPLES.nbib).format, 'nbib');
    assert.equal(importByExtension('lib.json', SAMPLES['csl-json']).format, 'csl-json');
    assert.equal(importByExtension('CITATION.cff', SAMPLES.cff).format, 'cff');
  });

  it('sniffs inside .xml to distinguish PubMed from EndNote', () => {
    assert.equal(importByExtension('export.xml', SAMPLES['pubmed-xml']).format, 'pubmed-xml');
    assert.equal(importByExtension('export.xml', SAMPLES['endnote-xml']).format, 'endnote-xml');
  });

  it('falls back to auto-detect for unknown extensions', () => {
    assert.equal(importByExtension('refs.txt', SAMPLES.ris).format, 'ris');
  });
});

describe('parsePlaintextRefs', () => {
  it('splits numbered reference lists', () => {
    const text = [
      '1. Smith J, Doe A. First study of things. J Res. 2020;12(3):45-67.',
      '2. Brown K. Second study of stuff. Ann Sci. 2019;8:1-9.',
    ].join('\n');
    const refs = parsePlaintextRefs(text);
    assert.equal(refs.length, 2);
  });

  it('splits blank-line separated references', () => {
    const text =
      'Smith J, Doe A. First study of things. J Res. 2020;12(3):45-67.\n\n' +
      'Brown K. Second study of stuff. Ann Sci. 2019;8:1-9.';
    const refs = parsePlaintextRefs(text);
    assert.equal(refs.length, 2);
  });

  it('falls back to one-per-line when no separators', () => {
    const text =
      'Smith J, Doe A. First study of things. J Res. 2020;12(3):45-67.\n' +
      'Brown K. Second study of stuff. Ann Sci. 2019;8:1-9.';
    const refs = parsePlaintextRefs(text);
    assert.equal(refs.length, 2);
  });
});
