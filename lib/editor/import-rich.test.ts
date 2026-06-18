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

  it('remaps citation markers when only a subset of references is selected', () => {
    const refs = [
      { id: 'ref-1', raw: 'First reference' },
      { id: 'ref-3', raw: 'Third reference' },
    ] as any;
    const doc = buildDocWithCitations(
      [{ text: 'Text with [1] and [2] and [3].' }],
      refs,
      [1, 3],
    ) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 2);
    assert.deepEqual(citations[0].attrs.refIds, ['ref-1']);
    assert.deepEqual(citations[1].attrs.refIds, ['ref-3']);
  });

  it('drops citations for references that are not selected', () => {
    const refs = [{ id: 'ref-1', raw: 'First reference' }] as any;
    const doc = buildDocWithCitations(
      [{ text: 'Text with [1] and [2].' }],
      refs,
      [1],
    ) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 1);
    assert.deepEqual(citations[0].attrs.refIds, ['ref-1']);
    const textNodes = doc.content[0].content.filter((n: any) => n.type === 'text');
    assert.ok(textNodes.some((n: any) => n.text.includes('[2]')));
  });
});
