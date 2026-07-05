import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRis, refsToRis } from './ris';
import type { Ref } from '@/store/types';

describe('parseRis', () => {
  const single = `TY  - JOUR
AU  - Smith, John A
AU  - Doe, Roberta B
TI  - Effects of sleep on memory
JO  - Nature
PY  - 2019
VL  - 15
IS  - 3
SP  - 123
EP  - 130
DO  - 10.1234/abc
ER  -
`;

  it('parses core tags of a single record', () => {
    const refs = parseRis(single);
    assert.equal(refs.length, 1);
    const r = refs[0];
    assert.equal(r.type, 'journal-article');
    assert.equal(r.title, 'Effects of sleep on memory');
    assert.equal(r.containerTitle, 'Nature');
    assert.equal(r.year, 2019);
    assert.equal(r.volume, '15');
    assert.equal(r.issue, '3');
    assert.equal(r.pages, '123-130');
    assert.equal(r.doi, '10.1234/abc');
  });

  it('parses multiple authors as family/given pairs', () => {
    const r = parseRis(single)[0];
    assert.equal(r.authors.length, 2);
    assert.deepEqual(r.authors[0], { family: 'Smith', given: 'John A' });
    assert.deepEqual(r.authors[1], { family: 'Doe', given: 'Roberta B' });
  });

  it('parses a multi-record file and maps TY per record', () => {
    const multi = `TY  - JOUR
TI  - First paper
PY  - 2020
ER  -
TY  - BOOK
TI  - Second book
PB  - Springer
PY  - 2021
ER  -
TY  - THES
TI  - Third thesis
PY  - 2022
ER  -
`;
    const refs = parseRis(multi);
    assert.equal(refs.length, 3);
    assert.equal(refs[0].type, 'journal-article');
    assert.equal(refs[0].title, 'First paper');
    assert.equal(refs[1].type, 'book');
    assert.equal(refs[1].publisher, 'Springer');
    assert.equal(refs[2].type, 'thesis');
    assert.equal(refs[2].year, 2022);
  });

  it('still parses the last record when the ER terminator is missing', () => {
    const noEr = `TY  - JOUR
TI  - Complete record
PY  - 2020
ER  -
TY  - JOUR
TI  - Truncated record
PY  - 2021`;
    const refs = parseRis(noEr);
    assert.equal(refs.length, 2);
    assert.equal(refs[1].title, 'Truncated record');
    assert.equal(refs[1].year, 2021);
  });

  it('handles CRLF line endings', () => {
    const crlf = single.replace(/\n/g, '\r\n');
    const refs = parseRis(crlf);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'Effects of sleep on memory');
    assert.equal(refs[0].pages, '123-130');
    assert.equal(refs[0].authors.length, 2);
  });

  it('uses SP alone as pages when EP is absent', () => {
    const refs = parseRis(`TY  - JOUR\nTI  - T\nSP  - e0123\nER  - \n`);
    assert.equal(refs[0].pages, 'e0123');
  });

  it('accepts author without a comma as a literal name', () => {
    const refs = parseRis(`TY  - JOUR\nAU  - GBD Collaborators\nTI  - T\nER  - \n`);
    assert.deepEqual(refs[0].authors[0], { literal: 'GBD Collaborators' });
  });

  it('maps unknown TY value to type other', () => {
    const refs = parseRis(`TY  - PAT\nTI  - Some patent\nER  - \n`);
    assert.equal(refs[0].type, 'other');
  });

  it('round-trips a ref through refsToRis and parseRis', () => {
    const ref: Ref = {
      id: 'x',
      type: 'journal-article',
      authors: [{ family: 'Smith', given: 'John' }],
      title: 'Round trip',
      containerTitle: 'Journal',
      year: 2020,
      volume: '2',
      issue: '4',
      pages: '10-20',
      doi: '10.9/z',
    };
    const back = parseRis(refsToRis([ref]));
    assert.equal(back.length, 1);
    assert.equal(back[0].title, 'Round trip');
    assert.equal(back[0].containerTitle, 'Journal');
    assert.equal(back[0].pages, '10-20');
    assert.equal(back[0].doi, '10.9/z');
    assert.deepEqual(back[0].authors[0], { family: 'Smith', given: 'John' });
  });
});
