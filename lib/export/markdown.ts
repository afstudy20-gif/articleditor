import type { Ref } from '@/store/types';
import {
  formatBibEntry,
  formatInTextCitation,
  isSuperscriptCitationStyle,
  orderRefsForBib,
  type StyleId,
} from '@/lib/refs/styles';

type Json = any;

export type MarkdownBuildInput = {
  doc: Json;
  refsById: Map<string, Ref>;
  refOrder: Map<string, number>;
  style: StyleId;
  title?: string;
  abstractText?: string;
  keywords?: string[];
  bibHeading?: string;
  /** Embed figure images as base64 data URIs (self-contained .md). Default true. */
  embedImages?: boolean;
};

export type MarkdownBuildOutput = {
  markdown: string;
  warnings: string[];
};

/**
 * Serialize the TipTap document to GitHub-flavored Markdown: title, optional
 * abstract/keywords, body (headings, marks, lists, pipe tables, fenced code,
 * $$ equations, embedded figures) with citations rendered in the active style,
 * and the bibliography appended in final style order.
 */
export function buildMarkdown(input: MarkdownBuildInput): MarkdownBuildOutput {
  const renderer = new MarkdownRenderer(input);
  return { markdown: renderer.render(), warnings: renderer.warnings };
}

class MarkdownRenderer {
  readonly warnings: string[] = [];

  private readonly bibPos = new Map<string, number>();
  private readonly orderedRefs: Ref[];
  private readonly figureNumbers = new Map<string, { kind: 'figure' | 'table'; number: number }>();
  private readonly embedImages: boolean;

  constructor(private readonly input: MarkdownBuildInput) {
    this.embedImages = input.embedImages !== false;
    const citationOrdered = orderByCitation(input.refsById, input.refOrder);
    this.orderedRefs = orderRefsForBib(input.style, citationOrdered);
    this.orderedRefs.forEach((r, i) => this.bibPos.set(r.id, i + 1));
    this.collectFigureNumbers(input.doc);
  }

  render(): string {
    const parts: string[] = [];
    const title = this.input.title?.trim();
    if (title) parts.push(`# ${escapeMd(title)}`);

    const abstractBlock = this.renderAbstract();
    if (abstractBlock) parts.push(abstractBlock);

    const bodyBlocks = Array.isArray(this.input.doc?.content)
      ? this.input.doc.content.map((node: Json) => this.renderBlock(node)).filter(Boolean)
      : [];
    parts.push(...bodyBlocks);

    if (this.orderedRefs.length > 0) {
      const heading = this.input.bibHeading?.trim() || 'References';
      const entries = this.orderedRefs.map(
        (r, i) => escapeBibEntry(formatBibEntry(this.input.style, r, i + 1)),
      );
      parts.push(`## ${escapeMd(heading)}\n\n${entries.join('\n\n')}`);
    }

    return `${parts.join('\n\n').trim()}\n`;
  }

  private renderAbstract(): string {
    const text = this.input.abstractText?.trim();
    const keywords = (this.input.keywords ?? []).map((k) => k.trim()).filter(Boolean);
    if (!text && keywords.length === 0) return '';
    const parts: string[] = ['## Abstract'];
    if (text) parts.push(escapeMd(text));
    if (keywords.length > 0) parts.push(`**Keywords:** ${escapeMd(keywords.join('; '))}`);
    return parts.join('\n\n');
  }

