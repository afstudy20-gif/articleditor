import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export type DocxParseResult = {
  paragraphs: ParagraphNode[];
  plainText: string;
  zip: JSZip;
  documentXml: string;
};

export type ImportRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type ParagraphNode = {
  text: string;
  style?: string;
  runs?: ImportRun[];
  /** Present when the paragraph is a list item (from w:numPr). */
  list?: { type: 'bullet' | 'ordered'; level: number };
  /** Present when this node is a table — rows × cells of plain text. */
  table?: string[][];
  title?: string;
  footnote?: string;
  isResolvedFootnote?: boolean;
};

/**
 * Loose OOXML node as produced by fast-xml-parser (preserveOrder mode).
 * Values are strings, nested nodes, arrays of nodes, or attribute primitives.
 * The tree shape varies across Word versions, so this stays intentionally open.
 */
type OOXMLValue = string | number | boolean | OOXMLNode | OOXMLValue[] | undefined;
interface OOXMLNode {
  [key: string]: OOXMLValue;
}

/** True when the value is a traversable node (object, not array, not null). */
function isOOXMLNode(value: unknown): value is OOXMLNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const W_NS = '@_xmlns:w';

export async function parseDocx(file: ArrayBuffer | Uint8Array | Blob): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(file);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml not found in .docx');
  const documentXml = await docFile.async('string');

  const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  const parsed = parser.parse(documentXml) as OOXMLNode;

  // Build a map of footnote/endnote IDs to their resolved text contents.
  const notesMap = new Map<string, string>();
  const loadNotes = async (filename: string, tagName: 'w:footnote' | 'w:endnote') => {
    const file = zip.file(filename);
    if (!file) return;
    try {
      const xml = await file.async('string');
      const tree = parser.parse(xml) as OOXMLNode;
      const walkNotes = (n: OOXMLValue): void => {
        if (Array.isArray(n)) {
          for (const item of n) walkNotes(item);
          return;
        }
        if (!isOOXMLNode(n)) return;
        if (tagName in n) {
          const attrs = isOOXMLNode(n[':@']) ? (n[':@'] as OOXMLNode) : undefined;
          const id = String(attrs?.['@_w:id'] ?? '');
          const text = extractParagraphText(n[tagName]).trim();
          if (id && text) {
            notesMap.set(`${tagName}_${id}`, text);
          }
        } else {
          for (const k of Object.keys(n)) {
            if (k !== ':@') walkNotes(n[k]);
          }
        }
      };
      walkNotes(tree);
    } catch (err) {
      console.warn(`Failed to parse ${filename}`, err);
    }
  };

  await loadNotes('word/footnotes.xml', 'w:footnote');
  await loadNotes('word/endnotes.xml', 'w:endnote');

  const paragraphs: ParagraphNode[] = [];
  walk(parsed, paragraphs, notesMap);

  // Resolve list types (bullet vs ordered) from word/numbering.xml.
  const numFmtById = await parseNumberingMap(zip, parser);
  for (const p of paragraphs) {
    if (p.list && p.list.type === 'ordered' && numFmtById) {
      const fmt = numFmtById.get((p as ParagraphNodeInternal).numId ?? '');
      if (fmt === 'bullet') p.list = { ...p.list, type: 'bullet' };
    }
  }

  // Post-process to detect and link table titles and footnotes.
  // Broader regex matches standard abbreviations, superscripts, daggers, or single letters/digits followed by dot/parenthesis.
  const processed: ParagraphNode[] = [];
  const footnoteRegex = /^\s*(Note|Not|Values|Değerler|Data|Veri|Veriler|Mean|Ortalama|SD|p\s*[\d<>]|Source|Kaynak|Abbreviation|Kısaltma|Kısaltmalar|Statistical|İstatistik|Açıklama|Açıklamalar|[\*†‡§¶#¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱ₀₁₂₃₄₅₆₇₈₉\u00B2\u00B3\u00B9]|\b[a-z0-9](?:\.|\)|\]|:)|[A-Za-z0-9\s]{1,20}\s*[\:\-–—])/i;
  const isTableTitle = (paragraph: ParagraphNode): boolean => {
    const text = paragraph.text.trim();
    const style = paragraph.style?.toLowerCase() ?? '';
    const hasCaptionStyle = (
      style.includes('caption') ||
      style.includes('title') ||
      style.includes('başlık') ||
      style.includes('baslik')
    ) && !style.includes('heading');
    return /^\s*(Table|Tablo)\s+\d+/i.test(text) || hasCaptionStyle;
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.table && p.table.length > 0) {
      // 1. Look back for a title
      let title: string | undefined = undefined;
      let prevIdx = processed.length - 1;
      while (prevIdx >= 0 && processed[prevIdx].text.trim().length === 0) {
        prevIdx--;
      }
      if (prevIdx >= 0) {
        const prev = processed[prevIdx];
        const prevText = prev.text.trim();
        // If it starts with Table/Tablo followed by a number, or matches caption/title style
        if (!prev.table && isTableTitle(prev)) {
          title = prevText;
          processed.splice(prevIdx, 1);
        }
      }

      // 2. Look ahead for multiple adjacent footnote paragraphs
      const footnotes: string[] = p.footnote ? [p.footnote] : [];
      let nextIdx = i + 1;
      while (nextIdx < paragraphs.length) {
        if (paragraphs[nextIdx].text.trim().length === 0) {
          nextIdx++;
          continue;
        }
        const next = paragraphs[nextIdx];
        const nextText = next.text.trim();
        
        if (next.table) break;
        // A following table caption belongs to the next table, even when a
        // previous footnote paragraph started a short continuation block.
        if (isTableTitle(next)) break;
        
        const isHeadingStyle = next.style?.toLowerCase().includes('heading') || next.style?.toLowerCase() === 'title';
        const isHeadingText = ['references', 'kaynaklar', 'bibliography', 'literatür', 'introduction', 'giriş', 'methods', 'yöntem', 'results', 'bulgular', 'discussion', 'tartışma', 'abstract', 'öz', 'özet'].includes(
          nextText.toLowerCase().replace(/[\d.\s]+/g, ''),
        );
        if (isHeadingStyle || isHeadingText) break;

        const nextStyle = next.style?.toLowerCase() ?? '';
        const isFootnoteStyle = nextStyle.includes('footnote') || nextStyle.includes('note') || nextStyle.includes('dipnot');
        const matchesRegex = footnoteRegex.test(nextText);
        
        // Match if it matches style, regex, isResolvedFootnote, or if we already started a footnote block and it is short.
        const isFootnote = matchesRegex || isFootnoteStyle || next.isResolvedFootnote || (footnotes.length > 0 && nextText.length < 350);

        if (isFootnote) {
          footnotes.push(nextText);
          (next as any)._isFootnoteMerged = true;
          nextIdx++;
        } else {
          break;
        }
      }

      let footnote: string | undefined = undefined;
      if (footnotes.length > 0) {
        footnote = footnotes.join('\n');
      }

      processed.push({
        ...p,
        title,
        footnote,
      });
    } else if (!(p as any)._isFootnoteMerged) {
      processed.push(p);
    }
  }

  const plainText = processed.map((p) => p.text).join('\n');
  return { paragraphs: processed, plainText, zip, documentXml };
}

