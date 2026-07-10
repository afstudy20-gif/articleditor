/**
 * Client-side PDF → Markdown conversion for the "PDF folder → citation
 * library" import flow. Ports the approach from the sibling `paper`
 * project's reference checker (frontend/src/lib/pdfText.js): per-page
 * text-layer extraction via pdf.js, no server upload — everything stays in
 * the browser, matching ARTED's privacy-first architecture.
 *
 * No OCR fallback (unlike paper's tesseract.js path): the overwhelming
 * majority of academic PDFs have a real text layer, and adding a WASM OCR
 * engine is a meaningfully heavier dependency than this feature needs.
 * Scanned-only PDFs will simply yield an empty/short document, which the
 * caller (PdfFolderImportModal) reports as a failed file.
 */

import { loadPdfjs } from './worker';

export type PdfPageExtraction = {
  pageNo: number;
  text: string;
};

export type PdfMarkdownResult = {
  /** Human-readable Markdown document (title heading + page text). */
  markdown: string;
  /** Plain concatenated text — what lib/refs/article-metadata.ts parses. */
  text: string;
  totalPages: number;
  /** Pages that yielded a non-trivial text layer. */
  textPages: number;
};

/** Strip a file extension and collapse separators into single spaces. */
export function articleTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^./\\]+$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MIN_PAGE_TEXT_CHARS = 20;

/** Builds the Markdown document from per-page text. Pure — easy to test. */
export function buildPdfMarkdown(filename: string, pages: PdfPageExtraction[]): string {
  const heading = articleTitleFromFilename(filename);
  const nonEmpty = pages.filter((p) => p.text.trim().length > 0);
  return [
    `# ${heading}`,
    '',
    `Source PDF: ${filename}`,
    `Extracted pages: ${nonEmpty.length}/${pages.length}`,
    '',
    pages.map((p) => p.text).join('\n\n'),
    '',
  ].join('\n');
}

type PdfTextItem = { str?: string; transform?: number[]; hasEOL?: boolean };

/**
 * Reconstructs lines from pdf.js's flat text-item list using each item's Y
 * position (transform[5]) — pdf.js's own `str` values carry no line breaks.
 * Matches the line-reconstruction approach in lib/phrasebank/pdf.ts; without
 * it, title/abstract detection in lib/refs/article-metadata.ts (which is
 * line-based) sees one run-on line per page and fails.
 */
async function extractPageText(page: { getTextContent: () => Promise<{ items: unknown[] }> }): Promise<string> {
  const content = await page.getTextContent();
  const lines: string[] = [];
  let current = '';
  let lastY: number | null = null;

  for (const raw of content.items as PdfTextItem[]) {
    const str = (raw.str ?? '').trim();
    if (!str) continue;
    const y = raw.transform?.[5] ?? null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4 && current.trim()) {
      lines.push(current.trim());
      current = '';
    }
    current += current ? ` ${str}` : str;
    if (raw.hasEOL && current.trim()) {
      lines.push(current.trim());
      current = '';
    }
    lastY = y;
  }
  if (current.trim()) lines.push(current.trim());

  return lines.join('\n');
}

/**
 * Extracts text page-by-page and returns both a Markdown document and the
 * plain concatenated text used for metadata extraction.
 */
export async function pdfFileToMarkdown(
  file: File,
  onPageProgress?: (info: { pageNo: number; totalPages: number }) => void,
): Promise<PdfMarkdownResult> {
  if (typeof window === 'undefined') {
    throw new Error('PDF conversion is available only in the browser.');
  }
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const pages: PdfPageExtraction[] = [];
  let textPages = 0;

  try {
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const text = await extractPageText(page);
      if (text.length >= MIN_PAGE_TEXT_CHARS) textPages += 1;
      pages.push({ pageNo, text });
      onPageProgress?.({ pageNo, totalPages: doc.numPages });
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    markdown: buildPdfMarkdown(file.name, pages),
    text: pages.map((p) => p.text).join('\n\n'),
    totalPages: doc.numPages,
    textPages,
  };
}
