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
import { assignRecNums, activeEndNoteField, placeholderText, type BuildMode } from './build';

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
  numIdBullet?: number;
  numIdOrdered?: number;
};

export type RichBuildInput = {
  /** TipTap document JSON (editor state). */
  doc: Json;
  refsById: Map<string, Ref>;
  /** Citation-order map (first-cited = 1) including uncited refs at the end. */
  refOrder: Map<string, number>;
  style: StyleId;
  mode: BuildMode;
  title?: string;
  lineNumbers?: boolean;
  /** Bibliography heading; defaults to "References". */
  bibHeading?: string;
  /** Add the title as the first body paragraph. Defaults to true. */
  includeDocumentTitle?: boolean;
  /** Add the bibliography heading and entries. Defaults to true. */
  includeBibliography?: boolean;
  /** Keep figure captions inline or collect them after the bibliography. */
  figureCaptionPlacement?: FigureCaptionPlacement;
  /** Journal-template style mapping (see DocxStyleMap). */
  styleMap?: DocxStyleMap;
  /** Media part name prefix; templates may already contain imageN.* parts. */
  imageNamePrefix?: string;
};

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EMU_PER_PX = 9525; // 96 dpi
const MAX_IMG_WIDTH_EMU = Math.round(6 * 914400); // 6 inches

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
  zip.file('[Content_Types].xml', contentTypesXml(ctx));
  zip.folder('_rels')!.file('.rels', ROOT_RELS_XML);
  const word = zip.folder('word')!;
  word.file('document.xml', bodyXml);
  word.file('styles.xml', RICH_STYLES_XML);
  word.file('settings.xml', SETTINGS_XML);

  const titleText = input.title ?? 'Manuscript';
  const exportDateText = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  word.file('header1.xml', headerXml(titleText));
  word.file('footer1.xml', footerXml(exportDateText));

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
<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
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

    // Check if the document already has a Heading 1 node.
    const hasHeading1 = Array.isArray(doc?.content) && doc.content.some(
      (block: any) => block && block.type === 'heading' && block.attrs?.level === 1
    );

    if (
      this.input.includeDocumentTitle !== false
      && this.input.title
      && !hasHeading1
    ) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="${titleStyle}"/></w:pPr>${textRun(this.input.title)}</w:p>`);
    }

    if (Array.isArray(doc?.content)) {
      for (const block of doc.content) {
        paragraphs.push(...this.blockToXml(block, {}));
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
<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/>${lineNumXml}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
  }

  /** Convert a block-level TipTap node into one or more <w:p>/<w:tbl> strings. */
  blockToXml(n: Json, listCtx: { numId?: number; ilvl?: number }): string[] {
    if (!n) return [];
    switch (n.type) {
      case 'paragraph':
        return [this.paragraph(n, listCtx)];
      case 'heading': {
        const level = Math.min(Math.max(Number(n.attrs?.level ?? 1), 1), 3);
        const mapped = this.sid(`heading${level}` as keyof DocxStyleMap, `Heading${level}`);
        return [this.paragraph(n, listCtx, mapped)];
      }
      case 'bulletList':
        return this.list(n, this.input.styleMap?.numIdBullet ?? 1);
      case 'orderedList':
        return this.list(n, this.input.styleMap?.numIdOrdered ?? 2);
      case 'blockquote': {
        const out: string[] = [];
        for (const c of n.content ?? []) out.push(...this.blockToXml(c, listCtx));
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

  private list(n: Json, numId: number, ilvl = 0): string[] {
    this.usesNumbering = true;
    const out: string[] = [];
    for (const item of n.content ?? []) {
      if (item.type !== 'listItem') continue;
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList') {
          out.push(...this.list(child, this.input.styleMap?.numIdBullet ?? 1, ilvl + 1));
        } else if (child.type === 'orderedList') {
          out.push(...this.list(child, this.input.styleMap?.numIdOrdered ?? 2, ilvl + 1));
        } else if (child.type === 'paragraph') {
          out.push(this.paragraph(child, { numId, ilvl }));
        } else {
          out.push(...this.blockToXml(child, { numId, ilvl }));
        }
      }
    }
    return out;
  }

  private paragraph(n: Json, listCtx: { numId?: number; ilvl?: number }, styleId?: string): string {
    const pPr: string[] = [];
    // Plain body paragraphs pick up the template's normal-text style.
    const effectiveStyle = styleId ?? (listCtx.numId === undefined ? this.sid('normal') : undefined);
    if (effectiveStyle) pPr.push(`<w:pStyle w:val="${effectiveStyle}"/>`);
    if (listCtx.numId !== undefined) {
      pPr.push(`<w:numPr><w:ilvl w:val="${listCtx.ilvl ?? 0}"/><w:numId w:val="${listCtx.numId}"/></w:numPr>`);
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

  /** Convert inline nodes (text/citation/hardBreak/figureRef/image) to runs. */
  private inlineRuns(content: Json[]): string {
    const runs: string[] = [];
    for (const c of content) {
      if (!c) continue;
      if (c.type === 'text') {
        runs.push(this.textWithMarks(c));
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
        runs.push(this.inlineRuns(c.content));
      }
    }
    return runs.join('');
  }

  private textWithMarks(n: Json): string {
    const text: string = n.text ?? '';
    if (text === '') return '';
    const marks: Json[] = Array.isArray(n.marks) ? n.marks : [];
    const rPr: string[] = [];
    let linkHref: string | null = null;
    for (const m of marks) {
      switch (m.type) {
        case 'bold': rPr.push('<w:b/>'); break;
        case 'italic': rPr.push('<w:i/>'); break;
        case 'underline': rPr.push('<w:u w:val="single"/>'); break;
        case 'strike': rPr.push('<w:strike/>'); break;
        case 'superscript': rPr.push('<w:vertAlign w:val="superscript"/>'); break;
        case 'subscript': rPr.push('<w:vertAlign w:val="subscript"/>'); break;
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

function textRun(text: string, superscript = false): string {
  const properties = superscript
    ? '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
    : '';
  if (text === '') return `<w:r>${properties}<w:t xml:space="preserve"> </w:t></w:r>`;
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function parseDataUrl(dataUrl: string): { data: Uint8Array; ext: string } | null {
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  try {
    const bin = typeof atob === 'function' ? atob(m[2]) : Buffer.from(m[2], 'base64').toString('binary');
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { data, ext };
  } catch {
    return null;
  }
}

/** Read intrinsic pixel dimensions from PNG/JPEG/GIF headers. */
export function sniffDimensions(
  data: Uint8Array,
  ext: string,
): { width: number; height: number } | null {
  try {
    if (ext === 'png' && data.length > 24) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    if (ext === 'gif' && data.length > 10) {
      return { width: data[6] | (data[7] << 8), height: data[8] | (data[9] << 8) };
    }
    if (ext === 'jpeg') {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let off = 2;
      while (off + 9 < data.length) {
        if (data[off] !== 0xff) break;
        const marker = data[off + 1];
        const size = dv.getUint16(off + 2);
        // SOF0..SOF15 except DHT(C4)/DAC(CC)/RST
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: dv.getUint16(off + 7), height: dv.getUint16(off + 5) };
        }
        off += 2 + size;
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function contentTypesXml(ctx: BuildCtx): string {
  const imageDefaults = new Set(ctx.images.map((i) => i.ext));
  const defaults = [...imageDefaults]
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${defaults}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
${ctx.usesNumbering ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ''}
</Types>`;
}

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Times New Roman 12pt, 1.5 line spacing, justified — matches the editor's
// default typography instead of Word's Calibri default.
const RICH_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="Heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;

function headerXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="4" w:space="1" w:color="D3D3D3"/>
      </w:pBdr>
      <w:jc w:val="both"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
        <w:sz w:val="18"/>
        <w:i/>
        <w:color w:val="808080"/>
      </w:rPr>
      <w:t>${escapeXml(title)}</w:t>
    </w:r>
  </w:p>
</w:hdr>`;
}

function footerXml(exportDate: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:pBdr>
        <w:top w:val="single" w:sz="4" w:space="1" w:color="D3D3D3"/>
      </w:pBdr>
      <w:tabs>
        <w:tab w:val="right" w:pos="9360"/>
      </w:tabs>
      <w:jc w:val="both"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
        <w:sz w:val="18"/>
        <w:color w:val="808080"/>
      </w:rPr>
      <w:t>Export: ${escapeXml(exportDate)}</w:t>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
        <w:sz w:val="18"/>
        <w:color w:val="808080"/>
      </w:rPr>
      <w:tab/>
      <w:t>Page </w:t>
    </w:r>
    <w:fldSimple w:instr="PAGE">
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:sz w:val="18"/>
          <w:color w:val="808080"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
    </w:fldSimple>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
        <w:sz w:val="18"/>
        <w:color w:val="808080"/>
      </w:rPr>
      <w:t> of </w:t>
    </w:r>
    <w:fldSimple w:instr="NUMPAGES">
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>
          <w:sz w:val="18"/>
          <w:color w:val="808080"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
    </w:fldSimple>
  </w:p>
</w:ftr>`;
}

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:updateFields w:val="true"/>
</w:settings>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="1">
<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="2">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%3."/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;

function cleanCaptionPrefix(caption: string): string {
  const trimmed = caption.trim();
  if (!trimmed) return '';
  // Match things like "Figure 1.", "Fig. 2:", "Table 12 -", "Tablo 3" etc.
  const regex = /^\s*(?:Figure|Fig|Resim|Res|Table|Tab|Tablo)\.?\s*\d+\s*[\.:\-—–\s]*/i;
  return trimmed.replace(regex, '').trim();
}
