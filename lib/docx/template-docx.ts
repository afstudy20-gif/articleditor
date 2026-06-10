/**
 * Journal-template DOCX export — injects the editor's generated body into a
 * real journal Word template (.dot/.dotx, OOXML zip), preserving the
 * template's styles.xml, headers/footers, numbering, theme and page setup.
 *
 * The body is produced by the same BuildCtx walker as the standalone export,
 * but paragraph styles are remapped to the template's own style IDs via
 * DocxStyleMap (e.g. MDPI31text for body text in MDPI journals).
 */

import JSZip from 'jszip';
import { BuildCtx, type DocxStyleMap, type RichBuildInput } from './build-rich';
import type { StyleId } from '@/lib/refs/styles';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Numbering instance IDs merged into the template's numbering.xml. High values
// so they can't collide with the template's own list definitions.
const TPL_NUM_BULLET = 901;
const TPL_NUM_ORDERED = 902;
const TPL_ABS_BULLET = 901;
const TPL_ABS_ORDERED = 902;

export type DocxTemplateDef = {
  id: string;
  name: string;
  /** Static asset URL of the OOXML template package. */
  file: string;
  styleMap: DocxStyleMap;
  /** Citation style this journal expects; forced during export. */
  citationStyle?: StyleId;
  bibHeading?: string;
};

/** Registry of bundled journal templates (served from /public/templates). */
export const DOCX_TEMPLATES: readonly DocxTemplateDef[] = [
  {
    id: 'jcm',
    name: 'JCM — Journal of Clinical Medicine (MDPI)',
    file: '/templates/jcm-template.dot',
    citationStyle: 'mdpi-acs',
    bibHeading: 'References',
    styleMap: {
      normal: 'MDPI31text',
      title: 'MDPI12title',
      heading1: 'MDPI21heading1',
      heading2: 'MDPI22heading2',
      heading3: 'MDPI23heading3',
      bibliography: 'MDPI81references',
      figureCaption: 'MDPI51figurecaption',
      equation: 'MDPI39equation',
      tableBody: 'MDPI42tablebody',
      numIdBullet: TPL_NUM_BULLET,
      numIdOrdered: TPL_NUM_ORDERED,
    },
  },
];

export function getDocxTemplate(id: string): DocxTemplateDef | undefined {
  return DOCX_TEMPLATES.find((t) => t.id === id);
}

export async function buildTemplateDocx(
  templateBytes: ArrayBuffer | Uint8Array,
  template: DocxTemplateDef,
  input: RichBuildInput,
): Promise<Blob> {
  const ctx = new BuildCtx({
    ...input,
    style: template.citationStyle ?? input.style,
    bibHeading: input.bibHeading ?? template.bibHeading,
    styleMap: template.styleMap,
    // Templates ship their own media/imageN.* parts — avoid name collisions.
    imageNamePrefix: 'enr-image',
  });
  const paragraphs = ctx.bodyParagraphs();

  const zip = await JSZip.loadAsync(templateBytes);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Template is missing word/document.xml');
  const templateDoc = await docFile.async('string');

  // Keep the template's sectPr — page size, margins, columns, line numbers,
  // header/footer references all live there.
  const sectPr = extractSectPr(templateDoc);
  const rootTag = withDrawingNamespaces(extractRootTag(templateDoc));

  const newDoc = `${templateDoc.slice(0, templateDoc.indexOf('<w:document'))}${rootTag}<w:body>
${paragraphs.join('\n')}
${sectPr}</w:body></w:document>`;
  zip.file('word/document.xml', newDoc);

  // Word templates declare the *.template.main+xml content type; the exported
  // file is a normal document, so rewrite the override.
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ct = await ctFile.async('string');
    ct = ct.replace(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
    ct = ensureImageDefaults(ct, ctx.images.map((i) => i.ext));
    zip.file('[Content_Types].xml', ct);
  }

  // Merge dynamic relationships (hyperlinks, images) into the template rels.
  if (ctx.rels.length > 0) {
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      const rels = await relsFile.async('string');
      zip.file(
        'word/_rels/document.xml.rels',
        rels.replace('</Relationships>', `${ctx.rels.join('\n')}</Relationships>`),
      );
    }
  }

  // Merge our two list definitions into the template's numbering.xml.
  if (ctx.usesNumbering) {
    const numFile = zip.file('word/numbering.xml');
    if (numFile) {
      const numbering = await numFile.async('string');
      zip.file('word/numbering.xml', mergeNumbering(numbering));
    }
  }

  // Add media parts.
  for (const img of ctx.images) {
    zip.file(`word/media/${img.name}`, img.data);
  }

  return await zip.generateAsync({ type: 'blob', mimeType: WORD_MIME });
}

// ─── Helpers ────────────────────────────────────────────────

function extractSectPr(documentXml: string): string {
  const start = documentXml.lastIndexOf('<w:sectPr');
  const endTag = '</w:sectPr>';
  const end = documentXml.indexOf(endTag, start);
  if (start === -1) return '';
  if (end === -1) {
    // Self-closing sectPr
    const selfEnd = documentXml.indexOf('/>', start);
    return selfEnd === -1 ? '' : documentXml.slice(start, selfEnd + 2);
  }
  return documentXml.slice(start, end + endTag.length);
}

function extractRootTag(documentXml: string): string {
  const start = documentXml.indexOf('<w:document');
  const end = documentXml.indexOf('>', start);
  return documentXml.slice(start, end + 1);
}

/** Body may contain wp:/a:/pic: drawings — make sure the root declares them. */
function withDrawingNamespaces(rootTag: string): string {
  const needed: Array<[string, string]> = [
    ['xmlns:wp=', 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'],
    ['xmlns:a=', 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'],
    ['xmlns:pic=', 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'],
  ];
  let out = rootTag;
  for (const [probe, decl] of needed) {
    if (!out.includes(probe)) {
      out = out.replace('<w:document', `<w:document ${decl}`);
    }
  }
  return out;
}

function ensureImageDefaults(contentTypes: string, exts: string[]): string {
  let out = contentTypes;
  for (const ext of new Set(exts)) {
    if (!out.includes(`Extension="${ext}"`)) {
      out = out.replace('</Types>', `<Default Extension="${ext}" ContentType="image/${ext}"/></Types>`);
    }
  }
  return out;
}

/** Append our bullet + decimal list definitions with non-colliding IDs. */
function mergeNumbering(numberingXml: string): string {
  if (numberingXml.includes(`w:numId="${TPL_NUM_BULLET}"`)) return numberingXml;
  const abstracts = `<w:abstractNum w:abstractNumId="${TPL_ABS_BULLET}">
<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="${TPL_ABS_ORDERED}">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%3."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>`;
  const nums = `<w:num w:numId="${TPL_NUM_BULLET}"><w:abstractNumId w:val="${TPL_ABS_BULLET}"/></w:num>
<w:num w:numId="${TPL_NUM_ORDERED}"><w:abstractNumId w:val="${TPL_ABS_ORDERED}"/></w:num>`;

  // abstractNum elements must precede all <w:num> elements.
  const firstNum = numberingXml.indexOf('<w:num ');
  if (firstNum !== -1) {
    return (
      numberingXml.slice(0, firstNum)
      + abstracts
      + numberingXml.slice(firstNum).replace('</w:numbering>', `${nums}</w:numbering>`)
    );
  }
  return numberingXml.replace('</w:numbering>', `${abstracts}${nums}</w:numbering>`);
}