type ParagraphNodeInternal = ParagraphNode & { numId?: string };

/** Map numId → 'bullet' | 'ordered' by reading word/numbering.xml. */
async function parseNumberingMap(
  zip: JSZip,
  parser: XMLParser,
): Promise<Map<string, 'bullet' | 'ordered'> | null> {
  const numberingFile = zip.file('word/numbering.xml');
  if (!numberingFile) return null;
  try {
    const xml = await numberingFile.async('string');
    const tree = parser.parse(xml) as OOXMLValue;
    // abstractNumId → first-level numFmt
    const abstractFmt = new Map<string, 'bullet' | 'ordered'>();
    // numId → abstractNumId
    const numToAbstract = new Map<string, string>();

    const attrsOf = (n: OOXMLValue): OOXMLNode | undefined => {
      const a = isOOXMLNode(n) ? n[':@'] : undefined;
      return isOOXMLNode(a) ? a : undefined;
    };

    const scan = (n: OOXMLValue): void => {
      if (Array.isArray(n)) {
        for (const item of n) scan(item);
        return;
      }
      if (!isOOXMLNode(n)) return;
      if ('w:abstractNum' in n) {
        const id = String(attrsOf(n)?.['@_w:abstractNumId'] ?? '');
        let fmt: 'bullet' | 'ordered' = 'ordered';
        const findFmt = (m: OOXMLValue): void => {
          if (Array.isArray(m)) {
            for (const item of m) findFmt(item);
            return;
          }
          if (!isOOXMLNode(m)) return;
          if ('w:numFmt' in m) {
            const v = String(attrsOf(m)?.['@_w:val'] ?? '');
            if (v === 'bullet') fmt = 'bullet';
            return; // first numFmt (level 0) wins
          }
          for (const k of Object.keys(m)) if (k !== ':@') findFmt(m[k]);
        };
        findFmt(n['w:abstractNum']);
        if (id) abstractFmt.set(id, fmt);
      }
      if ('w:num' in n) {
        const numId = String(attrsOf(n)?.['@_w:numId'] ?? '');
        let abstractId = '';
        const findAbstract = (m: OOXMLValue): void => {
          if (Array.isArray(m)) {
            for (const item of m) findAbstract(item);
            return;
          }
          if (!isOOXMLNode(m)) return;
          if ('w:abstractNumId' in m) {
            abstractId = String(attrsOf(m)?.['@_w:val'] ?? '');
            return;
          }
          for (const k of Object.keys(m)) if (k !== ':@') findAbstract(m[k]);
        };
        findAbstract(n['w:num']);
        if (numId && abstractId) numToAbstract.set(numId, abstractId);
      }
      for (const k of Object.keys(n)) if (k !== ':@') scan(n[k]);
    };
    scan(tree);

    const out = new Map<string, 'bullet' | 'ordered'>();
    numToAbstract.forEach((abstractId, numId) => {
      out.set(numId, abstractFmt.get(abstractId) ?? 'ordered');
    });
    return out;
  } catch {
    return null;
  }
}

