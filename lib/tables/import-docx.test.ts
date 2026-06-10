import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRichDocx } from '@/lib/docx/build-rich';
import type { Ref } from '@/store/types';
import { docxParagraphsToTables, parseDocxTables } from './import-docx';

describe('docxParagraphsToTables', () => {
  it('extracts and normalizes all Word tables', () => {
    const tables = docxParagraphsToTables([
      { text: 'Introduction' },
      {
        text: 'Name\tAge\nAli\t30',
        table: [
          [' Name ', 'Age'],
          ['Ali', '30'],
        ],
      },
      {
        text: 'A\tB\n1',
        table: [
          ['A', 'B'],
          ['1'],
        ],
      },
    ]);

    assert.equal(tables.length, 2);
    assert.deepEqual(tables[0], {
      rows: [
        ['Name', 'Age'],
        ['Ali', '30'],
      ],
      hasHeader: true,
      format: 'docx',
    });
    assert.deepEqual(tables[1].rows, [
      ['A', 'B'],
      ['1', ''],
    ]);
  });

  it('ignores Word tables without cells', () => {
    const tables = docxParagraphsToTables([
      { text: '', table: [[]] },
    ]);

    assert.deepEqual(tables, []);
  });

  it('imports a table from a real DOCX package', async () => {
    const blob = await buildRichDocx({
      doc: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Group' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mean' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Treatment' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '12.4' }] }] },
              ],
            },
          ],
        }],
      },
      refsById: new Map<string, Ref>(),
      refOrder: new Map<string, number>(),
      style: 'vancouver',
      mode: 'plain',
    });

    const tables = await parseDocxTables(await blob.arrayBuffer());

    assert.deepEqual(tables, [{
      rows: [
        ['Group', 'Mean'],
        ['Treatment', '12.4'],
      ],
      hasHeader: true,
      format: 'docx',
    }]);
  });
});
