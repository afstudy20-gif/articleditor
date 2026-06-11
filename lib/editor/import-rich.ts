import type { Ref } from '@/store/types';
import type { ImportRun } from '@/lib/docx/parse';
import { detectMarkers } from '@/lib/markers/detect';
import { rowsToTiptapTable } from '@/lib/tables/parse-table';

export type ImportParagraph = {
  text: string;
  style?: string;
  runs?: ImportRun[];
  list?: { type: 'bullet' | 'ordered'; level: number };
  table?: string[][];
  title?: string;
  footnote?: string;
};

export function buildDocWithCitations(
  paragraphs: ImportParagraph[],
  refs: Ref[],
): Record<string, unknown> {
  const content: unknown[] = [];
  let pendingList: { type: 'bullet' | 'ordered'; items: unknown[] } | null = null;

  const flushList = (): void => {
    if (!pendingList) return;
    content.push({
      type: pendingList.type === 'bullet' ? 'bulletList' : 'orderedList',
      content: pendingList.items,
    });
    pendingList = null;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.table && paragraph.table.length > 0) {
      flushList();
      const tableNode = rowsToTiptapTable(paragraph.table, true, {
        title: paragraph.title,
        footnote: paragraph.footnote,
      });
      if (tableNode) content.push(tableNode);
      continue;
    }

    if (paragraph.list) {
      const item = {
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: paragraphToCitationInlineRich(paragraph.text, paragraph.runs, refs),
        }],
      };
      if (pendingList && pendingList.type === paragraph.list.type) {
        pendingList.items.push(item);
      } else {
        flushList();
        pendingList = { type: paragraph.list.type, items: [item] };
      }
      continue;
    }
    flushList();

    let style = paragraph.style?.toLowerCase() ?? '';
    if (!style.includes('heading') && style !== 'title' && style !== 'subtitle') {
      const detected = detectHeadingFromRuns(paragraph.text, paragraph.runs);
      if (detected) style = detected.toLowerCase();
    }

    const headingLevel = headingLevelFromStyle(style);
    const inline = paragraphToCitationInlineRich(paragraph.text, paragraph.runs, refs);
    if (headingLevel !== null) {
      content.push({
        type: 'heading',
        attrs: { level: headingLevel },
        content: inline,
      });
    } else {
      content.push({ type: 'paragraph', content: inline });
    }
  }

  flushList();
  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

export function parseHtmlToParagraphs(html: string): ImportParagraph[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs: ImportParagraph[] = [];
  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

  if (blocks.length === 0) {
    doc.querySelectorAll('div').forEach((div) => {
      if (!div.querySelector('div')) paragraphs.push(parseElementToParagraph(div));
    });
  } else {
    blocks.forEach((element) => paragraphs.push(parseElementToParagraph(element)));
  }

  return paragraphs.filter((paragraph) => paragraph.text.trim().length > 0);
}

function headingLevelFromStyle(style: string): 1 | 2 | 3 | null {
  const match = style.match(/heading\s*([1-6])/);
  if (match) return Math.min(Number(match[1]), 3) as 1 | 2 | 3;
  if (style === 'title') return 1;
  if (style === 'subtitle') return 2;
  return null;
}

function detectHeadingFromRuns(text: string, runs?: ImportRun[]): string | undefined {
  if (!runs || runs.length === 0) return undefined;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 120 || /[.?!]$/.test(trimmed)) return undefined;

  const nonWhitespaceLength = trimmed.replace(/\s+/g, '').length;
  const boldLength = runs.reduce(
    (total, run) => total + (run.bold ? run.text.replace(/\s+/g, '').length : 0),
    0,
  );

  return boldLength > 0 && boldLength >= nonWhitespaceLength * 0.9
    ? 'Heading2'
    : undefined;
}

