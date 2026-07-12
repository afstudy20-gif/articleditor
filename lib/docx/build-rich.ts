import JSZip from 'jszip';
import type { Ref } from '@/store/types';
import { escapeXml } from '@/lib/refs/enxml';
import {
  formatBibEntry,
  formatInTextCitation,
  orderRefsForBib,
  type StyleId,
  isSuperscriptCitationStyle,
} from '@/lib/refs/styles';
import {
  collectFigureLegends,
  type FigureCaptionPlacement,
} from '@/lib/figures/export-layout';
import { looksLikeAuthorByline } from '@/lib/markers/byline';
import { type BuildMode } from './build';
import { activeEndNoteField, assignRecNums, placeholderText } from './field-code';
import { NUMBERING_XML } from './numbering';
import {
  EMU_PER_PX,
  MAX_IMG_WIDTH_EMU,
  RICH_STYLES_XML,
  ROOT_RELS_XML,
  SETTINGS_XML,
  WORD_MIME,
  cleanCaptionPrefix,
  parseDataUrl,
  richContentTypesXml,
  sniffDimensions,
  textRun,
} from './ooxml';

export { sniffDimensions } from './ooxml';

type Json = any;

/**
 * Maps semantic block kinds to paragraph style IDs of a journal template
 * (e.g. MDPI's "MDPI31text"). Unset entries keep the built-in defaults.
 * numId* override the numbering instance IDs so list paragraphs can point
 * at entries merged into a template's own numbering.xml.
 */
export type DocxStyleMap = {
  normal?: string;
  title?: string;
  heading1?: string;
  heading2?: string;
  heading3?: string;
  bibliography?: string;
  figureCaption?: string;
  equation?: string;
  tableBody?: string;
  /** Caption paragraph above tables ("Table N. ..."). */
  tableCaption?: string;
  /** Word table style (w:tblStyle) reference, e.g. MDPItable. */
  table?: string;
  /** Style for the article-type line above the title (e.g. MDPI11articletype). */
  articleType?: string;
  /** Style for the author byline paragraph (e.g. MDPI13authornames). */
  authorNames?: string;
  /** Style for affiliation / correspondence lines (e.g. MDPI16affiliation). */
  affiliation?: string;
  /** Style for back-matter sections — Author Contributions, Funding, …
   *  (e.g. MDPI62backmatter). */
  backMatter?: string;
  /** Style for the "Abstract" heading; falls back to heading1 when unset. */
  abstractHeading?: string;
  /** Style for the "Keywords:" paragraph; falls back to normal when unset. */
  keywords?: string;
  /** Optional separator paragraph style after the abstract/keywords block
   *  (e.g. MDPI's MDPI19line, a bottom-bordered rule). */
  abstractSeparator?: string;
  numIdBullet?: number;
  numIdOrdered?: number;
  /** Numbering instance ID for level-1 section headings (e.g. MDPI's "1.", "2." …
   *  outline). When set, level-1 headings render with an auto-incrementing
   *  decimal number instead of a plain style. */
  numIdHeading?: number;
};

export type RichBuildInput = {
  /** TipTap document JSON (editor state). */
  doc: Json;
  refsById: Map<string, Ref>;
  /** Citation-order map (first-cited = 1). Library-only refs are omitted. */
  refOrder: Map<string, number>;
  style: StyleId;
  mode: BuildMode;
  title?: string;
  lineNumbers?: boolean;
  /** Bibliography heading; defaults to "References". */
  bibHeading?: string;
  /** Add the title as the first body paragraph. Defaults to true. */
  includeDocumentTitle?: boolean;
  /** Article-type line above the title (e.g. "Article"); rendered only when
   *  the style map provides an articleType style. */
  articleType?: string;
  /** Optional manuscript abstract inserted before the main body. */
  abstractText?: string;
  /** Optional keywords rendered inside the abstract block. */
  keywords?: string[];
  /** Add the bibliography heading and entries. Defaults to true. */
  includeBibliography?: boolean;
  /** Keep figure captions inline or collect them after the bibliography. */
  figureCaptionPlacement?: FigureCaptionPlacement;
  /** Journal-template style mapping (see DocxStyleMap). */
  styleMap?: DocxStyleMap;
  /** Media part name prefix; templates may already contain imageN.* parts. */
  imageNamePrefix?: string;
  /** Selected font family. Defaults to 'Times New Roman'. */
  fontFamily?: string;
};

/**
 * Rich DOCX builder — walks the TipTap JSON directly so bold/italic/underline,
 * sub/superscript, colors, highlights, links, alignment, real heading levels,
 * lists, tables, images, figures and equations survive the export. Citations
 * become EndNote fields (active), temporary citations (placeholder) or plain
 * formatted text, numbered by the FINAL bibliography order.
 */
