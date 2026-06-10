import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDocStructure } from './doc-structure';

test('extractDocStructure - basic heading extraction', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This is body text.' }] }
    ]
  };

  const result = extractDocStructure(doc);
  assert.deepEqual(result.headings, ['Introduction']);
  assert.equal(result.plainText.includes('This is body text.'), true);
});

test('extractDocStructure - paragraph heading heuristic detection', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Abstract' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This is the abstract paragraph.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Keywords:' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'lipid paradox; mortality' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '1. Introduction' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This is paragraph text under introduction.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A. Methods' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '2.1. Results' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'References' }] }
    ]
  };

  const result = extractDocStructure(doc);
  assert.deepEqual(result.headings, [
    'Abstract',
    'Keywords:',
    '1. Introduction',
    'A. Methods',
    '2.1. Results',
    'References',
  ]);
  assert.equal(result.abstractText, 'This is the abstract paragraph.');
});

test('extractDocStructure - should not classify long paragraphs as headings', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Introduction to this study has shown that many factors play a role.' }] }
    ]
  };

  const result = extractDocStructure(doc);
  assert.deepEqual(result.headings, []);
});
