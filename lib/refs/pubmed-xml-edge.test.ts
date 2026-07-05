import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePubmedXml, looksLikePubmedXml } from './pubmed-xml';

// Edge cases beyond the happy path already covered in new-formats.test.ts.

function article(inner: string, pubmedData = ''): string {
  return `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>${inner}</MedlineCitation>
    ${pubmedData}
  </PubmedArticle>
</PubmedArticleSet>`;
}

describe('parsePubmedXml edge cases', () => {
  it('parses a full article with authors, journal, year, doi and pmid', () => {
    const xml = article(
      `<PMID>987654</PMID>
       <Article>
         <ArticleTitle>Sample title.</ArticleTitle>
         <AuthorList>
           <Author><LastName>Smith</LastName><ForeName>John</ForeName></Author>
           <Author><LastName>Doe</LastName><Initials>RB</Initials></Author>
         </AuthorList>
         <Journal>
           <Title>The Lancet</Title>
           <JournalIssue><Volume>399</Volume><Issue>10</Issue><PubDate><Year>2022</Year></PubDate></JournalIssue>
         </Journal>
         <Pagination><MedlinePgn>1-9</MedlinePgn></Pagination>
       </Article>`,
      `<PubmedData><ArticleIdList>
         <ArticleId IdType="pubmed">987654</ArticleId>
         <ArticleId IdType="doi">10.1016/j.lancet.2022.01.001</ArticleId>
       </ArticleIdList></PubmedData>`,
    );
    const refs = parsePubmedXml(xml);
    assert.equal(refs.length, 1);
    const r = refs[0];
    assert.equal(r.title, 'Sample title');
    assert.equal(r.containerTitle, 'The Lancet');
    assert.equal(r.year, 2022);
    assert.equal(r.volume, '399');
    assert.equal(r.issue, '10');
    assert.equal(r.pages, '1-9');
    assert.equal(r.pmid, '987654');
    assert.equal(r.doi, '10.1016/j.lancet.2022.01.001');
    assert.equal(r.authors.length, 2);
    assert.deepEqual(r.authors[0], { family: 'Smith', given: 'John' });
    assert.deepEqual(r.authors[1], { family: 'Doe', given: 'RB' });
  });

  it('keeps CollectiveName authors as literal entries', () => {
    const xml = article(
      `<PMID>111</PMID>
       <Article>
         <ArticleTitle>Consortium paper</ArticleTitle>
         <AuthorList><Author><CollectiveName>GBD 2019 Collaborators</CollectiveName></Author></AuthorList>
       </Article>`,
    );
    const refs = parsePubmedXml(xml);
    assert.deepEqual(refs[0].authors, [{ literal: 'GBD 2019 Collaborators' }]);
  });

  it('extracts the year from a MedlineDate range', () => {
    const xml = article(
      `<PMID>222</PMID>
       <Article>
         <ArticleTitle>Old paper</ArticleTitle>
         <Journal><JournalIssue><PubDate><MedlineDate>1998 Nov-Dec</MedlineDate></PubDate></JournalIssue></Journal>
       </Article>`,
    );
    assert.equal(parsePubmedXml(xml)[0].year, 1998);
  });

  it('falls back to ELocationID for the doi', () => {
    const xml = article(
      `<PMID>333</PMID>
       <Article>
         <ArticleTitle>Eloc paper</ArticleTitle>
         <ELocationID EIdType="doi">10.7/eloc</ELocationID>
       </Article>`,
    );
    assert.equal(parsePubmedXml(xml)[0].doi, '10.7/eloc');
  });

  it('skips records without title and pmid', () => {
    const xml = article(`<Article><Journal><Title>J</Title></Journal></Article>`);
    assert.deepEqual(parsePubmedXml(xml), []);
  });

  it('returns [] for malformed or non-XML input without throwing', () => {
    assert.doesNotThrow(() => parsePubmedXml('<<<not xml'));
    assert.ok(Array.isArray(parsePubmedXml('<<<not xml')));
    assert.deepEqual(parsePubmedXml(''), []);
    assert.deepEqual(parsePubmedXml('<html><body>nope</body></html>'), []);
  });

  it('looksLikePubmedXml sniffs only PubMed roots', () => {
    assert.equal(looksLikePubmedXml('<PubmedArticleSet><PubmedArticle/></PubmedArticleSet>'), true);
    assert.equal(looksLikePubmedXml('<PubmedArticle><MedlineCitation/></PubmedArticle>'), true);
    assert.equal(looksLikePubmedXml('<EndNote><records/></EndNote>'), false);
    assert.equal(looksLikePubmedXml(''), false);
  });
});
