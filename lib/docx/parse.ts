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
  const paragraphs: ParagraphNode[] = [];
  walk(parsed, paragraphs);

  const plainText = paragraphs.map((p) => p.text).join('\n');
  return { paragraphs, plainText, zip, documentXml };
}

function walk(node: OOXMLValue, out: ParagraphNode[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return;
  }
  if (!isOOXMLNode(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'w:p') {
      const text = extractParagraphText(node[key]);
      const style = extractStyle(node[key]);
      const runs = extractParagraphRuns(node[key]);
      out.push({ text, style, runs });
    } else if (key !== ':@') {
      walk(node[key], out);
    }
  }
}

function extractParagraphText(pNode: OOXMLValue): string {
  const parts: string[] = [];
  const recurse = (n: OOXMLValue) => {
    if (Array.isArray(n)) {
      for (const item of n) recurse(item);
      return;
    }
    if (!isOOXMLNode(n)) return;
    for (const k of Object.keys(n)) {
      if (k === 'w:t') {
        const t = n[k];
        if (Array.isArray(t)) {
          for (const inner of t) {
            if (isOOXMLNode(inner) && '#text' in inner) parts.push(String(inner['#text']));
          }
        } else if (isOOXMLNode(t) && '#text' in t) {
          parts.push(String(t['#text']));
        } else if (typeof t === 'string') {
          parts.push(t);
        }
      } else if (k === 'w:tab') {
        parts.push('\t');
      } else if (k === 'w:br') {
        parts.push('\n');
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

  const recurse = (n: OOXMLValue) => {
    if (Array.isArray(n)) {
      for (const item of n) recurse(item);
      return;
    }
    if (!isOOXMLNode(n)) return;

    for (const k of Object.keys(n)) {
      if (k === 'w:r') {
        const rNode = n[k];
        let runText = '';
        let bold = false;
        let italic = false;
        let underline = false;

        const findPropsAndText = (rn: OOXMLValue) => {
          if (Array.isArray(rn)) {
            for (const item of rn) findPropsAndText(item);
            return;
          }
          if (!isOOXMLNode(rn)) return;

          for (const key of Object.keys(rn)) {
            if (key === 'w:rPr') {
              const rPr = rn[key];
              const checkPr = (pr: OOXMLValue) => {
                if (Array.isArray(pr)) {
                  for (const item of pr) checkPr(item);
                  return;
                }
                if (!isOOXMLNode(pr)) return;
                if ('w:b' in pr) bold = true;
                if ('w:i' in pr) italic = true;
                if ('w:u' in pr) underline = true;
                for (const subKey of Object.keys(pr)) {
                  if (subKey === 'w:b' || subKey === 'w:i' || subKey === 'w:u') {
                    if (subKey === 'w:b') bold = true;
                    if (subKey === 'w:i') italic = true;
                    if (subKey === 'w:u') underline = true;
                  }
                }
              };
              checkPr(rPr);
            } else if (key === 'w:t') {
              const t = rn[key];
              if (Array.isArray(t)) {
                for (const inner of t) {
                  if (isOOXMLNode(inner) && '#text' in inner) runText += String(inner['#text']);
                }
              } else if (isOOXMLNode(t) && '#text' in t) {
                runText += String(t['#text']);
              } else if (typeof t === 'string') {
                runText += t;
              }
            } else if (key === 'w:tab') {
              runText += '\t';
            } else if (key === 'w:br') {
              runText += '\n';
            } else if (key !== ':@') {
              findPropsAndText(rn[key]);
            }
          }
        };

        findPropsAndText(rNode);
        if (runText.length > 0) {
          runs.push({
            text: runText,
            bold: bold || undefined,
            italic: italic || undefined,
            underline: underline || undefined,
          });
        }
      } else if (k === 'w:tab') {
        runs.push({ text: '\t' });
      } else if (k === 'w:br') {
        runs.push({ text: '\n' });
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