  private renderBlock(node: Json): string {
    if (!node) return '';
    switch (node.type) {
      case 'paragraph': {
        return this.renderInlineChildren(node);
      }
      case 'heading': {
        // Document h1 becomes ## because # is reserved for the article title.
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 5) + 1;
        return `${'#'.repeat(level)} ${this.renderInlineChildren(node)}`;
      }
      case 'bulletList':
        return this.renderList(node, false);
      case 'orderedList':
        return this.renderList(node, true);
      case 'blockquote':
        return this.renderBlockChildren(node)
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');
      case 'codeBlock': {
        const code = (node.content ?? []).map((c: Json) => c.text ?? '').join('');
        const langAttr = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
        return `\`\`\`${langAttr}\n${code}\n\`\`\``;
      }
      case 'horizontalRule':
        return '---';
      case 'equation': {
        const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex.trim() : '';
        return latex ? `$$\n${latex}\n$$` : '';
      }
      case 'table':
        return this.renderTable(node);
      case 'figure':
        return this.renderFigure(node);
      case 'image':
        return this.renderImage(node.attrs?.src, '');
      default:
        return this.renderBlockChildren(node);
    }
  }

  private renderList(node: Json, ordered: boolean): string {
    const items: string[] = [];
    let index = 0;
    for (const item of node.content ?? []) {
      if (item.type !== 'listItem') continue;
      index += 1;
      const marker = ordered ? `${index}.` : '-';
      const indent = ' '.repeat(marker.length + 1);
      const blocks = (item.content ?? [])
        .map((child: Json) => this.renderBlock(child))
        .filter(Boolean);
      const body = blocks
        .join('\n\n')
        .split('\n')
        .map((line: string, i: number) => (i === 0 ? `${marker} ${line}` : `${indent}${line}`))
        .join('\n');
      items.push(body || marker);
    }
    return items.join('\n');
  }

  private renderTable(node: Json): string {
    const title = cleanText(node.attrs?.title);
    const footnote = cleanText(node.attrs?.footnote);
    const rows: Json[] = (node.content ?? []).filter((row: Json) => row.type === 'tableRow');
    if (rows.length === 0) return '';

    const rendered = rows.map((row) =>
      (row.content ?? []).map((cell: Json) => {
        if (Number(cell.attrs?.colspan ?? 1) > 1 || Number(cell.attrs?.rowspan ?? 1) > 1) {
          this.addWarning('A table contains merged cells; Markdown pipe tables cannot represent spans — verify the exported table.');
        }
        return this.renderTableCell(cell);
      }),
    );
    const columnCount = rendered.reduce((max, cells) => Math.max(max, cells.length), 0);
    if (columnCount === 0) return '';
    for (const cells of rendered) while (cells.length < columnCount) cells.push('');

    const firstRowIsHeader = (rows[0].content ?? []).length > 0
      && (rows[0].content ?? []).every((cell: Json) => cell.type === 'tableHeader');
    const header = firstRowIsHeader ? rendered[0] : Array(columnCount).fill(' ');
    const bodyRows = firstRowIsHeader ? rendered.slice(1) : rendered;

    const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
    const parts: string[] = [];
    if (title) parts.push(`**${escapeMd(title)}**`);
    parts.push(
      [
        line(header),
        line(Array(columnCount).fill('---')),
        ...bodyRows.map(line),
      ].join('\n'),
    );
    if (footnote) parts.push(`*${escapeMd(footnote)}*`);
    return parts.join('\n\n');
  }

  private renderTableCell(cell: Json): string {
    const parts: string[] = [];
    for (const child of cell.content ?? []) {
      if (child.type === 'paragraph' || child.type === 'heading') {
        parts.push(this.renderInlineChildren(child));
      } else {
        parts.push(this.renderBlock(child).replace(/\n/g, ' '));
      }
    }
    const content = parts.filter(Boolean).join('<br>').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
    return cell.type === 'tableHeader' ? `**${content}**` : content;
  }

  private renderFigure(node: Json): string {
    const kind: 'figure' | 'table' = node.attrs?.kind === 'table' ? 'table' : 'figure';
    const figId = typeof node.attrs?.figId === 'string' ? node.attrs.figId : '';
    const caption = cleanText(node.attrs?.caption);
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const target = figId ? this.figureNumbers.get(figId) : undefined;
    const label = kind === 'table' ? 'Table' : 'Figure';
    const captionLine = caption
      ? `**${label}${target ? ` ${target.number}` : ''}.** ${escapeMd(stripCaptionPrefix(caption))}`
      : '';
    const image = this.renderImage(src, caption || `${label}${target ? ` ${target.number}` : ''}`);
    return [image, captionLine].filter(Boolean).join('\n\n');
  }

  private renderImage(src: unknown, alt: string): string {
    const url = typeof src === 'string' ? src.trim() : '';
    if (!url) return '';
    const isDataUri = /^data:image\//i.test(url);
    if (isDataUri && !this.embedImages) {
      this.addWarning('Embedded images were omitted from the Markdown export.');
      return `*[image omitted]*`;
    }
    if (!isDataUri && !/^https?:\/\//i.test(url)) {
      this.addWarning('An image with an unsupported source was replaced with a placeholder.');
      return `*[image omitted]*`;
    }
    return `![${escapeMd(alt)}](${url.replace(/[\s)]/g, '')})`;
  }

  private renderBlockChildren(node: Json): string {
    if (!Array.isArray(node.content)) return '';
    return node.content
      .map((child: Json) => this.renderBlock(child))
      .filter(Boolean)
      .join('\n\n');
  }

  private renderInlineChildren(node: Json): string {
    if (!Array.isArray(node.content)) return '';
    return node.content.map((child: Json) => this.renderInline(child)).join('');
  }

  private renderInline(node: Json): string {
    if (!node) return '';
    if (node.type === 'text') return applyMarks(node.text ?? '', node.marks ?? []);
    if (node.type === 'citation') return this.renderCitation(node);
    if (node.type === 'figureRef') return this.renderFigureRef(node);
    if (node.type === 'hardBreak') return '  \n';
    if (node.type === 'image') return this.renderImage(node.attrs?.src, '');
    if (Array.isArray(node.content)) {
      return node.content.map((child: Json) => this.renderInline(child)).join('');
    }
    return '';
  }

  private renderCitation(node: Json): string {
    const ids: string[] = Array.isArray(node.attrs?.refIds) ? node.attrs.refIds : [];
    const nums = ids.map((id) => this.bibPos.get(id) ?? 0).filter((n) => n > 0);
    const cited = ids
      .map((id) => this.input.refsById.get(id))
      .filter((r): r is Ref => Boolean(r));
    if (nums.length === 0 && cited.length === 0) {
      this.addWarning('A citation could not be matched to a bibliography entry.');
      return '**[?]**';
    }
    const raw = formatInTextCitation(this.input.style, cited, nums, {
      locator: cleanText(node.attrs?.locator) || undefined,
      prefix: cleanText(node.attrs?.prefix) || undefined,
      suffix: cleanText(node.attrs?.suffix) || undefined,
      suppressAuthor: Boolean(node.attrs?.suppressAuthor) || undefined,
    });
    return isSuperscriptCitationStyle(this.input.style)
      ? `<sup>${escapeMd(raw)}</sup>`
      : escapeMd(raw);
  }

  private renderFigureRef(node: Json): string {
    const figId = typeof node.attrs?.figId === 'string' ? node.attrs.figId : '';
    const target = figId ? this.figureNumbers.get(figId) : undefined;
    if (!target) {
      this.addWarning(`A figure/table cross-reference has no matching target (${figId || 'missing id'}).`);
      return '**[missing cross-reference]**';
    }
    return `${target.kind === 'table' ? 'Table' : 'Figure'} ${target.number}`;
  }

  private collectFigureNumbers(node: Json): void {
    let figureNumber = 0;
    let tableNumber = 0;
    const walk = (current: Json): void => {
      if (!current) return;
      if (current.type === 'figure') {
        const kind: 'figure' | 'table' = current.attrs?.kind === 'table' ? 'table' : 'figure';
        const number = kind === 'table' ? ++tableNumber : ++figureNumber;
        const figId = typeof current.attrs?.figId === 'string' ? current.attrs.figId : '';
        if (figId && !this.figureNumbers.has(figId)) {
          this.figureNumbers.set(figId, { kind, number });
        }
      }
      for (const child of current.content ?? []) walk(child);
    };
    walk(node);
  }

  private addWarning(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }
}

