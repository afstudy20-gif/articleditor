import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnw } from './enw';

describe('parseEnw', () => {
  const single = `%0 Journal Article
%A Smith, John A
%A Doe, Roberta B
%T Effects of sleep on memory
%J Nature
%D 2019
%V 15
%N 3
%P 123-130
%R 10.1234/abc
`;

  it('parses core tags of a single record', () => {
    const refs = parseEnw(single);
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

  it('parses multiple %A authors as family/given pairs', () => {
    const r = parseEnw(single)[0];
    assert.equal(r.authors.length, 2);
    assert.deepEqual(r.authors[0], { family: 'Smith', given: 'John A' });
    assert.deepEqual(r.authors[1], { family: 'Doe', given: 'Roberta B' });
  });

  it('parses multiple records separated by blank lines', () => {
    const multi = `%0 Journal Article
%A Smith, J
%T First
%D 2020

%0 Book
%A Jones, K
%T Second
%I Academic Press
%D 2021
`;
    const refs = parseEnw(multi);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].title, 'First');
    assert.equal(refs[0].type, 'journal-article');
    assert.equal(refs[1].title, 'Second');
    assert.equal(refs[1].type, 'book');
    assert.equal(refs[1].publisher, 'Academic Press');
  });

  it('handles CRLF line endings', () => {
    const refs = parseEnw(single.replace(/\n/g, '\r\n'));
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'Effects of sleep on memory');
  });

  it('strips a doi.org prefix from %R', () => {
    const refs = parseEnw(`%0 Journal Article\n%T T\n%R https://doi.org/10.5/xyz\n%D 2020\n`);
    assert.equal(refs[0].doi, '10.5/xyz');
  });

  it('joins wrapped continuation lines into one field value', () => {
    const refs = parseEnw(`%0 Journal Article\n%T A very long title\nthat wraps onto a second line\n%D 2020\n`);
    assert.equal(refs[0].title, 'A very long title that wraps onto a second line');
  });

  it('maps an unknown %0 type to journal-article default', () => {
    const refs = parseEnw(`%0 Ancient Text\n%T T\n%D 2020\n`);
    assert.equal(refs[0].type, 'journal-article');
  });

  it('keeps %M as pmid only when numeric', () => {
    const refs = parseEnw(`%0 Journal Article\n%T T\n%M 123456\n%D 2020\n`);
    assert.equal(refs[0].pmid, '123456');
    const bad = parseEnw(`%0 Journal Article\n%T T\n%M not-a-pmid\n%D 2020\n`);
    assert.equal(bad[0].pmid, undefined);
  });

  it('returns [] for blocks that are not tagged records', () => {
    assert.deepEqual(parseEnw('just some plain text\n\nno tags here'), []);
    assert.deepEqual(parseEnw(''), []);
  });
});
