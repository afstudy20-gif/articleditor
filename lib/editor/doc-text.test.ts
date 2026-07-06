import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { docToText } from './doc-text';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Outcomes improved ' },
        { type: 'citation', attrs: { refIds: ['r1'] } },
        { type: 'text', text: ' significantly.' },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Methods' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'We enrolled 120 patients.' }] },
  ],
};

describe('docToText', () => {
  it('extracts prose with citations collapsed to a stable marker', () => {
    const text = docToText(doc);
    assert.equal(text, 'Outcomes improved [cite] significantly.\nMethods\nWe enrolled 120 patients.');
  });

  it('keeps plain numbers intact', () => {
    assert.ok(docToText(doc).includes('120 patients'));
  });

  it('handles empty and malformed input', () => {
    assert.equal(docToText({ type: 'doc', content: [] }), '');
    assert.equal(docToText(null), '');
    assert.equal(docToText(undefined), '');
    assert.equal(docToText('nonsense'), '');
  });

  it('collapses runs of 3+ newlines to a blank line', () => {
    const many = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
      ],
    };
    assert.ok(!docToText(many).includes('\n\n\n'));
  });
});
