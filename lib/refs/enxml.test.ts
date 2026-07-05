import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import {
  buildEnCiteXml,
  buildEnCiteXmlMulti,
  escapeXml,
  formatVancouverDisplay,
} from './enxml';

// enxml.ts generates EndNote ADDIN EN.CITE payloads (it is not an importer).

const smith: Ref = {
  id: 'smith',
  type: 'journal-article',
  authors: [
    { family: 'Smith', given: 'John A' },
    { family: 'Doe', given: 'Roberta B' },
  ],
  title: 'Sleep & memory <effects>',
  containerTitle: 'Nature',
  year: 2019,
  volume: '15',
  issue: '3',
  pages: '123-130',
  doi: '10.1234/abc',
  url: 'https://example.com?a=1&b=2',
  enRecNum: 42,
};

describe('buildEnCiteXml', () => {
  it('emits a Cite block with record fields and escaped text', () => {
    const xml = buildEnCiteXml([smith], '[1]');
    assert.ok(xml.startsWith('<EndNote><Cite>'));
    assert.ok(xml.endsWith('</EndNote>'));
    assert.ok(xml.includes('<Author>Smith</Author>'));
    assert.ok(xml.includes('<Year>2019</Year>'));
    assert.ok(xml.includes('<RecNum>42</RecNum>'));
    assert.ok(xml.includes('<rec-number>42</rec-number>'));
    assert.ok(xml.includes('<author>Smith, John A</author>'));
    assert.ok(xml.includes('<author>Doe, Roberta B</author>'));
    // Title with & and <> must be escaped.
    assert.ok(xml.includes('<title>Sleep &amp; memory &lt;effects&gt;</title>'));
    assert.ok(xml.includes('<secondary-title>Nature</secondary-title>'));
    assert.ok(xml.includes('<full-title>Nature</full-title>'));
    assert.ok(xml.includes('<pages>123-130</pages>'));
    assert.ok(xml.includes('<volume>15</volume>'));
    assert.ok(xml.includes('<number>3</number>'));
    assert.ok(xml.includes('<electronic-resource-num>10.1234/abc</electronic-resource-num>'));
    assert.ok(xml.includes('<url>https://example.com?a=1&amp;b=2</url>'));
    assert.ok(xml.includes('<DisplayText>[1]</DisplayText>'));
    // No raw unescaped ampersands should remain.
    assert.equal(/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), false);
  });

  it('falls back to Anonymous author and zero rec number', () => {
    const bare: Ref = { id: 'b', type: 'journal-article', authors: [] };
    const xml = buildEnCiteXml([bare], 'x');
    assert.ok(xml.includes('<Author>Anonymous</Author>'));
    assert.ok(xml.includes('<RecNum>0</RecNum>'));
    // No Year element when year is missing.
    assert.equal(xml.includes('<Year>'), false);
  });
});

describe('buildEnCiteXmlMulti', () => {
  it('emits one Cite element per ref', () => {
    const other: Ref = { ...smith, id: 'o', enRecNum: 7, authors: [{ family: 'Lee' }] };
    const xml = buildEnCiteXmlMulti([smith, other], '[1, 2]');
    const cites = xml.match(/<Cite>/g) ?? [];
    assert.equal(cites.length, 2);
    assert.ok(xml.includes('<RecNum>42</RecNum>'));
    assert.ok(xml.includes('<RecNum>7</RecNum>'));
    assert.ok(xml.includes('<DisplayText>[1, 2]</DisplayText>'));
  });
});

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    assert.equal(escapeXml(`<a & "b" 'c'>`), '&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;');
  });

  it('leaves plain text unchanged', () => {
    assert.equal(escapeXml('plain text 123'), 'plain text 123');
  });
});

describe('formatVancouverDisplay', () => {
  it('formats single, pair, range and mixed groups', () => {
    assert.equal(formatVancouverDisplay([1]), '[1]');
    assert.equal(formatVancouverDisplay([2, 1]), '[1-2]');
    assert.equal(formatVancouverDisplay([1, 2, 3]), '[1-3]');
    assert.equal(formatVancouverDisplay([1, 3]), '[1,3]');
    assert.equal(formatVancouverDisplay([5, 1, 2, 3, 9]), '[1-3,5,9]');
  });

  it('returns empty string for no numbers', () => {
    assert.equal(formatVancouverDisplay([]), '');
  });
});
