import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, rowsToTiptapTable, tiptapTableToRows } from './parse-table';

describe('parseTable', () => {
  it('parses TSV', () => {
    const input = 'Name\tAge\tCity\nAli\t30\tAnkara\nVeli\t25\tIstanbul';
    const result = parseTable(input);
    assert.ok(result);
    assert.equal(result.format, 'tsv');
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows[0], ['Name', 'Age', 'City']);
    assert.deepEqual(result.rows[1], ['Ali', '30', 'Ankara']);
  });

  it('parses CSV', () => {
    const input = 'Name,Age,City\nAli,30,Ankara\n"Veli, Jr.",25,Istanbul';
    const result = parseTable(input);
    assert.ok(result);
    assert.equal(result.format, 'csv');
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows[2], ['Veli, Jr.', '25', 'Istanbul']);
  });

  it('parses pipe-separated', () => {
    const input = '| Name | Age |\n|------|-----|\n| Ali  | 30  |\n| Veli | 25  |';
    const result = parseTable(input);
    assert.ok(result);
    assert.equal(result.rows.length, 3); // header + 2 data (separator line filtered)
  });

  it('returns null for empty/nonsense', () => {
    assert.equal(parseTable(''), null);
    assert.equal(parseTable('just a sentence'), null);
  });
});

describe('roundtrip', () => {
  it('rows → tiptap → rows', () => {
    const rows = [['A', 'B'], ['1', '2'], ['3', '4']];
    const json = rowsToTiptapTable(rows, true);
    assert.ok(json);
    const back = tiptapTableToRows(json);
    assert.deepEqual(back.rows, rows);
    assert.equal(back.hasHeader, true);
  });
});
