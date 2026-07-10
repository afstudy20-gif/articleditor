/**
 * Client-side PDF → Markdown conversion for the "PDF folder → citation
 * library" import flow. Ports the approach from the sibling `paper`
 * project's reference checker (frontend/src/lib/pdfText.js): per-page
 * text-layer extraction via pdf.js, no server upload — everything stays in
 * the browser, matching ARTED's privacy-first architecture.
 *
 * Table and figure fidelity (researched — see docs note in the PR/commit
 * that introduced this): the state-of-the-art open-source converters
 * (Marker, Docling, pymupdf4llm, MinerU) all use server-side ML/CV models
 * and are Python-only — out of scope for a browser-only, no-upload tool.
 * What IS feasible client-side, implemented here:
 *  - Simple grid tables: detect large horizontal gaps between adjacent
 *    text items on a line (a real column boundary, not normal word
 *    spacing) and render aligned runs of such lines as a Markdown pipe
 *    table. This is the same heuristic class described in prior art for
 *    pdf.js-based table extraction — deliberately conservative (requires
 *    a consistent cell count across ≥2 adjacent lines) so ordinary
 *    justified prose is never misrendered as a table.
 *  - Figures: embedded raster images are extracted via pdf.js's operator
 *    list (`OPS.paintImageXObject` + `page.objs`) after rendering the page
 *    (which is what resolves those objects) and embedded as Markdown
 *    image refs. Small images (icons/logos) are filtered out by area.
 * For complex multi-span or rotated tables this heuristic will still fall
 * back to plain text — for those, ARTED's image-to-table AI tool
 * (vision-model based, see lib/tables/image-table.ts) is the more reliable
 * path; screenshot the table and run it through that tool instead.
 *
 * No OCR fallback (unlike paper's tesseract.js path): the overwhelming
 * majority of academic PDFs have a real text layer, and adding a WASM OCR
 * engine is a meaningfully heavier dependency than this feature needs.
 * Scanned-only PDFs will simply yield an empty/short document, which the
 * caller (PdfFolderImportModal) reports as a failed file.
 *
 * Known limitation (found during manual testing, not fixed here): pdf.js's
 * WORKER-based `getTextContent()` — the path this module and every other
 * pdf.js consumer in ARTED uses — occasionally decodes a page's content
 * stream incorrectly (truncated or garbled `str` values) for PDFs using
 * uncommon filter combinations (e.g. ASCII85Decode stacked with
 * FlateDecode/DCTDecode on the content stream), even though pdf.js's
 * non-worker "legacy" build parses the identical file correctly. This is a
 * pre-existing pdf.js worker/main-thread parity gap, not something
 * introduced by the table/figure logic above — verified by testing the
 * table/line reconstruction in isolation against clean pdf.js output, where
 * it renders correctly. In practice this filter combination is rare for
 * real academic PDFs (LaTeX/Word/Adobe exporters use plain FlateDecode);
 * it surfaced here only via a PDF generator (reportlab) that defaults to
 * it. No detection/fallback is implemented for this — out of scope.
 */

import { loadPdfjs } from './worker';

export type PdfPageExtraction = {
  pageNo: number;
  text: string;
  images: string[];
};

