import type { PDFDocumentProxy } from 'pdfjs-dist';

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi;
const PMID_RE = /\bPMID:?\s*(\d{4,10})\b/gi;
const ARXIV_RE = /\barXiv:\s*(\d{4}\.\d{4,5})/gi;

export type ExtractedIds = {
  dois: string[];
  pmids: string[];
  arxivIds: string[];
};

export type ExtractedPdfMeta = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
};

function clean(doi: string): string {
  return doi.replace(/[.,;)]+$/, '').trim();
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.map((x) => x.toLowerCase()))).map((lc) =>
    xs.find((x) => x.toLowerCase() === lc) ?? lc,
  );
}

export async function getPdfText(doc: PDFDocumentProxy, maxPages = 30): Promise<string> {
  const limit = Math.min(doc.numPages, maxPages);
  const parts: string[] = [];
  for (let i = 1; i <= limit; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .filter(Boolean)
      .join(' ');
    parts.push(line);
  }
  return parts.join('\n');
}

export function extractIds(text: string): ExtractedIds {
  const dois = uniq(Array.from(text.matchAll(DOI_RE), (m) => clean(m[0])));
  const pmids = uniq(Array.from(text.matchAll(PMID_RE), (m) => m[1]));
  const arxivIds = uniq(Array.from(text.matchAll(ARXIV_RE), (m) => m[1]));
  return { dois, pmids, arxivIds };
}

export async function getPdfMetadata(doc: PDFDocumentProxy): Promise<ExtractedPdfMeta> {
  try {
    const m = await doc.getMetadata();
    const info = (m.info ?? {}) as Record<string, unknown>;
    return {
      title: typeof info.Title === 'string' ? info.Title : undefined,
      author: typeof info.Author === 'string' ? info.Author : undefined,
      subject: typeof info.Subject === 'string' ? info.Subject : undefined,
      keywords: typeof info.Keywords === 'string' ? info.Keywords : undefined,
    };
  } catch {
    return {};
  }
}
