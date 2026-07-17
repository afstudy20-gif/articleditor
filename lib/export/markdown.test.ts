import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import { buildMarkdown } from './markdown';

function makeRef(id: string, over: Partial<Ref> = {}): Ref {
  return {
    id,
    type: 'journal-article',
    title: `Title ${id}`,
    authors: [{ family: 'Smith', given: 'J' }],
    year: 2021,
    containerTitle: 'J Test',
    ...over,
  } as Ref;
}

function build(doc: any, over: Record<string, unknown> = {}) {
  const r1 = makeRef('r1');
  const r2 = makeRef('r2', { authors: [{ family: 'Doe', given: 'A' }], year: 2020 });
  const refsById = new Map([[r1.id, r1], [r2.id, r2]]);
  const refOrder = new Map([['r1', 1], ['r2', 2]]);
  return buildMarkdown({
    doc,
    refsById,
    refOrder,
    style: 'vancouver',
    title: 'My Article',
    ...over,
  });
}

test('renders title, headings, citation numbers and bibliography', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Known fact ' },
          { type: 'citation', attrs: { refIds: ['r1'] } },
          { type: 'text', text: '.' },
        ],
      },
    ],
  };
  const { markdown, warnings } = build(doc);
  assert.match(markdown, /^# My Article/);
  assert.match(markdown, /## Introduction/);
  assert.match(markdown, /Known fact \\\[1\\\]\./);
  assert.match(markdown, /## References/);
  assert.match(markdown, /1\. Smith J\./);
  assert.equal(warnings.length, 0);
});

test('renders abstract, keywords, marks and equations', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'sub', marks: [{ type: 'subscript' }] },
        ],
      },
      { type: 'equation', attrs: { latex: 'E=mc^2' } },
    ],
  };
  const { markdown } = build(doc, { abstractText: 'Short abstract.', keywords: ['one', 'two'] });
  assert.match(markdown, /## Abstract\n\nShort abstract\.\n\n\*\*Keywords:\*\* one; two/);
  assert.match(markdown, /\*\*bold\*\* and <sub>sub<\/sub>/);
  assert.match(markdown, /\$\$\nE=mc\^2\n\$\$/);
});

test('renders pipe tables with header, title, footnote and span warning', () => {
  const cell = (text: string, type = 'tableCell', attrs: any = {}) => ({
    type,
    attrs,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'table',
        attrs: { title: 'Demographics', footnote: 'n = 10' },
        content: [
          { type: 'tableRow', content: [cell('Age', 'tableHeader'), cell('Sex', 'tableHeader')] },
          { type: 'tableRow', content: [cell('42'), cell('F', 'tableCell', { colspan: 2 })] },
        ],
      },
    ],
  };
  const { markdown, warnings } = build(doc);
  assert.match(markdown, /\*\*Demographics\*\*/);
  assert.match(markdown, /\| \*\*Age\*\* \| \*\*Sex\*\* \|\n\| --- \| --- \|\n\| 42 \| F \|/);
  assert.match(markdown, /\*n = 10\*/);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /merged cells/);
});

test('renders figures with numbering, cross-references and data-URI embed', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'figure',
        attrs: {
          kind: 'figure',
          figId: 'f1',
          caption: 'Figure 1. Flow diagram',
          src: 'data:image/png;base64,AAAA',
        },
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'See ' },
          { type: 'figureRef', attrs: { figId: 'f1' } },
          { type: 'text', text: '.' },
        ],
      },
    ],
  };
  const { markdown, warnings } = build(doc);
  assert.match(markdown, /!\[.*\]\(data:image\/png;base64,AAAA\)/);
  assert.match(markdown, /\*\*Figure 1\.\*\* Flow diagram/);
  assert.match(markdown, /See Figure 1\./);
  assert.equal(warnings.length, 0);
});

test('lists, code blocks, blockquote, unknown citation warning', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
        ],
      },
      {
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        ],
      },
      { type: 'codeBlock', content: [{ type: 'text', text: 'x <- 1' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }] },
      { type: 'paragraph', content: [{ type: 'citation', attrs: { refIds: ['missing'] } }] },
    ],
  };
  const { markdown, warnings } = build(doc);
  assert.match(markdown, /- first\n- second/);
  assert.match(markdown, /1\. one/);
  assert.match(markdown, /```\nx <- 1\n```/);
  assert.match(markdown, /> quoted/);
  assert.match(markdown, /\*\*\[\?\]\*\*/);
  assert.equal(warnings.length, 1);
});

test('superscript citation styles wrap numbers in <sup>', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'citation', attrs: { refIds: ['r1'] } }] },
    ],
  };
  const { markdown } = build(doc, { style: 'sage-vancouver' });
  assert.match(markdown, /<sup>.*1.*<\/sup>/);
});

test('escapes markdown-significant characters in prose', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'a*b_c[d]e' }] },
    ],
  };
  const { markdown } = build(doc, { title: 'T#1 *star*' });
  assert.match(markdown, /a\\\*b\\_c\\\[d\\\]e/);
  assert.match(markdown, /# T#1 \\\*star\\\*/);
});
