/**
 * Browser "Save as PDF" support.
 *
 * Rather than rasterising the manuscript with a heavy PDF library, we reuse the
 * browser's own print-to-PDF pipeline: a faithful HTML snapshot of the live
 * editor (which already has citation markers, figure images, KaTeX equations
 * and three-line tables rendered by the TipTap node views) is dropped into a
 * print host in the SAME document, styled with an academic print stylesheet,
 * and handed to `window.print()`. Staying in the same document keeps blob image
 * URLs valid, which a separate print window could not load.
 *
 * Only the pure HTML/CSS builders live here so they can be unit tested; the DOM
 * glue (cloning the editor, injecting the host) stays in the editor client.
 */

import type { Ref } from '@/store/types';
import { formatBibEntry, type StyleId } from '@/lib/refs/styles';

export const PRINT_STYLE_ID = 'enr-print-style';
export const PRINT_HOST_CLASS = 'enr-print-host';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PrintManuscriptInput {
  title: string;
  /** innerHTML cloned from the live editor DOM. */
  bodyHtml: string;
  /** References in final bibliography order. */
  orderedRefs: Ref[];
  style: StyleId;
  lang: 'tr' | 'en';
  abstractText?: string;
  keywords?: string[];
  bibHeading?: string;
  doubleSpaced?: boolean;
}

/**
 * Bibliography block as standalone HTML. Numeric styles bake their own marker
 * into each entry (e.g. "1. ", "[1] "), so entries render as hanging-indent
 * paragraphs rather than an ordered list to avoid double numbering.
 */
export function buildBibliographyHtml(
  orderedRefs: ReadonlyArray<Ref>,
  style: StyleId,
  heading: string,
): string {
  if (orderedRefs.length === 0) return '';
  const entries = orderedRefs
    .map((ref, index) => formatBibEntry(style, ref, index + 1))
    .map((entry) => `<p class="enr-print-ref">${escapeHtml(entry)}</p>`)
    .join('');
  return `<section class="enr-print-bib"><h2>${escapeHtml(heading)}</h2>${entries}</section>`;
}

const DEFAULT_BIB_HEADING: Record<'tr' | 'en', string> = {
  tr: 'Kaynaklar',
  en: 'References',
};

/** Full manuscript markup to inject into the print host. */
export function buildPrintDocumentHtml(input: PrintManuscriptInput): string {
  const heading = (input.bibHeading ?? '').trim() || DEFAULT_BIB_HEADING[input.lang];
  const bibliography = buildBibliographyHtml(input.orderedRefs, input.style, heading);
  const title = input.title.trim();
  const titleHtml = title ? `<h1 class="enr-print-title">${escapeHtml(title)}</h1>` : '';
  const abstractText = input.abstractText?.trim();
  const keywords = normalizeKeywords(input.keywords);
  const abstractHtml = abstractText || keywords.length > 0
    ? `<section class="enr-print-abstract"><h2>Abstract</h2>${abstractText
        ? abstractText
            .split(/\n{2,}/)
            .map((part) => `<p>${escapeHtml(part.trim())}</p>`)
            .join('')
        : ''}${keywords.length > 0
        ? `<p class="enr-print-keywords"><strong>Keywords:</strong> ${escapeHtml(keywords.join('; '))}</p>`
        : ''}</section>`
    : '';
  const docClass = `enr-print-doc${input.doubleSpaced ? ' enr-print-double' : ''}`;
  return (
    `<article class="${docClass}">` +
    titleHtml +
    abstractHtml +
    `<div class="enr-print-body">${input.bodyHtml}</div>` +
    bibliography +
    `</article>`
  );
}