function resolveNoteTexts(node: OOXMLValue, notesMap: Map<string, string>): string[] {
  const texts: string[] = [];
  const recurse = (item: OOXMLValue): void => {
    if (Array.isArray(item)) {
      for (const val of item) recurse(val);
      return;
    }
    if (!isOOXMLNode(item)) return;
    for (const k of Object.keys(item)) {
      if (k === 'w:footnoteReference') {
        const attrs = isOOXMLNode(item[':@']) ? (item[':@'] as OOXMLNode) : undefined;
        const id = String(attrs?.['@_w:id'] ?? '');
        if (id) {
          const text = notesMap.get(`w:footnote_${id}`);
          if (text) texts.push(text);
        }
      } else if (k === 'w:endnoteReference') {
        const attrs = isOOXMLNode(item[':@']) ? (item[':@'] as OOXMLNode) : undefined;
        const id = String(attrs?.['@_w:id'] ?? '');
        if (id) {
          const text = notesMap.get(`w:endnote_${id}`);
          if (text) texts.push(text);
        }
      } else if (k !== ':@') {
        recurse(item[k]);
      }
    }
  };
  recurse(node);
  return texts;
}

function walk(node: OOXMLValue, out: ParagraphNode[], notesMap: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, notesMap);
    return;
  }
  if (!isOOXMLNode(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'w:tbl') {
      const rows = extractTableRows(node[key]);
      if (rows.length > 0) {
        const tableFootnotes = resolveNoteTexts(node[key], notesMap);
        const para: ParagraphNode = {
          text: rows.map((r) => r.join('\t')).join('\n'),
          table: rows,
        };
        if (tableFootnotes.length > 0) {
          para.footnote = tableFootnotes.join('\n');
        }
        out.push(para);
      }
      // Do NOT recurse — cell paragraphs are already captured in `rows`.
    } else if (key === 'w:p') {
      const textParts = [extractParagraphText(node[key])];
      const referencedTexts = resolveNoteTexts(node[key], notesMap);
      let isResolvedFootnote = false;
      if (referencedTexts.length > 0) {
        textParts.push(...referencedTexts);
        isResolvedFootnote = true;
      }
      const text = textParts.join(' ').trim();
      const style = extractStyle(node[key]);
      const runs = extractParagraphRuns(node[key]);
      const listInfo = extractListInfo(node[key]);
      const para: ParagraphNodeInternal = { text, style, runs };
      if (isResolvedFootnote) {
        para.isResolvedFootnote = true;
      }
      if (listInfo) {
        para.list = { type: 'ordered', level: listInfo.ilvl }; // refined via numbering.xml
        para.numId = listInfo.numId;
      }
      out.push(para);
    } else if (key !== ':@') {
      walk(node[key], out, notesMap);
    }
  }
}

