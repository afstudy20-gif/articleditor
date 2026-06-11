import { parseDocx, type ParagraphNode } from '@/lib/docx/parse';
import type { ParsedTable } from './parse-table';

/** Convert every Word table discovered by the DOCX parser into table imports. */
export function docxParagraphsToTables(paragraphs: ParagraphNode[]): ParsedTable[] {
  return paragraphs
    .filter((paragraph): paragraph is ParagraphNode & { table: string[][] } =>
      Array.isArray(paragraph.table) && paragraph.table.length > 0,
    )
    .map((paragraph): ParsedTable | null => {
      const maxColumns = Math.max(...paragraph.table.map((row) => row.length));
      if (maxColumns === 0) return null;

      const rows = paragraph.table.map((row) => {
        const normalized = row.map((cell) => cell.trim());
        while (normalized.length < maxColumns) normalized.push('');
        return normalized;
      });
      const res: ParsedTable = {
        rows,
        // Word's OOXML header metadata is not consistently present. Default to
        // the common case and let the user toggle this in the import preview.
        hasHeader: true,
        format: 'docx' as const,
      };
      if (paragraph.title !== undefined) res.title = paragraph.title;
      if (paragraph.footnote !== undefined) res.footnote = paragraph.footnote;
      return res;
    })
    .filter((table): table is ParsedTable => table !== null);
}

export async function parseDocxTables(
  file: ArrayBuffer | Uint8Array | Blob,
): Promise<ParsedTable[]> {
  const result = await parseDocx(file);
  return docxParagraphsToTables(result.paragraphs);
}
