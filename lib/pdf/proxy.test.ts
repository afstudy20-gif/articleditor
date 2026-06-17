import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coercePdfUrl, extractPmcid, pickCrossrefPdfUrl, sanitizePdfUrl } from './proxy';

describe('PDF proxy URL guard', () => {
  it('accepts any HTTPS academic host', () => {
    assert.ok(sanitizePdfUrl('https://link.springer.com/content/pdf/10.1186/s12933-025-02784-8.pdf'));
    assert.ok(sanitizePdfUrl('https://www.dovepress.com/article/download/113301'));
    assert.ok(sanitizePdfUrl('https://pmc.ncbi.nlm.nih.gov/articles/PMC13024359/pdf/paper.pdf'));
    assert.ok(sanitizePdfUrl('https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/foo'));
  });

  it('rejects non-HTTPS, credentialed, private, and local URLs', () => {
    assert.equal(sanitizePdfUrl('http://link.springer.com/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://user:pass@springer.com/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://localhost/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://127.0.0.1/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://10.0.0.1/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://192.168.1.1/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://172.16.0.1/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://myhost.local/paper.pdf'), null);
    assert.equal(sanitizePdfUrl('https://myhost.internal/paper.pdf'), null);
  });

  it('upgrades trusted HTTP publisher links to HTTPS', () => {
    const url = coercePdfUrl(
      'http://www.scielo.br/scielo.php?script=sci_pdf&pid=S0104-42302022000901127&tlng=en',
    );
    assert.ok(url);
    assert.equal(url?.protocol, 'https:');
    assert.equal(url?.hostname, 'www.scielo.br');
  });

  it('picks Crossref PDF links with unspecified content-type', () => {
    const url = pickCrossrefPdfUrl([
      {
        URL: 'http://www.scielo.br/scielo.php?script=sci_pdf&pid=S0104-42302022000901127&tlng=en',
        'content-type': 'unspecified',
      },
    ]);
    assert.ok(url);
    assert.equal(url?.hostname, 'www.scielo.br');
  });

  it('extracts a PMC identifier from article and PDF URLs', () => {
    const url = sanitizePdfUrl(
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC13024359/pdf/JIR-19-590762.pdf',
    );
    assert.ok(url);
    assert.equal(extractPmcid(url), 'PMC13024359');
  });
});
