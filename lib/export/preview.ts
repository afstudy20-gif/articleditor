/**
 * On-screen export preview. Reuses the print-HTML snapshot pipeline
 * (lib/export/print-html.ts) but renders into an iframe `srcdoc` as an A4
 * sheet, with an optional MDPI/JCM theme approximating the production layout
 * (Palatino, wide left gutter, 18pt bold title, 9pt references).
 *
 * Pure builders only — the editor client supplies the cloned body HTML and
 * mounts the iframe.
 */

import {
  buildPrintDocumentHtml,
  printStylesheet,
  PRINT_HOST_CLASS,
  type PrintManuscriptInput,
} from './print-html';

export type PreviewTheme = 'standard' | 'mdpi';

export type ExportPreviewInput = PrintManuscriptInput & {
  theme?: PreviewTheme;
  /** Article-type line shown above the title in the MDPI theme. */
  articleType?: string;
};

/** Screen stylesheet: show the print host as a paper sheet. */
function screenSheetCss(): string {
  return `
html, body { margin: 0; padding: 0; background: #e5e7eb; }
.${PRINT_HOST_CLASS} { display: block !important; }
.enr-preview-sheet {
  background: #fff;
  width: 21cm;
  min-height: 29.7cm;
  margin: 1rem auto;
  padding: 2.5cm;
  box-sizing: border-box;
  box-shadow: 0 2px 12px rgba(0,0,0,.25);
}
@media (max-width: 900px) { .enr-preview-sheet { width: auto; margin: 0; box-shadow: none; } }
`;
}

/** MDPI/JCM production-layout approximation (jcm-*-layout version.docx). */
function mdpiThemeCss(): string {
  return `
.enr-preview-sheet { padding: 2.5cm 1.27cm 1.6cm; }
.${PRINT_HOST_CLASS} { font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, serif; }
.${PRINT_HOST_CLASS} .enr-print-doc { font-size: 10pt; line-height: 1.4; }
.enr-preview-articletype { font-style: italic; margin: 0 0 .4em; }
.${PRINT_HOST_CLASS} .enr-print-title {
  font-size: 18pt; font-weight: 700; text-align: left; margin: 0 0 .8em;
}
/* JCM keeps a ~4.6cm left gutter for margin notes on body content. */
.${PRINT_HOST_CLASS} .enr-print-abstract,
.${PRINT_HOST_CLASS} .enr-print-body { margin-left: 4.6cm; }
.${PRINT_HOST_CLASS} .enr-print-abstract h2 { font-size: 10pt; margin: 0 0 .3em; }
.${PRINT_HOST_CLASS} .enr-print-body h1 { font-size: 12pt; font-weight: 700; }
.${PRINT_HOST_CLASS} .enr-print-body h2 { font-size: 10pt; font-style: italic; font-weight: 400; }
.${PRINT_HOST_CLASS} .enr-print-body h3 { font-size: 10pt; font-weight: 400; }
.${PRINT_HOST_CLASS} .enr-print-body p { text-indent: .75cm; margin: 0 0 .2em; }
.${PRINT_HOST_CLASS} .enr-print-bib { margin-left: 0; }
.${PRINT_HOST_CLASS} .enr-print-bib h2 { font-size: 12pt; }
.${PRINT_HOST_CLASS} .enr-print-ref { font-size: 9pt; }
.${PRINT_HOST_CLASS} .enr-print-abstract p,
.${PRINT_HOST_CLASS} .enr-print-keywords { text-indent: 0; }
`;
}

/** Full standalone HTML document for an iframe `srcdoc`. */
export function buildExportPreviewSrcdoc(input: ExportPreviewInput): string {
  const theme = input.theme ?? 'standard';
  const inner = buildPrintDocumentHtml(input);
  const articleTypeHtml =
    theme === 'mdpi' && input.articleType?.trim()
      ? `<p class="enr-preview-articletype">${escape(input.articleType.trim())}</p>`
      : '';
  const css = [printStylesheet(), screenSheetCss(), theme === 'mdpi' ? mdpiThemeCss() : ''].join(
    '\n',
  );
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + `<style>${css}</style></head><body>`
    + `<div class="enr-preview-sheet"><div class="${PRINT_HOST_CLASS}">${articleTypeHtml}${inner}</div></div>`
    + '</body></html>'
  );
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
