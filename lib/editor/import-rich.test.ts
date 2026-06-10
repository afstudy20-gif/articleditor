import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocWithCitations } from './import-rich';

describe('buildDocWithCitations', () => {
  it('turns a short all-bold imported paragraph into a bold heading', () => {
    const doc = buildDocWithCitations([
      {
        text: 'Methods',
        runs: [{ text: 'Methods', bold: true }],
      },
    ], []) as any;

    assert.equal(doc.content[0].type, 'heading');
    assert.equal(doc.content[0].attrs.level, 2);
    assert.deepEqual(doc.content[0].content[0].marks, [{ type: 'bold' }]);
  });

  it('preserves inline formatting without promoting a normal paragraph', () => {
    const doc = buildDocWithCitations([
      {
        text: 'Bold opening and normal text.',
        runs: [
          { text: 'Bold opening', bold: true },
          { text: ' and normal text.' },
        ],
      },
    ], []) as any;

    assert.equal(doc.content[0].type, 'paragraph');
    assert.deepEqual(doc.content[0].content, [
      { type: 'text', text: 'Bold opening', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and normal text.' },
    ]);
  });

  it('keeps explicit Word heading styles as heading nodes', () => {
    const doc = buildDocWithCitations([
      {
        text: 'Introduction',
        style: 'Heading1',
        runs: [{ text: 'Introduction' }],
      },
    ], []) as any;

    assert.equal(doc.content[0].type, 'heading');
    assert.equal(doc.content[0].attrs.level, 1);
  });
});
