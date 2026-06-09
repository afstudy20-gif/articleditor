/**
 * Styled table export — render a 2D string array to publication-ready
 * HTML or copy-friendly formats (Word-compatible, LaTeX, CSV).
 */

export type TableStyle = 'apa' | 'three-line' | 'grid' | 'plain';

export type StyledTableOptions = {
  style: TableStyle;
  title?: string;
  footnote?: string;
  hasHeader: boolean;
  fontSize?: number;   // pt, default 10
  fontFamily?: string; // default 'Times New Roman'
};

const DEFAULTS: Required<Pick<StyledTableOptions, 'fontSize' | 'fontFamily'>> = {
  fontSize: 10,
  fontFamily: 'Times New Roman',
};

/** Generate publication-style HTML table for clipboard / export. */
export function styledTableHtml(rows: string[][], opts: StyledTableOptions): string {
  const { style, title, footnote, hasHeader } = opts;
  const fontSize = opts.fontSize ?? DEFAULTS.fontSize;
  const fontFamily = opts.fontFamily ?? DEFAULTS.fontFamily;

  const borderStyle = styleBorders(style);

  let html = `<div style="font-family:'${fontFamily}',serif;font-size:${fontSize}pt;max-width:100%;">`;

  // Title
  if (title) {
    html += `<p style="font-weight:bold;margin-bottom:6pt;font-size:${fontSize + 1}pt;">${esc(title)}</p>`;
  }

  // Top rule for three-line / APA
  const topBorder = style === 'three-line' || style === 'apa' ? 'border-top:2px solid #000;' : '';
  const bottomBorder = style === 'three-line' || style === 'apa' ? 'border-bottom:2px solid #000;' : '';

  html += `<table style="border-collapse:collapse;width:100%;${topBorder}${bottomBorder}${borderStyle.table}">`;

  rows.forEach((row, ri) => {
    const isHeaderRow = ri === 0 && hasHeader;
    const headerBottomBorder = isHeaderRow && (style === 'three-line' || style === 'apa')
      ? 'border-bottom:1px solid #000;'
      : '';

    html += `<tr style="${headerBottomBorder}">`;
    row.forEach((cell) => {
      const tag = isHeaderRow ? 'th' : 'td';
      const weight = isHeaderRow ? 'font-weight:bold;' : '';
      const align = isNumeric(cell) ? 'text-align:right;' : 'text-align:left;';
      html += `<${tag} style="padding:4pt 8pt;${weight}${align}${borderStyle.cell}">${esc(cell)}</${tag}>`;
    });
    html += '</tr>';
  });

  html += '</table>';

  // Footnote
  if (footnote) {
    html += `<p style="font-size:${Math.max(fontSize - 2, 7)}pt;margin-top:4pt;color:#555;">${esc(footnote)}</p>`;
  }

  html += '</div>';
  return html;
}

function styleBorders(style: TableStyle): { table: string; cell: string } {
  switch (style) {
    case 'grid':
      return { table: 'border:1px solid #000;', cell: 'border:1px solid #000;' };
    case 'plain':
      return { table: '', cell: '' };
    case 'apa':
    case 'three-line':
    default:
      return { table: '', cell: '' };
  }
}

function isNumeric(s: string): boolean {
  return /^-?\d+([.,]\d+)?(%)?$/.test(s.trim());
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Export table to LaTeX tabular. */
export function tableToLatex(rows: string[][], opts: StyledTableOptions): string {
  if (rows.length === 0) return '';
  const cols = rows[0].length;
  const colSpec = Array(cols).fill('l').join(' ');

  const lines: string[] = [];
  lines.push('\\begin{table}[htbp]');
  if (opts.title) lines.push(`  \\caption{${latexEsc(opts.title)}}`);
  lines.push(`  \\begin{tabular}{${colSpec}}`);
  lines.push('    \\toprule');

  rows.forEach((row, ri) => {
    const cells = row.map(latexEsc).join(' & ');
    lines.push(`    ${cells} \\\\`);
    if (ri === 0 && opts.hasHeader) lines.push('    \\midrule');
  });

  lines.push('    \\bottomrule');
  lines.push('  \\end{tabular}');
  if (opts.footnote) lines.push(`  \\begin{tablenotes}\\item ${latexEsc(opts.footnote)}\\end{tablenotes}`);
  lines.push('\\end{table}');
  return lines.join('\n');
}

function latexEsc(s: string): string {
  return s.replace(/[&%$#_{}~^\\]/g, (m) => `\\${m}`);
}

/** Export table to CSV string. */
export function tableToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(','),
    )
    .join('\n');
}

/** Export table to TSV string. */
export function tableToTsv(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n');
}

/** Copy styled HTML table to clipboard (falls back to plain text). */
export async function copyStyledTable(html: string, plainText: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch {
    return false;
  }
}
