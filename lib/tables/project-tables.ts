import type { ProjectTable } from '@/store/types';
import { newId } from '@/lib/id';
import type { ImportParagraph } from '@/lib/editor/import-rich';
import type { ParsedTable } from './parse-table';

export function projectTableFromParsed(table: ParsedTable, source?: string): ProjectTable {
  return {
    id: newId('tbl'),
    rows: table.rows,
    hasHeader: table.hasHeader,
    title: table.title,
    footnote: table.footnote,
    format: table.format,
    source,
    createdAt: Date.now(),
  };
}

export function extractProjectTables(paragraphs: ImportParagraph[], source?: string): {
  paragraphs: ImportParagraph[];
  tables: ProjectTable[];
} {
  const tables: ProjectTable[] = [];
  const cleanParagraphs: ImportParagraph[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.table && paragraph.table.length > 0) {
      tables.push({
        id: newId('tbl'),
        rows: paragraph.table,
        hasHeader: true,
        title: paragraph.title,
        footnote: paragraph.footnote,
        format: 'docx',
        source,
        createdAt: Date.now(),
      });
    } else {
      cleanParagraphs.push(paragraph);
    }
  }

  return { paragraphs: cleanParagraphs, tables };
}