export type PdfMarkdownResult = {
  /** Human-readable Markdown document (title heading + page text + figures). */
  markdown: string;
  /** Plain concatenated text — what lib/refs/article-metadata.ts parses. */
  text: string;
  totalPages: number;
  /** Pages that yielded a non-trivial text layer. */
  textPages: number;
  /** Data-URI PNGs of extracted figures, across all pages. */
  images: string[];
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

/** Builds the Markdown document from per-page text and figures. Pure — easy to test. */
export function buildPdfMarkdown(filename: string, pages: PdfPageExtraction[]): string {
  const heading = articleTitleFromFilename(filename);
  const nonEmpty = pages.filter((p) => p.text.trim().length > 0);
  const totalImages = pages.reduce((n, p) => n + p.images.length, 0);
  const body = pages
    .map((p) => {
      const figs = p.images
        .map((src, i) => `![Figure p.${p.pageNo}.${i + 1}](${src})`)
        .join('\n\n');
      return [p.text, figs].filter(Boolean).join('\n\n');
    })
    .join('\n\n');
  const header = [
    `# ${heading}`,
    '',
    `Source PDF: ${filename}`,
    `Extracted pages: ${nonEmpty.length}/${pages.length}`,
  ];
  if (totalImages > 0) header.push(`Extracted figures: ${totalImages}`);
  return [...header, '', body, ''].join('\n');
}

// ─── Text-item → line/cell reconstruction ──────────────────────────────

export type PositionedItem = { str: string; x: number; y: number; width: number; hasEOL: boolean };
export type Line = { y: number; items: PositionedItem[] };

type PdfTextItem = { str?: string; transform?: number[]; width?: number; hasEOL?: boolean };

function toPositionedItems(items: unknown[]): PositionedItem[] {
  const out: PositionedItem[] = [];
  for (const raw of items as PdfTextItem[]) {
    const str = (raw.str ?? '').trim();
    if (!str) continue;
    out.push({
      str,
      x: raw.transform?.[4] ?? 0,
      y: raw.transform?.[5] ?? 0,
      width: raw.width ?? 0,
      hasEOL: Boolean(raw.hasEOL),
    });
  }
  return out;
}

/** Groups positioned text items into lines by Y position (4px tolerance). */
export function groupIntoLines(items: PositionedItem[], yTolerance = 4): Line[] {
  const lines: Line[] = [];
  let current: PositionedItem[] = [];
  let lastY: number | null = null;

  const flush = (): void => {
    if (current.length > 0) lines.push({ y: current[0].y, items: current });
    current = [];
  };

  for (const item of items) {
    if (lastY !== null && Math.abs(item.y - lastY) > yTolerance && current.length > 0) {
      flush();
    }
    current.push(item);
    if (item.hasEOL) flush();
    lastY = item.y;
  }
  flush();
  return lines;
}

const CELL_GAP_THRESHOLD = 18;

/**
 * Splits one line's items into cells wherever the horizontal gap between
 * adjacent items exceeds CELL_GAP_THRESHOLD (device-space units) — a real
 * visual column gap, not normal inter-word spacing (~2-6 units).
 */
export function splitLineIntoCells(items: PositionedItem[], gapThreshold = CELL_GAP_THRESHOLD): string[] {
  if (items.length === 0) return [];
  const cells: string[] = [];
  let current = items[0].str;
  let prevEnd = items[0].x + items[0].width;

  for (let i = 1; i < items.length; i += 1) {
    const item = items[i];
    const gap = item.x - prevEnd;
    if (gap > gapThreshold) {
      cells.push(current.trim());
      current = item.str;
    } else {
      current += current ? ` ${item.str}` : item.str;
    }
    prevEnd = item.x + item.width;
  }
  cells.push(current.trim());
  return cells;
}

function escapeTableCell(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

/** Renders a run of equal-width cell rows as a GitHub-flavored Markdown table. */
export function renderMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const cols = rows[0].length;
  const header = rows[0];
  const separator = Array.from({ length: cols }, () => '---');
  const body = rows.slice(1);
  const fmt = (r: string[]): string => `| ${r.map(escapeTableCell).join(' | ')} |`;
  return [fmt(header), fmt(separator), ...body.map(fmt)].join('\n');
}

const MIN_TABLE_COLS = 3;
const MIN_TABLE_ROWS = 2;

/**
 * Walks a page's reconstructed lines, rendering contiguous runs of ≥2 lines
 * that each split into the same number of ≥3 cells as a Markdown table,
 * and every other line as plain text. Conservative by design — a single
 * mismatched line ends the run, so normal prose is never misrendered.
 */
export function renderLinesAsMarkdown(lines: Line[]): string {
  const out: string[] = [];
  let run: string[][] = [];

  const flushRun = (): void => {
    if (run.length >= MIN_TABLE_ROWS) {
      out.push(renderMarkdownTable(run));
    } else {
      for (const row of run) out.push(row.join(' '));
    }
    run = [];
  };

  for (const line of lines) {
    const cells = splitLineIntoCells(line.items);
    if (cells.length >= MIN_TABLE_COLS && (run.length === 0 || cells.length === run[0].length)) {
      run.push(cells);
      continue;
    }
    flushRun();
    out.push(cells.join(' '));
  }
  flushRun();

  return out.join('\n');
}

/**
 * Extracts page text, reconstructing lines and — conservatively — simple
 * grid tables. Falls back to plain text when no table pattern is found.
 */
async function extractPageText(page: { getTextContent: () => Promise<{ items: unknown[] }> }): Promise<string> {
  const content = await page.getTextContent();
  const items = toPositionedItems(content.items);
  const lines = groupIntoLines(items);
  return renderLinesAsMarkdown(lines);
}

// ─── Figure extraction ──────────────────────────────────────────────────

const MIN_FIGURE_AREA = 100 * 100;

type PdfjsModule = Awaited<ReturnType<typeof loadPdfjs>>;

/**
 * Extracts embedded raster images from a page as PNG data URIs. Must run
 * AFTER `page.render(...)` — that's what decodes XObjects into `page.objs`,
 * pdf.js's own resolution mechanism. Failures are per-image and swallowed:
 * one bad image must never break text extraction for the rest of the page.
 */
async function extractPageImages(
  page: {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get: (id: string) => Promise<unknown> };
  },
  pdfjs: PdfjsModule,
): Promise<string[]> {
  const opList = await page.getOperatorList();
  const images: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < opList.fnArray.length; i += 1) {
    if (opList.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const objId = opList.argsArray[i]?.[0];
    if (typeof objId !== 'string' || seen.has(objId)) continue;
    seen.add(objId);
    try {
      const img = (await page.objs.get(objId)) as
        | { width?: number; height?: number; data?: Uint8ClampedArray; bitmap?: ImageBitmap }
        | null;
      if (!img?.width || !img.height || img.width * img.height < MIN_FIGURE_AREA) continue;
      const dataUri = renderImageToPngDataUri(img);
      if (dataUri) images.push(dataUri);
    } catch {
      // Object never resolved (e.g. inline mask, unsupported colorspace) — skip it.
    }
  }
  return images;
}

