import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  buildBibliographyHtml,
  buildPrintDocumentHtml,
  printStylesheet,
} from './print-html';
import type { Ref } from '@/store/types';

function ref(id: string, family: string, year: number): Ref {
  return {
    id,
    type: 'journal-article',
    authors: [{ family, given: 'A.' }],
    year,
    title: `Title ${family}`,
    containerTitle: 'J Test',
  };
}

describe('escapeHtml', () => {
  it('escapes the five sensitive characters', () => {
    assert.equal(escapeHtml(`<a href="x">A & B's</a>`), '&lt;a href=&quot;x&quot;&gt;A &amp; B&#39;s&lt;/a&gt;');
  });
});

describe('buildBibliographyHtml', () => {
  it('returns empty string when there are no references', () => {
    assert.equal(buildBibliographyHtml([], 'vancouver', 'References'), '');
  });

  it('renders numeric-style entries as hanging paragraphs without double numbering', () => {
    const html = buildBibliographyHtml([ref('a', 'Alpha', 2020), ref('b', 'Beta', 2021)], 'vancouver', 'References');
    assert.ok(html.includes('<h2>References</h2>'));
    assert.ok(html.includes('class="enr-print-ref"'));
    // Vancouver bakes its own "1." marker; we must not wrap in an <ol>.
    assert.ok(!html.includes('<ol'));
    assert.ok(html.includes('1.'));
    assert.ok(html.includes('Alpha') && html.includes('Beta'));
  });

  it('escapes a heading containing markup', () => {
    const html = buildBibliographyHtml([ref('a', 'Alpha', 2020)], 'apa', 'Refs <b>');
    assert.ok(html.includes('Refs &lt;b&gt;'));
  });
});

describe('buildPrintDocumentHtml', () => {
  const base = {
    title: 'My Paper',
    bodyHtml: '<p>Hello <span class="enr-citation">[1]</span></p>',
    orderedRefs: [ref('a', 'Alpha', 2020)],
    style: 'vancouver' as const,
    lang: 'en' as const,
  };

  it('wraps title, body and bibliography', () => {
    const html = buildPrintDocumentHtml(base);
    assert.ok(html.includes('<h1 class="enr-print-title">My Paper</h1>'));
    assert.ok(html.includes('<div class="enr-print-body"><p>Hello'));
    assert.ok(html.includes('enr-print-bib'));
    assert.ok(html.indexOf('enr-print-body') < html.indexOf('enr-print-bib'), 'body precedes bibliography');
  });

  it('omits the title heading when the title is blank', () => {
    const html = buildPrintDocumentHtml({ ...base, title: '   ' });
    assert.ok(!html.includes('enr-print-title'));
  });

  it('falls back to a localized bibliography heading', () => {
    assert.ok(buildPrintDocumentHtml({ ...base, lang: 'tr' }).includes('Kaynaklar'));
    assert.ok(buildPrintDocumentHtml(base).includes('References'));
  });

  it('adds the double-spacing modifier only when requested', () => {
    assert.ok(buildPrintDocumentHtml({ ...base, doubleSpaced: true }).includes('enr-print-double'));
    assert.ok(!buildPrintDocumentHtml(base).includes('enr-print-double'));
  });

  it('renders keywords inside the abstract block', () => {
    const html = buildPrintDocumentHtml({
      ...base,
      abstractText: 'Platelet activation was associated with no-reflow.',
      keywords: ['Blood Platelets', 'Myocardial Infarction'],
    });

    assert.ok(html.includes('<section class="enr-print-abstract">'));
    assert.ok(html.includes('Platelet activation was associated with no-reflow.'));
    assert.ok(html.includes('<strong>Keywords:</strong> Blood Platelets; Myocardial Infarction'));
  });
});

describe('printStylesheet', () => {
  it('hides app chrome in print and numbers tables', () => {
    const css = printStylesheet();
    assert.ok(css.includes('@media print'));
    assert.ok(css.includes('body > *:not(.enr-print-host)'));
    assert.ok(css.includes('counter(enr-print-tbl)'));
  });
});
