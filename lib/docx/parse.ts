import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export type DocxParseResult = {
  paragraphs: ParagraphNode[];
  plainText: string;
  zip: JSZip;
  documentXml: string;
};

export type ParagraphNode = {
  text: string;
  style?: string;
};

const W_NS = '@_xmlns:w';

export async function parseDocx(file: ArrayBuffer | Uint8Array | Blob): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(file as any);
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
  const parsed = parser.parse(documentXml);
  const paragraphs: ParagraphNode[] = [];
  walk(parsed, paragraphs);

  const plainText = paragraphs.map((p) => p.text).join('\n');
  return { paragraphs, plainText, zip, documentXml };
}

function walk(node: any, out: ParagraphNode[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    if (key === 'w:p') {
      const text = extractParagraphText(node[key]);
      const style = extractStyle(node[key]);
      out.push({ text, style });
    } else if (key !== ':@') {
      walk(node[key], out);
    }
  }
}

function extractParagraphText(pNode: any): string {
  const parts: string[] = [];
  const recurse = (n: any) => {
    if (Array.isArray(n)) {
      for (const item of n) recurse(item);
      return;
    }
    if (!n || typeof n !== 'object') return;
    for (const k of Object.keys(n)) {
      if (k === 'w:t') {
        const t = n[k];
        if (Array.isArray(t)) {
          for (const inner of t) {
            if (inner && typeof inner === 'object' && '#text' in inner) parts.push(String(inner['#text']));
          }
        } else if (t && typeof t === 'object' && '#text' in t) {
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

function extractStyle(pNode: any): string | undefined {
  const recurse = (n: any): string | undefined => {
    if (Array.isArray(n)) {
      for (const item of n) {
        const r = recurse(item);
        if (r) return r;
      }
      return undefined;
    }
    if (!n || typeof n !== 'object') return undefined;
    if (n['w:pStyle']) {
      const attrs = n['w:pStyle']?.[':@'] ?? n[':@'];
      const v = attrs?.['@_w:val'];
      if (v) return v;
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