/** Rows × cells plain text from a w:tbl node. Nested tables flatten into cell text. */
function extractTableRows(tblNode: OOXMLValue): string[][] {
  const rows: string[][] = [];
  const visitRows = (n: OOXMLValue): void => {
    if (Array.isArray(n)) {
      for (const item of n) visitRows(item);
      return;
    }
    if (!isOOXMLNode(n)) return;
    for (const k of Object.keys(n)) {
      if (k === 'w:tr') {
        const cells: string[] = [];
        const visitCells = (c: OOXMLValue): void => {
          if (Array.isArray(c)) {
            for (const item of c) visitCells(item);
            return;
          }
          if (!isOOXMLNode(c)) return;
          for (const ck of Object.keys(c)) {
            if (ck === 'w:tc') {
              cells.push(extractParagraphText(c[ck]).trim());
            } else if (ck !== ':@') {
              visitCells(c[ck]);
            }
          }
        };
        visitCells(n[k]);
        if (cells.length > 0) rows.push(cells);
      } else if (k !== ':@') {
        visitRows(n[k]);
      }
    }
  };
  visitRows(tblNode);
  return rows;
}

/** numId + ilvl from w:pPr/w:numPr, or null when not a list paragraph. */
function extractListInfo(pNode: OOXMLValue): { numId: string; ilvl: number } | null {
  let numId: string | null = null;
  let ilvl = 0;
  const recurse = (n: OOXMLValue): void => {
    if (Array.isArray(n)) {
      for (const item of n) recurse(item);
      return;
    }
    if (!isOOXMLNode(n)) return;
    const attrs = isOOXMLNode(n[':@']) ? (n[':@'] as OOXMLNode) : undefined;
    if ('w:numId' in n && attrs?.['@_w:val'] !== undefined) {
      numId = String(attrs['@_w:val']);
    }
    if ('w:ilvl' in n && attrs?.['@_w:val'] !== undefined) {
      ilvl = Number(attrs['@_w:val']) || 0;
    }
    for (const k of Object.keys(n)) {
      if (k === 'w:pPr' || k === 'w:numPr' || Array.isArray(n[k])) recurse(n[k]);
    }
  };
  recurse(pNode);
  return numId !== null ? { numId, ilvl } : null;
}

/** A superscript run that is purely a numeric citation (e.g. "1", "6,7",
 *  "9–11") — Word formats Vancouver citations this way instead of using literal
 *  superscript characters. */
const SUPERSCRIPT_CITATION_SHAPE = /^\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*$/;

type RunContent = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
};

/** Read a single w:r node: its concatenated text plus bold/italic/underline and
 *  whether it carries superscript vertical alignment. */
function readRunContent(rNode: OOXMLValue): RunContent {
  let text = '';
  let bold = false;
  let italic = false;
  let underline = false;
  let superscript = false;

  const walkRun = (rn: OOXMLValue) => {
    if (Array.isArray(rn)) {
      for (const item of rn) walkRun(item);
      return;
    }
    if (!isOOXMLNode(rn)) return;

    for (const key of Object.keys(rn)) {
      if (key === 'w:rPr') {
        const checkPr = (pr: OOXMLValue) => {
          if (Array.isArray(pr)) {
            for (const item of pr) checkPr(item);
            return;
          }
          if (!isOOXMLNode(pr)) return;
          if ('w:b' in pr) bold = true;
          if ('w:i' in pr) italic = true;
          if ('w:u' in pr) underline = true;
          if ('w:vertAlign' in pr) {
            const attrs = isOOXMLNode(pr[':@']) ? (pr[':@'] as OOXMLNode) : undefined;
            if (String(attrs?.['@_w:val'] ?? '') === 'superscript') superscript = true;
          }
        };
        checkPr(rn[key]);
      } else if (key === 'w:t') {
        const t = rn[key];
        if (Array.isArray(t)) {
          for (const inner of t) {
            if (isOOXMLNode(inner) && '#text' in inner) text += String(inner['#text']);
          }
        } else if (isOOXMLNode(t) && '#text' in t) {
          text += String(t['#text']);
        } else if (typeof t === 'string') {
          text += t;
        }
      } else if (key === 'w:tab') {
        text += '\t';
      } else if (key === 'w:br') {
        text += '\n';
      } else if (key !== ':@') {
        walkRun(rn[key]);
      }
    }
  };

  walkRun(rNode);
  return { text, bold, italic, underline, superscript };
}

/** Last non-space character of `s`, used to tell citations from units. */
function lastMeaningfulChar(s: string): string {
  const trimmed = s.replace(/\s+$/, '');
  return trimmed.slice(-1);
}

