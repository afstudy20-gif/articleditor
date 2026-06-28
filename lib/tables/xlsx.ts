import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ParsedTable } from './parse-table';

type AnyNode = Record<string, any>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
});

function arr<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function columnIndex(cellRef: string | undefined, fallback: number): number {
  const letters = (cellRef ?? '').match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) return fallback;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function textFromRichText(value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textFromRichText).join('');
  if (typeof value === 'object') {
    if (value.t !== undefined) return textFromRichText(value.t);
    if (value.r !== undefined) return textFromRichText(value.r);
    if (value.is?.t !== undefined) return textFromRichText(value.is.t);
  }
  return '';
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const xml = await file.async('string');
  const root = parser.parse(xml) as AnyNode;
  return arr(root.sst?.si).map((si) => textFromRichText(si));
}

function cellValue(cell: AnyNode, sharedStrings: string[]): string {
  const type = cell['@_t'];
  if (type === 's') {
    const index = Number(cell.v ?? -1);
    return sharedStrings[index] ?? '';
  }
  if (type === 'inlineStr') return textFromRichText(cell.is);
  if (type === 'b') return cell.v === 1 || cell.v === '1' ? 'TRUE' : 'FALSE';
  return cell.v === undefined || cell.v === null ? '' : String(cell.v);
}

export async function parseXlsxFirstSheet(input: ArrayBuffer | Uint8Array): Promise<ParsedTable | null> {
  const zip = await JSZip.loadAsync(input);
  const sheet = zip.file('xl/worksheets/sheet1.xml');
  if (!sheet) return null;

  const [xml, sharedStrings] = await Promise.all([
    sheet.async('string'),
    readSharedStrings(zip),
  ]);
  const root = parser.parse(xml) as AnyNode;
  const rows = arr(root.worksheet?.sheetData?.row);
  const output: string[][] = [];
  let maxCols = 0;

  for (const row of rows) {
    const cells = arr(row.c);
    const values: string[] = [];
    cells.forEach((cell, fallback) => {
      const index = columnIndex(cell['@_r'], fallback);
      values[index] = cellValue(cell, sharedStrings);
    });
    while (values.length > 0 && !values[values.length - 1]) values.pop();
    if (values.some((value) => value.trim())) {
      maxCols = Math.max(maxCols, values.length);
      output.push(values);
    }
  }

  if (output.length === 0 || maxCols < 2) return null;
  for (const row of output) {
    while (row.length < maxCols) row.push('');
  }
  return { rows: output, hasHeader: true, format: 'csv' };
}