export async function buildRichDocx(input: RichBuildInput): Promise<Blob> {
  const ctx = new BuildCtx(input);
  const bodyXml = ctx.buildBody();
  const zip = new JSZip();
  zip.file('[Content_Types].xml', richContentTypesXml(ctx));
  zip.folder('_rels')!.file('.rels', ROOT_RELS_XML);
  const word = zip.folder('word')!;
  word.file('document.xml', bodyXml);
  
  const font = input.fontFamily || 'Times New Roman';
  const stylesXml = RICH_STYLES_XML.replaceAll('Times New Roman', font);
  word.file('styles.xml', stylesXml);
  word.file('settings.xml', SETTINGS_XML);

  if (ctx.usesNumbering) word.file('numbering.xml', NUMBERING_XML);
  word.folder('_rels')!.file('document.xml.rels', ctx.relsXml());
  const media = word.folder('media')!;
  for (const img of ctx.images) {
    media.file(img.name, img.data);
  }
  return await zip.generateAsync({ type: 'blob', mimeType: WORD_MIME });
}

// ─── Build context ──────────────────────────────────────────

export type ImagePart = { name: string; data: Uint8Array; ext: string };

export class BuildCtx {
  readonly input: RichBuildInput;
  readonly orderedRefs: Ref[];
  readonly bibPos = new Map<string, number>();
  readonly rels: string[] = [];
  readonly images: ImagePart[] = [];
  usesNumbering = false;
  private relId = 100; // rId1/rId2 reserved for styles/settings, rId3 numbering
  private figCounters: Record<string, number> = { figure: 0, table: 0 };
  private figNumbers = new Map<string, { kind: string; num: number }>();
  // Plain TipTap tables share the Table counter with figure[kind=table]
  // nodes. indexFigures records their numbers in document order; table()
  // consumes them via the cursor (render order == index order, both
  // depth-first walks of the same doc).
  private plainTableNumbers: number[] = [];
  private plainTableCursor = 0;

  constructor(input: RichBuildInput) {
    this.input = input;
    const citationOrdered = orderByMap(input.refsById, input.refOrder);
    this.orderedRefs = assignRecNums(orderRefsForBib(input.style, citationOrdered));
    this.orderedRefs.forEach((r, i) => this.bibPos.set(r.id, i + 1));
    this.indexFigures(input.doc);
  }

  /** Style id for a semantic block kind, honoring the template style map. */
  private sid(kind: keyof DocxStyleMap, fallback?: string): string | undefined {
    const v = this.input.styleMap?.[kind];
    return typeof v === 'string' && v ? v : fallback;
  }

  private indexFigures(doc: Json): void {
    const walk = (n: Json): void => {
      if (!n) return;
      if (n.type === 'figure') {
        const kind = n.attrs?.kind === 'table' ? 'table' : 'figure';
        this.figCounters[kind] += 1;
        const id = n.attrs?.figId;
        if (id) this.figNumbers.set(id, { kind, num: this.figCounters[kind] });
      }
      if (n.type === 'table') {
        this.figCounters.table += 1;
        this.plainTableNumbers.push(this.figCounters.table);
      }
      if (Array.isArray(n.content)) for (const c of n.content) walk(c);
    };
    walk(doc);
  }

  /** Next document-order Table number for a plain TipTap table. */
  private nextPlainTableNumber(): number | null {
    if (this.plainTableCursor >= this.plainTableNumbers.length) return null;
    return this.plainTableNumbers[this.plainTableCursor++];
  }

  figureLabel(figId: string): string {
    const f = this.figNumbers.get(figId);
    if (!f) return 'Figure ?';
    return `${f.kind === 'table' ? 'Table' : 'Figure'} ${f.num}`;
  }

