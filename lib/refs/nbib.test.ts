import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseNbib, looksLikeNbib } from './nbib';
import { detectImportFormat, importByAutoDetect, importByExtension } from './import-auto';

const SAMPLE = `PMID- 12345678
OWN - NLM
DA  - 20200101
TI  - Effects of sleep on memory consolidation
      in healthy adults.
AB  - This study evaluated sleep effects on memory.
      Results showed improvement after intervention.
AU  - Smith JA
AU  - Doe RB
FAU - Smith, John A
JT  - Nature
TA  - Nature
VI  - 15
IP  - 3
PG  - 123-30
DP  - 2020 Jan
AID - 10.1234/abc.def [doi]
PT  - Journal Article
SO  - Nature. 2020 Jan;15(3):123-30.

PMID- 22222222
TI  - Second paper.
AU  - Lee CD
JT  - Science
DP  - 2021
PT  - Journal Article
`;

describe('parseNbib', () => {
  it('parses two records with full metadata', () => {
    const refs = parseNbib(SAMPLE);
    assert.equal(refs.length, 2);
    const a = refs[0];
    assert.equal(a.pmid, '12345678');
    assert.equal(a.year, 2020);
    assert.equal(a.doi, '10.1234/abc.def');
    assert.equal(a.volume, '15');
    assert.equal(a.issue, '3');
    assert.equal(a.pages, '123-30');
    assert.equal(a.containerTitle, 'Nature');
    assert.match(a.title ?? '', /Effects of sleep on memory consolidation\s+in healthy adults/);
    assert.match(a.abstract ?? '', /sleep effects on memory/);
    assert.ok(a.authors.length >= 1);
    assert.equal(a.authors[0].family, 'Smith');
  });

  it('looksLikeNbib detects the format', () => {
    assert.equal(looksLikeNbib(SAMPLE), true);
    assert.equal(looksLikeNbib('TY  - JOUR\nT1  - x\nER  -'), false);
  });

  it('detectImportFormat returns "nbib"', () => {
    assert.equal(detectImportFormat(SAMPLE), 'nbib');
  });

  it('importByAutoDetect routes nbib to parseNbib', () => {
    const out = importByAutoDetect(SAMPLE);
    assert.equal(out.format, 'nbib');
    assert.equal(out.refs.length, 2);
  });

  it('importByExtension routes .nbib to the NBIB parser (not .enw)', () => {
    const out = importByExtension('pubmed-export.nbib', SAMPLE);
    assert.equal(out.format, 'nbib');
    assert.equal(out.refs[0].pmid, '12345678');
  });
});
