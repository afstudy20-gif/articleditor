import { escapeXml } from '@/lib/refs/enxml';

export const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const EMU_PER_PX = 9525; // 96 dpi
export const MAX_IMG_WIDTH_EMU = Math.round(6 * 914400); // 6 inches

export type OoxmlPackageContext = {
  images: Array<{ ext: string }>;
  usesNumbering: boolean;
};

export function richContentTypesXml(ctx: OoxmlPackageContext): string {
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
${ctx.usesNumbering ? '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' : ''}
</Types>`;
}

export const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Times New Roman 12pt, 1.5 line spacing, justified — matches the editor's
// default typography instead of Word's Calibri default.
export const RICH_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="Heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;

export const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:updateFields w:val="true"/>
</w:settings>`;

export function textRun(text: string, superscript = false): string {
  const properties = superscript
    ? '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
    : '';
  if (text === '') return `<w:r>${properties}<w:t xml:space="preserve"> </w:t></w:r>`;
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

export function parseDataUrl(dataUrl: string): { data: Uint8Array; ext: string } | null {
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

export function cleanCaptionPrefix(caption: string): string {
  const trimmed = caption.trim();
  if (!trimmed) return '';
  // Match things like "Figure 1.", "Fig. 2:", "Table 12 -", "Tablo 3" etc.
  const regex = /^\s*(?:Figure|Fig|Resim|Res|Table|Tab|Tablo)\.?\s*\d+\s*[\.:\-—–\s]*/i;
  return trimmed.replace(regex, '').trim();
}
