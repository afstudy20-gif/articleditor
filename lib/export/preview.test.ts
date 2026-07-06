import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import { buildExportPreviewSrcdoc } from './preview';

const ref: Ref = {
  id: 'r1',
  type: 'journal-article',
  authors: [{ family: 'Smith', given: 'J.' }],
  year: 2020,
  title: 'A study',
  containerTitle: 'J Test',
};

const base = {
  title: 'Preview Paper',
  bodyHtml: '<p>Body with <strong>bold</strong>.</p>',
  orderedRefs: [ref],
  style: 'vancouver' as const,
  lang: 'en' as const,
  abstractText: 'Abstract body.',
  keywords: ['one', 'two'],
};

describe('buildExportPreviewSrcdoc', () => {
  it('produces a full standalone document with title, body and bibliography', () => {
    const html = buildExportPreviewSrcdoc(base);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('Preview Paper'));
    assert.ok(html.includes('Body with <strong>bold</strong>.'));
    assert.ok(html.includes('enr-print-bib'));
    assert.ok(html.includes('Smith'));
    assert.ok(html.includes('enr-preview-sheet'));
  });

  it('standard theme has no MDPI styling or article type', () => {
    const html = buildExportPreviewSrcdoc({ ...base, theme: 'standard', articleType: 'Article' });
    assert.ok(!html.includes('Palatino'));
    assert.ok(!html.includes('enr-preview-articletype'));
  });

  it('mdpi theme adds Palatino layout and the article-type line', () => {
    const html = buildExportPreviewSrcdoc({ ...base, theme: 'mdpi', articleType: 'Article' });
    assert.ok(html.includes('Palatino'));
    assert.ok(html.includes('<p class="enr-preview-articletype">Article</p>'));
  });

  it('escapes the article type', () => {
    const html = buildExportPreviewSrcdoc({ ...base, theme: 'mdpi', articleType: '<Review>' });
    assert.ok(html.includes('&lt;Review&gt;'));
    assert.ok(!html.includes('<p class="enr-preview-articletype"><Review>'));
  });
});