function normalizeKeywords(keywords: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keyword of keywords ?? []) {
    const clean = keyword.trim().replace(/[;,]+$/g, '');
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Print-only stylesheet. Hides the application chrome while printing, then
 * styles the snapshot as a manuscript: Times New Roman, justified body,
 * three-line tables with numbered captions, centred figures.
 */
export function printStylesheet(): string {
  return `
@media screen {
  .${PRINT_HOST_CLASS} { display: none; }
}
@media print {
  @page { margin: 2.5cm; }
  html, body { background: #fff !important; }
  body > *:not(.${PRINT_HOST_CLASS}) { display: none !important; }
  .${PRINT_HOST_CLASS} { display: block !important; }
}
.${PRINT_HOST_CLASS} {
  color: #000;
  background: #fff;
  font-family: 'Times New Roman', Times, serif;
}
.${PRINT_HOST_CLASS} .enr-print-doc {
  counter-reset: enr-print-tbl;
  font-size: 12pt;
  line-height: 1.5;
}
.${PRINT_HOST_CLASS} .enr-print-double .enr-print-abstract,
.${PRINT_HOST_CLASS} .enr-print-double .enr-print-body,
.${PRINT_HOST_CLASS} .enr-print-double .enr-print-bib { line-height: 2; }
.${PRINT_HOST_CLASS} .enr-print-title {
  font-size: 16pt;
  font-weight: 700;
  text-align: center;
  margin: 0 0 1.4em;
}
.${PRINT_HOST_CLASS} .enr-print-body { text-align: justify; }
.${PRINT_HOST_CLASS} .enr-print-abstract { margin: 0 0 1em; text-align: justify; }
.${PRINT_HOST_CLASS} .enr-print-abstract h2 { font-size: 13.5pt; font-weight: 700; margin: 0 0 0.45em; }
.${PRINT_HOST_CLASS} .enr-print-abstract p { margin: 0 0 0.6em; }
.${PRINT_HOST_CLASS} .enr-print-body p { margin: 0 0 0.6em; }
.${PRINT_HOST_CLASS} .enr-print-body h1 { font-size: 15pt; font-weight: 700; margin: 1.1em 0 0.5em; }
.${PRINT_HOST_CLASS} .enr-print-body h2 { font-size: 13.5pt; font-weight: 700; margin: 1em 0 0.45em; }
.${PRINT_HOST_CLASS} .enr-print-body h3 { font-size: 12.5pt; font-weight: 700; margin: 0.9em 0 0.4em; }
.${PRINT_HOST_CLASS} .enr-print-body ul,
.${PRINT_HOST_CLASS} .enr-print-body ol { margin: 0 0 0.6em 1.4em; }
.${PRINT_HOST_CLASS} .enr-print-body blockquote {
  margin: 0 0 0.6em 1em;
  padding-left: 0.8em;
  border-left: 2px solid #888;
}
.${PRINT_HOST_CLASS} .enr-print-body figure { text-align: center; margin: 1em 0; page-break-inside: avoid; }
.${PRINT_HOST_CLASS} .enr-print-body figure img { max-width: 100%; height: auto; }
.${PRINT_HOST_CLASS} .enr-print-body figcaption { font-size: 10pt; margin-top: 0.4em; }
.${PRINT_HOST_CLASS} .enr-print-body table {
  counter-increment: enr-print-tbl;
  border-collapse: collapse;
  width: 100%;
  margin: 1em auto;
  font-size: 10.5pt;
  page-break-inside: avoid;
  border-top: 1.5px solid #000;
  border-bottom: 1.5px solid #000;
}
.${PRINT_HOST_CLASS} .enr-print-body table::before {
  content: "Table " counter(enr-print-tbl) ". " attr(data-table-title);
  display: table-caption;
  caption-side: top;
  padding-bottom: 0.4rem;
  text-align: left;
  font-weight: 700;
  font-size: 10.5pt;
}
.${PRINT_HOST_CLASS} .enr-print-body table[data-table-footnote]:not([data-table-footnote=""])::after {
  content: attr(data-table-footnote);
  display: table-caption;
  caption-side: bottom;
  padding-top: 0.35rem;
  text-align: left;
  font-size: 9.5pt;
}
.${PRINT_HOST_CLASS} .enr-print-body th,
.${PRINT_HOST_CLASS} .enr-print-body td {
  padding: 4px 8px;
  vertical-align: top;
  text-align: left;
}
.${PRINT_HOST_CLASS} .enr-print-body thead th,
.${PRINT_HOST_CLASS} .enr-print-body tr:first-child th {
  border-bottom: 0.75px solid #000;
  font-weight: 700;
}
.${PRINT_HOST_CLASS} .enr-print-bib h2 { font-size: 13.5pt; font-weight: 700; margin: 1.6em 0 0.6em; }
.${PRINT_HOST_CLASS} .enr-print-ref {
  margin: 0 0 0.4em;
  padding-left: 1.8em;
  text-indent: -1.8em;
  text-align: left;
}
`.trim();
}
