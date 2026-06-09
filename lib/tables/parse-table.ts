/**
 * Table parser — detect and parse tables from HTML, CSV, TSV, or plain text.
 * Returns a 2D string array (rows × cols) ready for TipTap table insertion.
 */

export type ParsedTable = {
  rows: string[][];
  hasHeader: boolean;
  /** Source format detected */
  format: 'html' | 'csv' | 'tsv' | 'text';
};

/** Try all formats in priority order. Returns null if nothing detected. */
export function parseTable(input: string): ParsedTable | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. HTML table
  const html = parseHtmlTable(trimmed);
  if (html) return html;

  // 2. TSV (tabs present in most lines)
  const tsv = parseTsv(trimmed);
  if (tsv) return tsv;

  // 3. CSV (commas + quotes pattern)
  const csv = parseCsv(trimmed);
  if (csv) return csv;

  // 4. Plain text with consistent separators (pipes, multiple spaces)
  const text = parsePlainText(trimmed);
  if (text) return text;

  return null;
}

// ─── HTML table parser ──────────────────────────────────────

function parseHtmlTable(html: string): ParsedTable | null {
  if (!/<table[\s>]/i.test(html)) return null;

  // Use DOMParser if available (browser)
  if (typeof DOMParser === 'undefined') return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;

  const rows: string[][] = [];
  let hasHeader = false;

  const trs = table.querySelectorAll('tr');
  trs.forEach((tr, ri) => {
    const cells: string[] = [];
    const tds = tr.querySelectorAll('th, td');
    tds.forEach((cell) => {
      cells.push((cell.textContent ?? '').trim());
    });
    if (cells.length > 0) {
      // Check if first row uses <th>
      if (ri === 0 && tr.querySelector('th')) hasHeader = true;
      rows.push(cells);
    }
  });

  if (rows.length < 1) return null;

  // Normalize column count
  const maxCols = Math.max(...rows.map((r) => r.length));
  for (const row of rows) {
    while (row.length < maxCols) row.push('');
  }

  return { rows, hasHeader, format: 'html' };
}

// ─── TSV parser ─────────────────────────────────────────────

function parseTsv(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  // At least 60% of lines must contain tab
  const tabLines = lines.filter((l) => l.includes('\t'));
  if (tabLines.length / lines.length < 0.6) return null;

  const rows = lines.map((l) => l.split('\t').map((c) => c.trim()));
  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols < 2) return null;

  for (const row of rows) {
    while (row.length < maxCols) row.push('');
  }

  return { rows, hasHeader: true, format: 'tsv' };
}

// ─── CSV parser (RFC 4180-ish) ──────────────────────────────

function parseCsv(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Heuristic: must have commas in most lines
  const commaLines = lines.filter((l) => l.includes(','));
  if (commaLines.length / lines.length < 0.6) return null;

  const rows: string[][] = [];
  for (const line of lines) {
    rows.push(parseCsvLine(line));
  }

  const maxCols = Math.max(...rows.map((r) => r.length));
  if (maxCols < 2) return null;

  for (const row of rows) {
    while (row.length < maxCols) row.push('');
  }

  return { rows, hasHeader: true, format: 'csv' };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  cells.push(current.trim());
  return cells;
}

// ─── Plain text with pipes or aligned spaces ────────────────

function parsePlainText(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Filter out separator-only lines (---+---, ===, etc.)
  const dataLines = lines.filter((l) => !/^[\s|+\-=]+$/.test(l));
  if (dataLines.length < 2) return null;

  // Try pipe-separated
  const pipeLines = dataLines.filter((l) => l.includes('|'));
  if (pipeLines.length / dataLines.length >= 0.6) {
    const rows = dataLines.map((l) =>
      l
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    );
    const maxCols = Math.max(...rows.map((r) => r.length));
    if (maxCols >= 2) {
      for (const row of rows) {
        while (row.length < maxCols) row.push('');
      }
      return { rows, hasHeader: true, format: 'text' };
    }
  }

  // Try multiple-space separated (aligned columns)
  const spaceRows = dataLines.map((l) => l.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean));
  const avgCols = spaceRows.reduce((s, r) => s + r.length, 0) / spaceRows.length;
  if (avgCols >= 2) {
    const maxCols = Math.max(...spaceRows.map((r) => r.length));
    for (const row of spaceRows) {
      while (row.length < maxCols) row.push('');
    }
    return { rows: spaceRows, hasHeader: true, format: 'text' };
  }

  return null;
}

/** Convert TipTap table JSON node to 2D string array. */
export function tiptapTableToRows(tableNode: any): { rows: string[][]; hasHeader: boolean } {
  const rows: string[][] = [];
  let hasHeader = false;

  if (!tableNode?.content) return { rows, hasHeader };

  for (const row of tableNode.content) {
    if (row.type !== 'tableRow') continue;
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      if (cell.type === 'tableHeader') hasHeader = true;
      // Extract text content from cell
      const text = extractText(cell);
      cells.push(text);
    }
    rows.push(cells);
  }

  return { rows, hasHeader };
}

function extractText(node: any): string {
  if (!node) return '';
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

/** Build TipTap JSON content for a table from parsed rows. */
export function rowsToTiptapTable(rows: string[][], hasHeader: boolean): any {
  if (rows.length === 0) return null;

  const content = rows.map((row, ri) => ({
    type: 'tableRow',
    content: row.map((cell) => ({
      type: ri === 0 && hasHeader ? 'tableHeader' : 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: cell }] : [] }],
    })),
  }));

  return { type: 'table', content };
}
