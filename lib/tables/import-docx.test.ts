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
      title: 'Table 1.',
    }]);
  });

  it('imports a table with title and footnote from a real DOCX package', async () => {
    const blob = await buildRichDocx({
      doc: {
        type: 'doc',
        content: [{
          type: 'table',
          attrs: {
            title: 'My Custom Table Title',
            footnote: 'Values are mean ± SD',
          },
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Metric' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] },
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

    assert.equal(tables.length, 1);
    assert.equal(tables[0].title, 'Table 1. My Custom Table Title');
    assert.equal(tables[0].footnote, 'Values are mean ± SD');
  });

  it('does not merge the next table title into the previous table footnote', async () => {
    const table = (
      title: string,
      footnote: string,
      value: string,
    ) => ({
      type: 'table',
      attrs: { title, footnote },
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Metric' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
            },
          ],
        },
      ],
    });
    const blob = await buildRichDocx({
      doc: {
        type: 'doc',
        content: [
          table('First table', 'Values are mean ± SD.', 'First'),
          table('Second table', 'Data are n (%).', 'Second'),
        ],
      },
      refsById: new Map<string, Ref>(),
      refOrder: new Map<string, number>(),
      style: 'vancouver',
      mode: 'plain',
    });

    const tables = await parseDocxTables(await blob.arrayBuffer());

    assert.equal(tables.length, 2);
    assert.equal(tables[0].title, 'Table 1. First table');
    assert.equal(tables[0].footnote, 'Values are mean ± SD.');
    assert.equal(tables[1].title, 'Table 2. Second table');
    assert.equal(tables[1].footnote, 'Data are n (%).');
  });
});
