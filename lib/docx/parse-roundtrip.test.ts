import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRichDocx } from './build-rich';
import { parseDocx } from './parse';
import type { Ref } from '@/store/types';

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Results' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Plain paragraph.' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alpha' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'beta' }] }] },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', attrs: {}, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Col A' }] }] },
            { type: 'tableHeader', attrs: {}, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Col B' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', attrs: {}, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
            { type: 'tableCell', attrs: {}, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
          ],
        },
      ],
    },
  ],
};

describe('docx roundtrip (rich export → import)', () => {
  it('lists and tables survive', async () => {
    const blob = await buildRichDocx({
      doc,
      refsById: new Map<string, Ref>(),
      refOrder: new Map<string, number>(),
      style: 'vancouver',
      mode: 'plain',
    });
    const result = await parseDocx(await blob.arrayBuffer());

    const tablePara = result.paragraphs.find((p) => p.table);
    assert.ok(tablePara, 'table node detected on import');
    assert.deepEqual(tablePara!.table, [
      ['Col A', 'Col B'],
      ['1', '2'],
    ]);

    const listParas = result.paragraphs.filter((p) => p.list);
    assert.equal(listParas.length, 2, 'both list items detected');
    assert.equal(listParas[0].list!.type, 'bullet', 'bullet type resolved via numbering.xml');
    assert.equal(listParas[0].text, 'alpha');

    const heading = result.paragraphs.find((p) => p.style?.toLowerCase().includes('heading2'));
    assert.ok(heading, 'heading style preserved');
  });
});
