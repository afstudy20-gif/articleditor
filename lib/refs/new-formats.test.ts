import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCslJson, looksLikeCslJson } from './csl-json';
import { parseCsv, looksLikeCsv } from './csv';
import { parseCff, looksLikeCff } from './cff';
import { parsePubmedXml, looksLikePubmedXml } from './pubmed-xml';
import { detectImportFormat, importByExtension } from './import-auto';

describe('CSL-JSON', () => {
  const sample = JSON.stringify([
    {
      id: 'smith2019',
      type: 'article-journal',
      title: 'Effects of sleep on memory',
      author: [
        { family: 'Smith', given: 'John A' },
        { family: 'Doe', given: 'Roberta B' },
      ],
      'container-title': 'Nature',
      issued: { 'date-parts': [[2019]] },
      volume: '15',
      issue: '3',
      page: '123-130',
      DOI: '10.1234/abc',
    },
  ]);

  it('parses Zotero-style array', () => {
    const refs = parseCslJson(sample);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].year, 2019);
    assert.equal(refs[0].doi, '10.1234/abc');
    assert.equal(refs[0].authors[0].family, 'Smith');
    assert.equal(refs[0].containerTitle, 'Nature');
  });

  it('detectImportFormat picks csl-json', () => {
    assert.equal(detectImportFormat(sample), 'csl-json');
  });

  it('looksLikeCslJson true for valid sample, false for nbib', () => {
    assert.equal(looksLikeCslJson(sample), true);
    assert.equal(looksLikeCslJson('PMID- 12345\nTI  - x\nAU  - y'), false);
  });

  it('routes .json file to csl-json parser', () => {
    const out = importByExtension('lib.json', sample);
    assert.equal(out.format, 'csl-json');
    assert.equal(out.refs.length, 1);
  });
});

describe('CSV / TSV', () => {
  const csv = `title,authors,year,journal,doi
"Effects of sleep on memory","Smith JA; Doe RB",2019,Nature,10.1234/abc
"Second paper","Lee, Charles",2020,Science,
`;

  it('parses with header aliases', () => {
    const refs = parseCsv(csv);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].title, 'Effects of sleep on memory');
    assert.equal(refs[0].year, 2019);
    assert.equal(refs[0].containerTitle, 'Nature');
    assert.equal(refs[0].authors.length, 2);
    assert.equal(refs[0].authors[0].family, 'Smith');
    assert.equal(refs[1].authors[0].family, 'Lee');
  });

  it('looksLikeCsv true on header with title', () => {
    assert.equal(looksLikeCsv(csv), true);
    assert.equal(looksLikeCsv('foo,bar\n1,2'), false);
  });

  it('detectImportFormat picks csv', () => {
    assert.equal(detectImportFormat(csv), 'csv');
  });

  it('handles TSV', () => {
    const tsv = 'title\tyear\tdoi\nA paper\t2021\t10.5/x';
    const refs = parseCsv(tsv);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].year, 2021);
  });
});

describe('CFF', () => {
  const cff = `cff-version: 1.2.0
title: My Software
authors:
  - family-names: Smith
    given-names: John
  - family-names: Doe
    given-names: Jane
year: 2023
doi: 10.5281/zenodo.1234
`;

  it('parses top-level project', () => {
    const refs = parseCff(cff);
    assert.ok(refs.length >= 1);
    const top = refs[0];
    assert.equal(top.title, 'My Software');
    assert.equal(top.year, 2023);
    assert.equal(top.doi, '10.5281/zenodo.1234');
    assert.equal(top.authors.length, 2);
    assert.equal(top.authors[0].family, 'Smith');
  });

  it('looksLikeCff sees cff-version', () => {
    assert.equal(looksLikeCff(cff), true);
    assert.equal(looksLikeCff('title: just yaml'), false);
  });

  it('detectImportFormat picks cff', () => {
    assert.equal(detectImportFormat(cff), 'cff');
  });
});

describe('PubMed XML', () => {
  const xml = `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article>
        <ArticleTitle>Effects of sleep on memory.</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Sleep is important.</AbstractText>
          <AbstractText Label="RESULTS">Memory improved.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author><LastName>Smith</LastName><ForeName>John A</ForeName></Author>
          <Author><LastName>Doe</LastName><ForeName>Roberta B</ForeName></Author>
        </AuthorList>
        <Journal>
          <Title>Nature</Title>
          <JournalIssue>
            <Volume>15</Volume>
            <Issue>3</Issue>
            <PubDate><Year>2019</Year></PubDate>
          </JournalIssue>
        </Journal>
        <Pagination><MedlinePgn>123-30</MedlinePgn></Pagination>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">12345678</ArticleId>
        <ArticleId IdType="doi">10.1234/abc.def</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>
`;

  it('parses one PubmedArticle', () => {
    const refs = parsePubmedXml(xml);
    assert.equal(refs.length, 1);
    const r = refs[0];
    assert.equal(r.pmid, '12345678');
    assert.equal(r.doi, '10.1234/abc.def');
    assert.equal(r.year, 2019);
    assert.equal(r.volume, '15');
    assert.equal(r.issue, '3');
    assert.equal(r.pages, '123-30');
    assert.equal(r.containerTitle, 'Nature');
    assert.equal(r.authors[0].family, 'Smith');
    assert.match(r.abstract ?? '', /BACKGROUND: Sleep is important/);
    assert.match(r.abstract ?? '', /RESULTS: Memory improved/);
  });

  it('looksLikePubmedXml true / false', () => {
    assert.equal(looksLikePubmedXml(xml), true);
    assert.equal(looksLikePubmedXml('<records><record/></records>'), false);
  });

  it('detectImportFormat picks pubmed-xml', () => {
    assert.equal(detectImportFormat(xml), 'pubmed-xml');
  });

  it('routes .xml file to pubmed parser when content matches', () => {
    const out = importByExtension('export.xml', xml);
    assert.equal(out.format, 'pubmed-xml');
    assert.equal(out.refs.length, 1);
  });
});
