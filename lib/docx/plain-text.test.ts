import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRichDocx } from './build-rich';
import { parseDocx } from './parse';
import { docxFilename, plainTextToTiptapDoc } from './plain-text';

describe('plainTextToTiptapDoc', () => {
  it('preserves single line breaks and separates blank-line paragraphs', () => {
    assert.deepEqual(plainTextToTiptapDoc('First line\nSecond line\n\nNext paragraph'), {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'First line' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Second line' },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Next paragraph' }],
        },
      ],
    });
  });

  it('creates a valid empty document', () => {
    assert.deepEqual(plainTextToTiptapDoc(''), {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });

  it('produces Word content that survives a DOCX round trip', async () => {
    const blob = await buildRichDocx({
      doc: plainTextToTiptapDoc('Title line\nAuthor line\n\nConflict of Interest:\nNone declared.'),
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'Title Page',
      includeDocumentTitle: false,
      includeBibliography: false,
    });

    const parsed = await parseDocx(await blob.arrayBuffer());

    assert.deepEqual(parsed.paragraphs.map((paragraph) => paragraph.text), [
      'Title line\nAuthor line',
      'Conflict of Interest:\nNone declared.',
    ]);
  });
});

describe('docxFilename', () => {
  it('removes unsafe filename characters', () => {
    assert.equal(docxFilename('Title Page: Study / 2026'), 'Title_Page_Study_2026.docx');
  });

  it('uses a fallback for an empty title', () => {
    assert.equal(docxFilename('  '), 'document.docx');
  });
});