function parseElementToParagraph(element: Element): ImportParagraph {
  const text = element.textContent ?? '';
  const tagName = element.tagName.toLowerCase();
  const headingMatch = /^h([1-6])$/.exec(tagName);
  let style = headingMatch ? `Heading${headingMatch[1]}` : undefined;
  const runs: ImportRun[] = [];

  const traverse = (
    node: Node,
    boldActive: boolean,
    italicActive: boolean,
    underlineActive: boolean,
  ): void => {
    if (node.nodeType === 3) {
      const runText = node.textContent ?? '';
      if (runText) {
        runs.push({
          text: runText,
          bold: boldActive || undefined,
          italic: italicActive || undefined,
          underline: underlineActive || undefined,
        });
      }
      return;
    }
    if (node.nodeType !== 1) return;

    const child = node as Element;
    const childTag = child.tagName.toLowerCase();
    const inlineStyle = child.getAttribute('style')?.toLowerCase().replace(/\s+/g, '') ?? '';
    const bold = boldActive
      || childTag === 'strong'
      || childTag === 'b'
      || /font-weight:(bold|[7-9]00)/.test(inlineStyle);
    const italic = italicActive
      || childTag === 'em'
      || childTag === 'i'
      || inlineStyle.includes('font-style:italic');
    const underline = underlineActive
      || childTag === 'u'
      || inlineStyle.includes('text-decoration:underline');

    child.childNodes.forEach((nested) => traverse(nested, bold, italic, underline));
  };

  element.childNodes.forEach((child) => traverse(child, false, false, false));

  if (!style) style = detectHeadingFromRuns(text, runs);
  return { text, style, runs };
}

function paragraphToCitationInlineRich(
  paragraphText: string,
  runs: ImportRun[] | undefined,
  refs: Ref[],
): Array<Record<string, unknown>> {
  const activeRuns = runs && runs.length > 0 ? runs : [{ text: paragraphText }];
  const markers = detectMarkers(paragraphText);
  const characterStyles: Array<Pick<ImportRun, 'bold' | 'italic' | 'underline'>> = [];

  for (const run of activeRuns) {
    for (let index = 0; index < run.text.length; index += 1) {
      characterStyles.push({
        bold: run.bold,
        italic: run.italic,
        underline: run.underline,
      });
    }
  }
  while (characterStyles.length < paragraphText.length) characterStyles.push({});

  const output: Array<Record<string, unknown>> = [];
  let cursor = 0;
  for (const marker of markers) {
    if (marker.startIndex > cursor) {
      output.push(...makeTextNodesWithStyles(
        paragraphText.slice(cursor, marker.startIndex),
        cursor,
        characterStyles,
      ));
    }
    const refIds = marker.refNumbers
      .map((number) => refs[number - 1]?.id)
      .filter((id): id is string => Boolean(id));
    if (refIds.length > 0) {
      output.push({ type: 'citation', attrs: { refIds } });
    } else {
      output.push(...makeTextNodesWithStyles(marker.raw, marker.startIndex, characterStyles));
    }
    cursor = marker.endIndex;
  }

  if (cursor < paragraphText.length) {
    output.push(...makeTextNodesWithStyles(
      paragraphText.slice(cursor),
      cursor,
      characterStyles,
    ));
  }
  return output;
}

function makeTextNodesWithStyles(
  text: string,
  startOffset: number,
  characterStyles: Array<Pick<ImportRun, 'bold' | 'italic' | 'underline'>>,
): Array<Record<string, unknown>> {
  if (!text) return [];
  const nodes: Array<Record<string, unknown>> = [];
  let segmentStart = 0;
  let previousKey = styleKey(characterStyles[startOffset] ?? {});

  for (let index = 1; index <= text.length; index += 1) {
    const nextKey = index < text.length
      ? styleKey(characterStyles[startOffset + index] ?? {})
      : null;
    if (nextKey === previousKey) continue;

    nodes.push(createTextNode(
      text.slice(segmentStart, index),
      characterStyles[startOffset + segmentStart] ?? {},
    ));
    segmentStart = index;
    previousKey = nextKey ?? '';
  }
  return nodes;
}

function styleKey(style: Pick<ImportRun, 'bold' | 'italic' | 'underline'>): string {
  return `${style.bold ? 'B' : ''}${style.italic ? 'I' : ''}${style.underline ? 'U' : ''}`;
}

function createTextNode(
  text: string,
  style: Pick<ImportRun, 'bold' | 'italic' | 'underline'>,
): Record<string, unknown> {
  const node: Record<string, unknown> = { type: 'text', text };
  const marks: Array<Record<string, unknown>> = [];
  if (style.bold) marks.push({ type: 'bold' });
  if (style.italic) marks.push({ type: 'italic' });
  if (style.underline) marks.push({ type: 'underline' });
  if (marks.length > 0) node.marks = marks;
  return node;
}