  addHyperlink(href: string): string {
    const id = `rId${++this.relId}`;
    this.rels.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(href)}" TargetMode="External"/>`,
    );
    return id;
  }

  addImage(dataUrl: string): { rid: string; widthEmu: number; heightEmu: number } | null {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
    const dims = sniffDimensions(parsed.data, parsed.ext) ?? { width: 480, height: 320 };
    let w = dims.width * EMU_PER_PX;
    let h = dims.height * EMU_PER_PX;
    if (w > MAX_IMG_WIDTH_EMU) {
      h = Math.round(h * (MAX_IMG_WIDTH_EMU / w));
      w = MAX_IMG_WIDTH_EMU;
    }
    const name = `${this.input.imageNamePrefix ?? 'image'}${this.images.length + 1}.${parsed.ext}`;
    this.images.push({ name, data: parsed.data, ext: parsed.ext });
    const id = `rId${++this.relId}`;
    this.rels.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`,
    );
    return { rid: id, widthEmu: w, heightEmu: h };
  }

  relsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
${this.usesNumbering ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' : ''}
${this.rels.join('\n')}
</Relationships>`;
  }

  // ─── Body ─────────────────────────────────────────────────

  /**
   * Body paragraphs only (no <w:document>/<w:body> wrapper, no sectPr) —
   * used both by the standalone package and by template injection.
   */
  bodyParagraphs(): string[] {
    const paragraphs: string[] = [];
    const doc = this.input.doc;
    const titleStyle = this.sid('title', 'Title');
    const h1Style = this.sid('heading1', 'Heading1');
    const bibStyle = this.sid('bibliography');
    const normalStyle = this.sid('normal');
    // Abstract-block style overrides. When the template defines dedicated
    // styles (e.g. MDPI's MDPI31text heading, MDPI18keywords, MDPI19line rule)
    // use them; otherwise fall back to the generic heading1/normal behaviour.
    const abstractHeadingStyle = this.sid('abstractHeading') ?? h1Style;
    const keywordsStyle = this.sid('keywords') ?? normalStyle;
    const abstractSeparatorStyle = this.sid('abstractSeparator');
    const content = Array.isArray(doc?.content) ? doc.content : [];
    const firstVisibleIndex = content.findIndex(hasVisibleBlockContent);
    const titleBlockIndex =
      firstVisibleIndex >= 0
      && content[firstVisibleIndex]?.type === 'heading'
      && Number(content[firstVisibleIndex]?.attrs?.level ?? 1) === 1
        ? firstVisibleIndex
        : -1;

    const articleTypeStyle = this.sid('articleType');
    if (this.input.articleType?.trim() && articleTypeStyle) {
      // The article-type style (e.g. MDPI11articletype) already defines italic,
      // so no inline <w:i/> override is needed.
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="${articleTypeStyle}"/></w:pPr>`
        + `<w:r><w:t xml:space="preserve">${escapeXml(this.input.articleType.trim())}</w:t></w:r></w:p>`,
      );
    }
    if (
      this.input.includeDocumentTitle !== false
      && this.input.title
      && titleBlockIndex < 0
    ) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="${titleStyle}"/></w:pPr>${textRun(this.input.title)}</w:p>`);
    }
    if (titleBlockIndex >= 0) {
      paragraphs.push(this.titleParagraph(content[titleBlockIndex], titleStyle));
    }

    const abstractText = this.input.abstractText?.trim() ?? '';
    const keywords = normalizeKeywords(this.input.keywords);
    if (abstractText || keywords.length > 0) {
      // MDPI production output indents the abstract block (heading + body +
      // keywords) to the left margin of the body-text gutter, overriding the
      // MDPI31text first-line indent. When the template defines a dedicated
      // abstract style (e.g. MDPI31text), emit the override explicitly.
      const abstractHasOwnStyle = abstractHeadingStyle !== h1Style;
      const abstractIndent = abstractHasOwnStyle ? '<w:ind w:left="2552" w:firstLine="0"/>' : '';
      paragraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="${abstractHeadingStyle}"/>${abstractIndent}</w:pPr>`
        + `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Abstract</w:t></w:r></w:p>`,
      );
      abstractText
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const pPr = normalStyle
            ? `<w:pPr><w:pStyle w:val="${normalStyle}"/>${abstractIndent}</w:pPr>`
            : abstractIndent
              ? `<w:pPr>${abstractIndent}</w:pPr>`
              : '';
          paragraphs.push(`<w:p>${pPr}${this.abstractSectionRuns(part)}</w:p>`);
        });
      if (keywords.length > 0) {
        const pPr = keywordsStyle ? `<w:pPr><w:pStyle w:val="${keywordsStyle}"/></w:pPr>` : '';
        paragraphs.push(
          `<w:p>${pPr}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Keywords: </w:t></w:r>${textRun(keywords.join('; '))}</w:p>`,
        );
      }
      // Optional separator rule under the abstract/keywords block
      // (e.g. MDPI's MDPI19line — an empty paragraph with a bottom border).
      if (abstractSeparatorStyle) {
        paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="${abstractSeparatorStyle}"/></w:pPr></w:p>`);
      }
    }

    if (content.length > 0) {
      // Journal front/back-matter styling (only when the template maps the
      // styles): the author byline and affiliation lines before the first
      // heading get their dedicated styles, and "Author Contributions:" /
      // "Funding:" … sections get the back-matter style.
      const authorNamesStyle = this.sid('authorNames');
      const affiliationStyle = this.sid('affiliation');
      const backMatterStyle = this.sid('backMatter');
      let seenHeading = false;
      let seenByline = false;
      for (let index = 0; index < content.length; index += 1) {
        if (index === titleBlockIndex) continue;
        const block = content[index];
        if (block?.type === 'heading') seenHeading = true;
        let styleOverride: string | undefined;
        let frontMatterKind: 'byline' | 'affiliation' | undefined;
        if (block?.type === 'paragraph') {
          const text = nodeText(block).trim();
          if (!seenHeading && authorNamesStyle && !seenByline && looksLikeAuthorByline(text)) {
            styleOverride = authorNamesStyle;
            frontMatterKind = 'byline';
            seenByline = true;
          } else if (
            !seenHeading
            && affiliationStyle
            && seenByline
            && (/^\d+\s+\S/.test(text) || /^\*?\s*(Correspondence|İletişim)/i.test(text))
          ) {
            styleOverride = affiliationStyle;
            frontMatterKind = 'affiliation';
          } else if (backMatterStyle && BACK_MATTER_RE.test(text)) {
            styleOverride = backMatterStyle;
          }
        }
        if (frontMatterKind === 'byline') {
          paragraphs.push(this.bylineParagraph(block, styleOverride));
        } else if (frontMatterKind === 'affiliation') {
          paragraphs.push(this.affiliationParagraph(block, styleOverride));
        } else {
          // Front-matter (pre-first-heading) lists inherit the body-gutter
          // indent to match MDPI production output.
          paragraphs.push(...this.blockToXml(block, {}, styleOverride, !seenHeading));
        }
      }
    }
    if (this.input.includeBibliography !== false) {
      const bibHeading = this.input.bibHeading ?? 'References';
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="${h1Style}"/></w:pPr>${textRun(bibHeading)}</w:p>`);
      this.orderedRefs.forEach((r, i) => {
        const pPr = bibStyle ? `<w:pPr><w:pStyle w:val="${bibStyle}"/></w:pPr>` : '';
        paragraphs.push(`<w:p>${pPr}${textRun(formatBibEntry(this.input.style, r, i + 1))}</w:p>`);
      });
    }
    if (this.input.figureCaptionPlacement === 'after-bibliography') {
      const legends = collectFigureLegends(doc);
      if (legends.length > 0) {
        paragraphs.push(
          `<w:p><w:pPr><w:pStyle w:val="${h1Style}"/><w:pageBreakBefore/></w:pPr>`
          + `${textRun('Figure Legends')}</w:p>`,
        );
        legends.forEach((legend) => {
          const pPr = normalStyle ? `<w:pPr><w:pStyle w:val="${normalStyle}"/></w:pPr>` : '';
          const cleanCap = cleanCaptionPrefix(legend.caption);
          paragraphs.push(
            `<w:p>${pPr}`
            + `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(`Figure ${legend.number}.`)}</w:t></w:r>`
            + (cleanCap ? textRun(` ${cleanCap}`) : '')
            + '</w:p>',
          );
        });
      }
    }
    return paragraphs;
  }

  buildBody(): string {
    const paragraphs = this.bodyParagraphs();

    const lineNumXml = this.input.lineNumbers
      ? '<w:lnNumType w:countBy="1" w:restart="continuous"/>'
      : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            mc:Ignorable="w14"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
<w:body>
${paragraphs.join('\n')}
<w:sectPr>${lineNumXml}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
  }

  /** Convert a block-level TipTap node into one or more <w:p>/<w:tbl> strings. */
  blockToXml(
    n: Json,
    listCtx: { numId?: number; ilvl?: number },
    styleOverride?: string,
    frontMatter = false,
  ): string[] {
    if (!n) return [];
    switch (n.type) {
      case 'paragraph':
        return [this.paragraph(n, listCtx, styleOverride, frontMatter)];
      case 'heading': {
        const level = Math.min(Math.max(Number(n.attrs?.level ?? 1), 1), 3);
        const mapped = this.sid(`heading${level}` as keyof DocxStyleMap, `Heading${level}`);
        // Some journal layouts (e.g. MDPI production output) render
        // sub-headings (level 2) as plain bold body text rather than a
        // dedicated italic heading style. When a template is in use
        // (styleMap.normal set) but does NOT map heading2 to a specific
        // style, fall back to the normal body style with an inline bold run.
        // Standalone exports (no styleMap) keep the built-in Heading2 style.
        const isLevel2Fallback =
          level === 2
          && !this.input.styleMap?.heading2
          && Boolean(this.input.styleMap?.normal);
        if (isLevel2Fallback) {
          return [this.boldBodyParagraph(n, listCtx)];
        }
        // MDPI production output renders level-1 section headings with an
        // auto-incrementing outline number ("1.", "2." …). When a heading
        // numbering instance is mapped, render the heading against the normal
        // body style + the outline list instead of a static heading style.
        const headingNumId = this.input.styleMap?.numIdHeading;
        if (level === 1 && headingNumId !== undefined) {
          return [this.numberedHeadingParagraph(n, headingNumId)];
        }
        return [this.paragraph(n, listCtx, mapped)];
      }
      case 'bulletList':
        return this.list(n, this.input.styleMap?.numIdBullet ?? 1, 0, frontMatter);
      case 'orderedList':
        return this.list(n, this.input.styleMap?.numIdOrdered ?? 2, 0, frontMatter);
      case 'blockquote': {
        const out: string[] = [];
        for (const c of n.content ?? []) out.push(...this.blockToXml(c, listCtx, undefined, frontMatter));
        return out;
      }
      case 'table':
        return this.table(n);
      case 'equation': {
        const latex: string = n.attrs?.latex ?? '';
        const eqStyle = this.sid('equation');
        const eqPPr = eqStyle
          ? `<w:pPr><w:pStyle w:val="${eqStyle}"/></w:pPr>`
          : '<w:pPr><w:jc w:val="center"/></w:pPr>';
        return [
          `<w:p>${eqPPr}<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(latex)}</w:t></w:r></w:p>`,
        ];
      }
      case 'figure':
        return this.figure(n);
      case 'image': {
        const drawing = this.imageRun(n.attrs?.src ?? '');
        return drawing ? [`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawing}</w:p>`] : [];
      }
      case 'horizontalRule':
        return ['<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>'];
      case 'codeBlock': {
        const text = (n.content ?? []).map((c: Json) => c.text ?? '').join('');
        return text
          .split('\n')
          .map((line: string) => `<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:eastAsia="Courier New"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`);
      }
      default: {
        // Unknown block with content: recurse; with text: wrap in paragraph.
        if (Array.isArray(n.content)) {
          const out: string[] = [];
          for (const c of n.content) out.push(...this.blockToXml(c, listCtx));
          return out;
        }
        return [];
      }
    }
  }

  private list(n: Json, numId: number, ilvl = 0, frontMatter = false): string[] {
    this.usesNumbering = true;
    const out: string[] = [];
    for (const item of n.content ?? []) {
      if (item.type !== 'listItem') continue;
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList') {
          out.push(...this.list(child, this.input.styleMap?.numIdBullet ?? 1, ilvl + 1, frontMatter));
        } else if (child.type === 'orderedList') {
          out.push(...this.list(child, this.input.styleMap?.numIdOrdered ?? 2, ilvl + 1, frontMatter));
        } else if (child.type === 'paragraph') {
          out.push(this.paragraph(child, { numId, ilvl }, undefined, frontMatter));
        } else {
          out.push(...this.blockToXml(child, { numId, ilvl }, undefined, frontMatter));
        }
      }
    }
    return out;
  }

  private paragraph(
    n: Json,
    listCtx: { numId?: number; ilvl?: number },
    styleId?: string,
    frontMatter = false,
  ): string {
    const pPr: string[] = [];
    // Plain body paragraphs pick up the template's normal-text style.
    const effectiveStyle = styleId ?? (listCtx.numId === undefined ? this.sid('normal') : undefined);
    if (effectiveStyle) pPr.push(`<w:pStyle w:val="${effectiveStyle}"/>`);
    if (listCtx.numId !== undefined) {
      pPr.push(`<w:numPr><w:ilvl w:val="${listCtx.ilvl ?? 0}"/><w:numId w:val="${listCtx.numId}"/></w:numPr>`);
    }
    // Lists that appear in the front-matter area (before the first section
    // heading) are indented to the body gutter in MDPI production output,
    // overriding the list definition's default hanging indent.
    if (frontMatter && listCtx.numId !== undefined) {
      pPr.push('<w:ind w:left="2552" w:hanging="360"/>');
    }
    const align = n.attrs?.textAlign;
    if (align === 'center') pPr.push('<w:jc w:val="center"/>');
    else if (align === 'right') pPr.push('<w:jc w:val="right"/>');
    else if (align === 'justify') pPr.push('<w:jc w:val="both"/>');
    else if (align === 'left') pPr.push('<w:jc w:val="left"/>');

    const runs = this.inlineRuns(n.content ?? []);
    const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
    return `<w:p>${pPrXml}${runs || textRun('')}</w:p>`;
  }

  private titleParagraph(n: Json, styleId?: string): string {
    const pPrXml = styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : '';
    const runs = this.inlineRuns(n.content ?? []);
    return `<w:p>${pPrXml}${runs || textRun('')}</w:p>`;
  }

  /**
   * Render an abstract body paragraph, splitting a leading structured label
   * ("Background:", "Methods:", "Results:", "Conclusions:") into a bold run
   * so it matches MDPI production output. Bilingual (Turkish) labels too.
   * Returns the run XML (no <w:p> wrapper).
   */
  private abstractSectionRuns(part: string): string {
    const m = part.match(
      /^(Background|Methods|Results|Conclusions?|Objective?s?|Purpose|Aim|Findings|Giriş|Yöntemler?|Sonuçlar?|Amaç|Bulgular?|Çıkarımlar?)\s*[:：]\s*/i,
    );
    if (!m) return textRun(part);
    const label = m[0];
    const rest = part.slice(label.length);
    return `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}</w:t></w:r>`
      + textRun(rest);
  }

  /**
   * Author byline paragraph. MDPI production output places it flush against
   * the left margin (no first-line indent) in bold, with affiliation markers
   * ("1", "1*") rendered as superscript. We override the body-text style's
   * default indent and bold the runs; numeric/symbol markers following a
   * name become superscript.
   */
  private bylineParagraph(n: Json, styleId?: string): string {
    const pPr: string[] = [];
    if (styleId) pPr.push(`<w:pStyle w:val="${styleId}"/>`);
    pPr.push('<w:ind w:left="0" w:firstLine="0"/>');
    const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
    const runs = this.bylineRuns(n.content ?? []);
    return `<w:p>${pPrXml}${runs || textRun('')}</w:p>`;
  }

  /** Split a byline into bold name-runs with superscript affiliation markers. */
  private bylineRuns(content: Json[]): string {
    // Walk inline text nodes; runs of letters/spaces/comma are bold body text,
    // runs of digits/asterisks that trail a name are superscript markers.
    const out: string[] = [];
    for (const c of content ?? []) {
      if (!c) continue;
      if (c.type === 'text') {
        out.push(...this.splitBylineText(c.text ?? ''));
      } else if (c.type === 'hardBreak') {
        out.push('<w:r><w:br/></w:r>');
      } else if (Array.isArray(c.content)) {
        out.push(this.bylineRuns(c.content));
      }
    }
    return out.join('');
  }

  /** Emit a byline text string as alternating bold/superscript runs. */
  private splitBylineText(text: string): string[] {
    // A marker is a short run of digits/asterisks/daggers optionally separated
    // by commas, that follows a name. e.g. "1", "1,2", "1*", "†".
    // Deliberately excludes \s from the repeatable class: matching (and then
    // trimming) a trailing space here would silently swallow the space
    // between one author's marker and the next author's name — e.g.
    // "Name 1, Next 2" lost its space and rendered as "Name¹,Next²".
    const re = /([0-9][0-9,*†‡§¶]*\*?|[†‡§¶]\*?)/g;
    const runs: string[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) {
        const seg = text.slice(last, m.index);
        runs.push(this.boldRun(seg));
      }
      runs.push(this.superscriptRun(m[1].trim()));
      last = m.index + m[0].length;
    }
    if (last < text.length) runs.push(this.boldRun(text.slice(last)));
    return runs.length ? runs : [this.boldRun(text)];
  }

  private boldRun(text: string): string {
    if (!text) return '';
    return `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  }

  private superscriptRun(text: string): string {
    if (!text) return '';
    return `<w:r><w:rPr><w:b/><w:bCs/><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  }

  /**
   * Affiliation / correspondence paragraph. MDPI production output indents it
   * to the body gutter (no first-line indent) in 8pt (sz=16). We override the
   * body-text style indent and force the run size down.
   */
  private affiliationParagraph(n: Json, styleId?: string): string {
    const pPr: string[] = [];
    if (styleId) pPr.push(`<w:pStyle w:val="${styleId}"/>`);
    pPr.push('<w:ind w:left="2552" w:firstLine="0"/>');
    const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
    const text = nodeText(n);
    const rPr = '<w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>';
    return `<w:p>${pPrXml}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }

  /**
   * Sub-heading rendered as plain bold body text (normal style + a bold
   * inline run). Used when a template intentionally does NOT map level-2
   * headings to a dedicated style — matches MDPI production output where
   * "2.1. Study Design..." appears as bold MDPI31text rather than the
   * italic MDPI22heading2.
   */
  private boldBodyParagraph(n: Json, listCtx: { numId?: number; ilvl?: number }): string {
    const pPr: string[] = [];
    const normalStyle = this.sid('normal');
    if (normalStyle) pPr.push(`<w:pStyle w:val="${normalStyle}"/>`);
    if (listCtx.numId !== undefined) {
      pPr.push(`<w:numPr><w:ilvl w:val="${listCtx.ilvl ?? 0}"/><w:numId w:val="${listCtx.numId}"/></w:numPr>`);
    }
    const runs = this.inlineRuns(n.content ?? [], true);
    const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
    return `<w:p>${pPrXml}${runs || textRun('')}</w:p>`;
  }

  /**
   * Level-1 section heading rendered with an auto-incrementing outline number
   * ("1.", "2." …). Matches MDPI production output: the heading text sits on
   * the body-text style (MDPI31text) with a decimal outline list attached,
   * a 12pt bold run, and the outline list's hanging indent.
   */
  private numberedHeadingParagraph(n: Json, numId: number): string {
    this.usesNumbering = true;
    const normalStyle = this.sid('normal');
    const pPr: string[] = [];
    if (normalStyle) pPr.push(`<w:pStyle w:val="${normalStyle}"/>`);
    pPr.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`);
    pPr.push('<w:ind w:left="2835" w:hanging="283"/>');
    // Section headings are not justified like body text.
    pPr.push('<w:jc w:val="left"/>');
    const pPrXml = pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : '';
    // Bold 12pt (sz=24 half-points) run, matching the production template.
    const rPr = '<w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
    const text = nodeText(n);
    return `<w:p>${pPrXml}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }

  /** Convert inline nodes (text/citation/hardBreak/figureRef/image) to runs. */
  private inlineRuns(content: Json[], forceBold = false): string {
    const runs: string[] = [];
    for (const c of content) {
      if (!c) continue;
      if (c.type === 'text') {
        runs.push(this.textWithMarks(c, forceBold));
      } else if (c.type === 'citation') {
        runs.push(this.citation(c));
      } else if (c.type === 'hardBreak') {
        runs.push('<w:r><w:br/></w:r>');
      } else if (c.type === 'figureRef') {
        runs.push(textRun(this.figureLabel(c.attrs?.figId ?? '')));
      } else if (c.type === 'image') {
        const drawing = this.imageRun(c.attrs?.src ?? '');
        if (drawing) runs.push(drawing);
      } else if (Array.isArray(c.content)) {
        runs.push(this.inlineRuns(c.content, forceBold));
      }
    }
    return runs.join('');
  }

  private textWithMarks(n: Json, forceBold = false): string {
    const text: string = n.text ?? '';
    if (text === '') return '';
    const marks: Json[] = Array.isArray(n.marks) ? n.marks : [];
    const rPr: string[] = [];
    // Track which simple toggle properties have already been emitted so that
    // forceBold and a bold mark (or a duplicate mark) never duplicate <w:b/>.
    const seen = new Set<string>();
    const toggle = (tag: string): void => {
      if (!seen.has(tag)) {
        seen.add(tag);
        rPr.push(tag);
      }
    };
    if (forceBold) toggle('<w:b/>');
    let linkHref: string | null = null;
    for (const m of marks) {
      switch (m.type) {
        case 'bold': toggle('<w:b/>'); break;
        case 'italic': toggle('<w:i/>'); break;
        case 'underline': toggle('<w:u w:val="single"/>'); break;
        case 'strike': toggle('<w:strike/>'); break;
        case 'superscript': toggle('<w:vertAlign w:val="superscript"/>'); break;
        case 'subscript': toggle('<w:vertAlign w:val="subscript"/>'); break;
        case 'code': rPr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:eastAsia="Courier New"/>'); break;
        case 'highlight': rPr.push('<w:highlight w:val="yellow"/>'); break;
        case 'textStyle': {
          const color = (m.attrs?.color ?? '').replace('#', '');
          if (/^[0-9a-fA-F]{6}$/.test(color)) rPr.push(`<w:color w:val="${color.toUpperCase()}"/>`);
          break;
        }
        case 'link': linkHref = m.attrs?.href ?? null; break;
        default: break;
      }
    }
    if (linkHref) {
      rPr.push('<w:color w:val="0563C1"/><w:u w:val="single"/>');
    }
    const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
    const run = `<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
    if (linkHref) {
      const rid = this.addHyperlink(linkHref);
      return `<w:hyperlink r:id="${rid}">${run}</w:hyperlink>`;
    }
    return run;
  }

  private citation(n: Json): string {
    const ids: string[] = n.attrs?.refIds ?? [];
    const nums = ids.map((id) => this.bibPos.get(id) ?? 0).filter((x) => x > 0);
    const cited = nums
      .map((num) => this.orderedRefs[num - 1])
      .filter((r): r is Ref => Boolean(r));
    if (cited.length === 0) return '';
    const display = formatInTextCitation(this.input.style, cited, nums, {
      locator: n.attrs?.locator || undefined,
      prefix: n.attrs?.prefix || undefined,
      suffix: n.attrs?.suffix || undefined,
      suppressAuthor: n.attrs?.suppressAuthor || undefined,
    });
    const superscript = isSuperscriptCitationStyle(this.input.style);
    if (this.input.mode === 'active') return activeEndNoteField(cited, display, superscript);
    if (this.input.mode === 'placeholder') return textRun(placeholderText(cited));
    return textRun(display, superscript);
  }

  private figure(n: Json): string[] {
    const out: string[] = [];
    const src: string = n.attrs?.src ?? '';
    const kind = n.attrs?.kind === 'table' ? 'Table' : 'Figure';
    const figId: string = n.attrs?.figId ?? '';
    const caption: string = n.attrs?.caption ?? '';
    if (src) {
      const drawing = this.imageRun(src);
      if (drawing) out.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawing}</w:p>`);
    }
    const label = figId ? this.figureLabel(figId) : `${kind} ?`;
    const moveFigureCaption = kind === 'Figure'
      && this.input.figureCaptionPlacement === 'after-bibliography';
    const capStyle = this.sid('figureCaption');
    const capPPr = capStyle
      ? `<w:pPr><w:pStyle w:val="${capStyle}"/></w:pPr>`
      : '<w:pPr><w:jc w:val="center"/></w:pPr>';
    const cleanCap = cleanCaptionPrefix(caption);
    if (moveFigureCaption) {
      // Brief inline label only — full caption goes to Figure Legends section.
      out.push(
        `<w:p>${capPPr}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(`${label}.`)}</w:t></w:r></w:p>`,
      );
    } else {
      out.push(
        `<w:p>${capPPr}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(`${label}.`)}</w:t></w:r>${cleanCap ? textRun(` ${cleanCap}`) : ''}</w:p>`,
      );
    }
    return out;
  }

  private imageRun(src: string): string | null {
    if (!src.startsWith('data:image/')) return null;
    const img = this.addImage(src);
    if (!img) return null;
    const docPrId = this.images.length;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${img.widthEmu}" cy="${img.heightEmu}"/><wp:docPr id="${docPrId}" name="Image ${docPrId}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="Image ${docPrId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${img.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${img.widthEmu}" cy="${img.heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  /**
   * Publication-style ("three-line") table: thick top + bottom rules, thin
   * rule under the header row, no vertical/inner grid, bold header, full
   * width. A numbered "Table N." caption paragraph precedes the table.
   */
  private table(n: Json): string[] {
    const out: string[] = [];
    const title = typeof n.attrs?.title === 'string' ? n.attrs.title.trim() : '';
    const footnote = typeof n.attrs?.footnote === 'string' ? n.attrs.footnote.trim() : '';

    // Caption: "Table N." (continues the shared counter with figure[kind=table]).
    const num = this.nextPlainTableNumber();
    if (num !== null) {
      const capStyle = this.sid('tableCaption');
      const capPPr = capStyle
        ? `<w:pPr><w:pStyle w:val="${capStyle}"/></w:pPr>`
        : '';
      out.push(
        `<w:p>${capPPr}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(`Table ${num}.`)}</w:t></w:r>`
        + (title ? textRun(` ${title}`) : '')
        + '</w:p>',
      );
    }

    // Column grid from TipTap colwidth attrs (px → twip), when the user
    // resized columns in the editor.
    const firstRow = (n.content ?? []).find((r: Json) => r.type === 'tableRow');
    const colWidthsPx: number[] = [];
    for (const cell of firstRow?.content ?? []) {
      const cw = cell.attrs?.colwidth;
      if (Array.isArray(cw)) {
        for (const w of cw) colWidthsPx.push(Number(w) || 0);
      } else {
        colWidthsPx.push(0);
      }
    }
    const hasWidths = colWidthsPx.some((w) => w > 0);
    const tblGrid = hasWidths
      ? `<w:tblGrid>${colWidthsPx.map((w) => `<w:gridCol w:w="${w > 0 ? Math.round(w * 15) : 1440}"/>`).join('')}</w:tblGrid>`
      : '';

    const rows: string[] = [];
    const rowNodes = (n.content ?? []).filter((r: Json) => r.type === 'tableRow');
    rowNodes.forEach((row: Json, rowIdx: number) => {
      const isHeaderRow = (row.content ?? []).some((c: Json) => c.type === 'tableHeader');
      const cells: string[] = [];
      for (const cell of row.content ?? []) {
        const isHeader = cell.type === 'tableHeader';
        const colspan = Number(cell.attrs?.colspan ?? 1);
        const tcPr: string[] = [];
        if (colspan > 1) tcPr.push(`<w:gridSpan w:val="${colspan}"/>`);
        // Header row carries the thin middle rule of the three-line look.
        if (isHeaderRow && rowIdx === 0) {
          tcPr.push('<w:tcBorders><w:bottom w:val="single" w:sz="6" w:color="000000"/></w:tcBorders>');
        }
        tcPr.push('<w:vAlign w:val="center"/>');
        const inner: string[] = [];
        const cellStyle = this.sid('tableBody');
        for (const blk of cell.content ?? []) {
          if (blk.type === 'paragraph') {
            const runs = this.inlineRuns(blk.content ?? []);
            const stylePart = cellStyle ? `<w:pStyle w:val="${cellStyle}"/>` : '';
            const boldPart = isHeader ? '<w:rPr><w:b/></w:rPr>' : '';
            const pPr = stylePart || boldPart || isHeader
              ? `<w:pPr>${stylePart}${isHeader ? '<w:jc w:val="center"/>' : ''}${boldPart}</w:pPr>`
              : '';
            inner.push(`<w:p>${pPr}${runs || textRun('')}</w:p>`);
          } else {
            inner.push(...this.blockToXml(blk, {}));
          }
        }
        if (inner.length === 0) inner.push(`<w:p>${textRun('')}</w:p>`);
        cells.push(`<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${inner.join('')}</w:tc>`);
      }
      const trPr = isHeaderRow && rowIdx === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '';
      rows.push(`<w:tr>${trPr}${cells.join('')}</w:tr>`);
    });

    const tblStyleRef = this.sid('table');
    const tblPr =
      '<w:tblPr>'
      + (tblStyleRef ? `<w:tblStyle w:val="${tblStyleRef}"/>` : '')
      + '<w:tblW w:w="5000" w:type="pct"/>'
      + '<w:jc w:val="center"/>'
      + '<w:tblBorders><w:top w:val="single" w:sz="12" w:color="000000"/><w:bottom w:val="single" w:sz="12" w:color="000000"/></w:tblBorders>'
      + '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
      + '</w:tblPr>';

    out.push(`<w:tbl>${tblPr}${tblGrid}${rows.join('')}</w:tbl>`);
    if (footnote) {
      const normalStyle = this.sid('normal');
      const pPr = normalStyle
        ? `<w:pPr><w:pStyle w:val="${normalStyle}"/><w:spacing w:before="80"/></w:pPr>`
        : '<w:pPr><w:spacing w:before="80"/></w:pPr>';
      out.push(
        `<w:p>${pPr}<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`
        + `<w:t xml:space="preserve">${escapeXml(footnote)}</w:t></w:r></w:p>`,
      );
    }
    return out;
  }
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

function hasVisibleBlockContent(node: Json): boolean {
  if (!node) return false;
  if (node.type !== 'paragraph' && node.type !== 'heading') return true;
  return nodeText(node).trim().length > 0;
}

// MDPI-style back-matter section labels ("Author Contributions: …"). Bilingual
// so Turkish drafts map too.
const BACK_MATTER_RE =
  /^(Author Contributions?|Funding|Institutional Review Board Statement|Informed Consent Statement|Data Availability Statement|Acknowledg(e)?ments?|Conflicts? of Interest|Abbreviations|Supplementary Materials?|Yazar Katkıları|Finansman|Çıkar Çatışması|Teşekkür)\s*[:：]/i;

function nodeText(node: Json): string {
  if (!node) return '';
  let text = typeof node.text === 'string' ? node.text : '';
  if (Array.isArray(node.content)) {
    for (const child of node.content) text += nodeText(child);
  }
  return text;
}

// ─── Helpers ────────────────────────────────────────────────

function orderByMap(refsById: Map<string, Ref>, refOrder: Map<string, number>): Ref[] {
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