function renderImageToPngDataUri(img: {
  width?: number;
  height?: number;
  data?: Uint8ClampedArray;
  bitmap?: ImageBitmap;
}): string | null {
  if (!img.width || !img.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const channels = img.data.length / (img.width * img.height);
    const rgba = new Uint8ClampedArray(img.width * img.height * 4);
    if (channels === 4) {
      rgba.set(img.data);
    } else if (channels === 3) {
      for (let px = 0; px < img.width * img.height; px += 1) {
        rgba[px * 4] = img.data[px * 3];
        rgba[px * 4 + 1] = img.data[px * 3 + 1];
        rgba[px * 4 + 2] = img.data[px * 3 + 2];
        rgba[px * 4 + 3] = 255;
      }
    } else {
      return null;
    }
    ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  } else {
    return null;
  }
  return canvas.toDataURL('image/png');
}

/**
 * Extracts text (with best-effort table detection) and figures page-by-page,
 * returning a Markdown document plus the plain text used for metadata
 * extraction.
 */
export async function pdfFileToMarkdown(
  file: File,
  onPageProgress?: (info: { pageNo: number; totalPages: number }) => void,
  opts: { extractImages?: boolean } = {},
): Promise<PdfMarkdownResult> {
  if (typeof window === 'undefined') {
    throw new Error('PDF conversion is available only in the browser.');
  }
  const extractImages = opts.extractImages ?? true;
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

      let images: string[] = [];
      if (extractImages) {
        try {
          // Rendering resolves page.objs — required before extractPageImages
          // can read embedded XObjects. Discarded immediately after.
          const viewport = page.getViewport({ scale: 1 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            images = await extractPageImages(page, pdfjs);
          }
          canvas.width = 0;
          canvas.height = 0;
        } catch {
          // Rendering/extraction failure never blocks text extraction.
        }
      }

      pages.push({ pageNo, text, images });
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
    images: pages.flatMap((p) => p.images),
  };
}