/** Wrap superscript-formatted numeric citations in brackets so the marker
 *  detector recognizes them (Word stores these as superscript runs, not literal
 *  ¹² characters, which would otherwise be lost as plain digits on import).
 *  `prevChar` is the character preceding this run, used to skip exponents
 *  (10⁹) and units (m², R²) that are not citations. */
function citationText(run: RunContent, prevChar: string): string {
  if (!run.superscript || !SUPERSCRIPT_CITATION_SHAPE.test(run.text)) return run.text;
  const trimmed = run.text.trim();
  // Exponent / scientific notation, e.g. 10⁹ — preceded by a digit.
  if (/\d/.test(prevChar)) return run.text;
  // Unit or statistic, e.g. m², R² — a lone 2/3 stuck to a letter.
  if (/^[23]$/.test(trimmed) && /[a-zA-Z]/.test(prevChar)) return run.text;
  return `[${trimmed}]`;
}

function extractParagraphText(pNode: OOXMLValue): string {
  const parts: string[] = [];
  let prevChar = '';
  const push = (s: string) => {
    if (!s) return;
    parts.push(s);
    const c = lastMeaningfulChar(s);
    if (c) prevChar = c;
  };
  const recurse = (n: OOXMLValue) => {
    if (Array.isArray(n)) {
      for (const item of n) recurse(item);
      return;
    }
    if (!isOOXMLNode(n)) return;
    for (const k of Object.keys(n)) {
      if (k === 'w:r') {
        push(citationText(readRunContent(n[k]), prevChar));
      } else if (k === 'w:t') {
        // Stray text not wrapped in a run (rare).
        const t = n[k];
        if (Array.isArray(t)) {
          for (const inner of t) {
            if (isOOXMLNode(inner) && '#text' in inner) push(String(inner['#text']));
          }
        } else if (isOOXMLNode(t) && '#text' in t) {
          push(String(t['#text']));
        } else if (typeof t === 'string') {
          push(t);
        }
      } else if (k === 'w:tab') {
        push('\t');
      } else if (k === 'w:br') {
        push('\n');
      } else if (k !== ':@') {
        recurse(n[k]);
      }
    }
  };
  recurse(pNode);
  return parts.join('');
}

function extractParagraphRuns(pNode: OOXMLValue): ImportRun[] {
  const runs: ImportRun[] = [];
  let prevChar = '';

  const recurse = (n: OOXMLValue) => {
    if (Array.isArray(n)) {
      for (const item of n) recurse(item);
      return;
    }
    if (!isOOXMLNode(n)) return;

    for (const k of Object.keys(n)) {
      if (k === 'w:r') {
        const content = readRunContent(n[k]);
        const text = citationText(content, prevChar);
        if (text.length > 0) {
          runs.push({
            text,
            bold: content.bold || undefined,
            italic: content.italic || undefined,
            underline: content.underline || undefined,
          });
          const c = lastMeaningfulChar(text);
          if (c) prevChar = c;
        }
      } else if (k === 'w:tab') {
        runs.push({ text: '\t' });
        prevChar = '\t';
      } else if (k === 'w:br') {
        runs.push({ text: '\n' });
        prevChar = '\n';
      } else if (k !== ':@') {
        recurse(n[k]);
      }
    }
  };

  recurse(pNode);
  return runs;
}

function extractStyle(pNode: OOXMLValue): string | undefined {
  const recurse = (n: OOXMLValue): string | undefined => {
    if (Array.isArray(n)) {
      for (const item of n) {
        const r = recurse(item);
        if (r) return r;
      }
      return undefined;
    }
    if (!isOOXMLNode(n)) return undefined;
    if (n['w:pStyle']) {
      const pStyle = n['w:pStyle'];
      const attrs = (isOOXMLNode(pStyle) ? pStyle[':@'] : undefined) ?? n[':@'];
      const v = isOOXMLNode(attrs) ? attrs['@_w:val'] : undefined;
      // Attribute values are strings (parseAttributeValue: false), so this guard
      // narrows the type without altering observed behavior.
      if (typeof v === 'string' && v) return v;
    }
    for (const k of Object.keys(n)) {
      if (k === 'w:pPr') {
        const r = recurse(n[k]);
        if (r) return r;
      }
    }
    return undefined;
  };
  return recurse(pNode);
}

export function extractPlainTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  return parseDocx(arrayBuffer).then((r) => r.plainText);
}
