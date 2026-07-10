import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { articleTitleFromFilename, buildPdfMarkdown } from './pdf-to-markdown';

describe('articleTitleFromFilename', () => {
  it('strips the extension and collapses separators to spaces', () => {
    assert.equal(articleTitleFromFilename('smith-2021_final.pdf'), 'smith 2021 final');
    assert.equal(articleTitleFromFilename('A.Study.Of.Things.pdf'), 'A Study Of Things');
  });

  it('handles names without separators or extensions', () => {
    assert.equal(articleTitleFromFilename('article'), 'article');
  });
});

describe('buildPdfMarkdown', () => {
  it('produces a heading, source note, page count, and joined page text', () => {
    const md = buildPdfMarkdown('smith-2021.pdf', [
      { pageNo: 1, text: 'Page one text.' },
      { pageNo: 2, text: 'Page two text.' },
    ]);
    assert.match(md, /^# smith 2021/);
    assert.match(md, /Source PDF: smith-2021\.pdf/);
    assert.match(md, /Extracted pages: 2\/2/);
    assert.match(md, /Page one text\.\n\nPage two text\./);
  });

  it('counts only non-empty pages toward "Extracted pages"', () => {
    const md = buildPdfMarkdown('scan.pdf', [
      { pageNo: 1, text: '' },
      { pageNo: 2, text: 'Some text.' },
      { pageNo: 3, text: '   ' },
    ]);
    assert.match(md, /Extracted pages: 1\/3/);
  });

  it('handles a document with zero pages', () => {
    const md = buildPdfMarkdown('empty.pdf', []);
    assert.match(md, /Extracted pages: 0\/0/);
  });
});
