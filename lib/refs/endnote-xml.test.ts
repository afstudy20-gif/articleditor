import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEndnoteXml } from './endnote-xml';

const twoRecords = `<?xml version="1.0" encoding="UTF-8"?>
<xml>
  <records>
    <record>
      <rec-number>42</rec-number>
      <ref-type name="Journal Article">17</ref-type>
      <contributors>
        <authors>
          <author><style face="normal" size="100%">Smith, John A</style></author>
          <author><style face="normal" size="100%">Doe, Roberta B</style></author>
        </authors>
      </contributors>
      <titles>
        <title><style face="normal">Effects of sleep on memory</style></title>
        <secondary-title><style face="normal">Nature</style></secondary-title>
      </titles>
      <periodical>
        <full-title><style face="normal">Nature</style></full-title>
      </periodical>
      <volume><style face="normal">15</style></volume>
      <number><style face="normal">3</style></number>
      <pages><style face="normal">123-130</style></pages>
      <dates><year><style face="normal">2019</style></year></dates>
      <electronic-resource-num><style face="normal">10.1234/abc</style></electronic-resource-num>
      <accession-num><style face="normal">12345678</style></accession-num>
      <urls><related-urls><url><style face="normal">https://example.com/a</style></url></related-urls></urls>
    </record>
    <record>
      <ref-type name="Book">6</ref-type>
      <contributors><authors><author>Jones, Kim</author></authors></contributors>
      <titles><title>A Book Title</title></titles>
      <dates><year>2021</year></dates>
      <publisher>Academic Press</publisher>
    </record>
  </records>
</xml>
`;

describe('parseEndnoteXml', () => {
  it('parses two records with styled text nodes', () => {
    const refs = parseEndnoteXml(twoRecords);
    assert.equal(refs.length, 2);
    const r = refs[0];
    assert.equal(r.type, 'journal-article');
    assert.equal(r.title, 'Effects of sleep on memory');
    assert.equal(r.containerTitle, 'Nature');
    assert.equal(r.year, 2019);
    assert.equal(r.volume, '15');
    assert.equal(r.issue, '3');
    assert.equal(r.pages, '123-130');
    assert.equal(r.doi, '10.1234/abc');
    assert.equal(r.pmid, '12345678');
    assert.equal(r.url, 'https://example.com/a');
    assert.equal(r.authors.length, 2);
    assert.deepEqual(r.authors[0], { family: 'Smith', given: 'John A' });
  });

  it('maps ref-type names to internal types', () => {
    const refs = parseEndnoteXml(twoRecords);
    assert.equal(refs[1].type, 'book');
    assert.equal(refs[1].publisher, 'Academic Press');
    assert.equal(refs[1].year, 2021);
  });

  it('tolerates records with missing fields', () => {
    const xml = `<records><record><titles><title>Only a title</title></titles></record></records>`;
    const refs = parseEndnoteXml(xml);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'Only a title');
    assert.equal(refs[0].type, 'journal-article');
    assert.deepEqual(refs[0].authors, []);
    assert.equal(refs[0].year, undefined);
    assert.equal(refs[0].doi, undefined);
  });

  it('handles a single record (non-array) root', () => {
    const xml = `<?xml version="1.0"?><xml><records><record><titles><title>Solo</title></titles><dates><year>2020</year></dates></record></records></xml>`;
    const refs = parseEndnoteXml(xml);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].title, 'Solo');
    assert.equal(refs[0].year, 2020);
  });

  it('does not throw on malformed XML and returns an array', () => {
    assert.doesNotThrow(() => parseEndnoteXml('<records><record><titles><title>Broken'));
    assert.doesNotThrow(() => parseEndnoteXml('not xml at all'));
    assert.ok(Array.isArray(parseEndnoteXml('not xml at all')));
    assert.deepEqual(parseEndnoteXml(''), []);
  });

  it('drops a non-numeric accession number instead of using it as pmid', () => {
    const xml = `<records><record><titles><title>T</title></titles><accession-num>WOS:000123</accession-num></record></records>`;
    assert.equal(parseEndnoteXml(xml)[0].pmid, undefined);
  });

  it('cleans doi.org prefixes in electronic-resource-num', () => {
    const xml = `<records><record><titles><title>T</title></titles><electronic-resource-num>https://dx.doi.org/10.5/xyz</electronic-resource-num></record></records>`;
    assert.equal(parseEndnoteXml(xml)[0].doi, '10.5/xyz');
  });
});