function orderByCitation(refsById: Map<string, Ref>, refOrder: Map<string, number>): Ref[] {
  const entries: Array<{ id: string; n: number }> = [];
  refOrder.forEach((n, id) => entries.push({ id, n }));
  entries.sort((a, b) => a.n - b.n);
  const out: Ref[] = [];
  for (const e of entries) {
    const r = refsById.get(e.id);
    if (r) out.push(r);
  }
  return out;
}

function applyMarks(text: string, marks: Array<{ type: string; attrs?: any }>): string {
  const hasCode = marks.some((m) => m.type === 'code');
  if (hasCode) return `\`${text.replace(/`/g, '‘')}\``;
  let rendered = escapeMd(text);
  // Emphasis markers hug non-space characters; move leading/trailing spaces outside.
  const wrap = (open: string, close: string) => {
    const m = rendered.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m || !m[2]) return;
    rendered = `${m[1]}${open}${m[2]}${close}${m[3]}`;
  };
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        wrap('**', '**');
        break;
      case 'italic':
        wrap('*', '*');
        break;
      case 'strike':
        wrap('~~', '~~');
        break;
      case 'underline':
        wrap('<u>', '</u>');
        break;
      case 'superscript':
        wrap('<sup>', '</sup>');
        break;
      case 'subscript':
        wrap('<sub>', '</sub>');
        break;
      case 'highlight':
        wrap('==', '==');
        break;
      case 'link': {
        const href = sanitizeUrl(mark.attrs?.href ?? '');
        if (href) rendered = `[${rendered}](${href})`;
        break;
      }
      default:
        break;
    }
  }
  return rendered;
}

/** Escape Markdown-significant characters in plain prose. */
function escapeMd(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/([*_`~[\]])/g, '\\$1')
    .replace(/^(\s*)([#>+-])(\s)/gm, '$1\\$2$3')
    .replace(/^(\s*)(\d+)\.(\s)/gm, '$1$2\\.$3');
}

/** Bibliography entries: keep the leading "1." of numeric styles unescaped. */
function escapeBibEntry(entry: string): string {
  const m = entry.match(/^(\d+\.\s*)([\s\S]*)$/);
  if (m) return `${m[1]}${escapeMd(m[2])}`;
  return escapeMd(entry);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeUrl(value: string): string {
  const cleaned = String(value).replace(/[\r\n\s]/g, '');
  if (!/^https?:\/\//i.test(cleaned)) return '';
  return cleaned.replace(/\)/g, '%29');
}

function stripCaptionPrefix(caption: string): string {
  const trimmed = caption.trim();
  if (!trimmed) return '';
  const regex = /^\s*(?:Figure|Fig|Resim|Res|Table|Tab|Tablo)\.?\s*\d+\s*[.:\-—–\s]*/i;
  return trimmed.replace(regex, '').trim();
}
