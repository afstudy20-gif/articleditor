import JSZip from 'jszip';
import type { Ref, MarkerOccurrence } from '@/store/types';
import { buildEnCiteXmlMulti, formatVancouverDisplay, escapeXml } from '@/lib/refs/enxml';
import { formatBibEntry, formatInTextCitation, type StyleId, isNumericStyle } from '@/lib/refs/styles';

export type BuildMode = 'active' | 'placeholder' | 'plain';

export type BuildInput = {
  bodyText: string;
  markers: MarkerOccurrence[];
  refs: Ref[];
  mode: BuildMode;
  title?: string;
  style?: StyleId;
  lineNumbers?: boolean;
};

// Assign EndNote record numbers (sequential, starting from 1).
export function assignRecNums(refs: Ref[]): Ref[] {
  return refs.map((r, i) => ({ ...r, enRecNum: r.enRecNum ?? i + 1 }));
}

// Resolve marker ref numbers (1-indexed from original biblio order) into Ref objects.
function resolveRefs(markerNums: number[], refs: Ref[]): Ref[] {
  return markerNums.map((n) => refs[n - 1]).filter(Boolean);
}

export async function buildDocx(input: BuildInput): Promise<Blob> {
  const refs = assignRecNums(input.refs);
  const xml = buildDocumentXml(input, refs);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.folder('_rels')!.file('.rels', ROOT_RELS_XML);
  const wordFolder = zip.folder('word')!;
  wordFolder.file('document.xml', xml);
  wordFolder.file('styles.xml', STYLES_XML);
  wordFolder.file('settings.xml', SETTINGS_XML);

  const titleText = input.title ?? 'Manuscript';
  const exportDateText = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  wordFolder.file('header1.xml', headerXml(titleText));
  wordFolder.file('footer1.xml', footerXml(exportDateText));

  wordFolder.folder('_rels')!.file('document.xml.rels', DOC_RELS_XML);
  return await zip.generateAsync({ type: 'blob', mimeType: WORD_MIME });
}

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function buildDocumentXml(input: BuildInput, refs: Ref[]): string {
  const style: StyleId = input.style ?? 'vancouver';
  const paragraphs: string[] = [];
  
  const firstLine = input.bodyText.split(/\r?\n/)[0]?.trim() ?? '';
  const titleMatchesFirstLine = input.title && firstLine.toLowerCase() === input.title.toLowerCase();

  if (input.title && !titleMatchesFirstLine) {
    paragraphs.push(paragraphXml(`<w:pPr><w:pStyle w:val="Title"/></w:pPr>${runXml(input.title)}`));
  }
  const bodyParas = input.bodyText.split(/\r?\n/);
  let cursor = 0;
  for (const para of bodyParas) {
    const paraStart = cursor;
    const paraEnd = cursor + para.length;
    const paraMarkers = input.markers.filter(
      (m) => m.startIndex >= paraStart && m.endIndex <= paraEnd,
    );
    paragraphs.push(buildParagraph(para, paraMarkers, paraStart, refs, input.mode, style));
    cursor = paraEnd + 1; // +1 for the \n
  }
  const bibHeading = style === 'apa' ? 'Kaynakça' : 'Kaynaklar';
  paragraphs.push(paragraphXml(`<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runXml(bibHeading)}`));
  refs.forEach((r, i) => {
    const formatted = formatBibEntry(style, r, i + 1);
    paragraphs.push(paragraphXml(runXml(formatted)));
  });

  const lineNumXml = input.lineNumbers ? '<w:lnNumType w:countBy="1" w:restart="continuous"/>' : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
            mc:Ignorable="w14"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
<w:body>
${paragraphs.join('\n')}
<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/>${lineNumXml}<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
}

function buildParagraph(
  text: string,
  paraMarkers: MarkerOccurrence[],
  paraStart: number,
  refs: Ref[],
  mode: BuildMode,
  style: StyleId,
): string {
  if (paraMarkers.length === 0) {
    return paragraphXml(runXml(text || ' '));
  }
  const sorted = [...paraMarkers].sort((a, b) => a.startIndex - b.startIndex);
  const runs: string[] = [];
  let cursor = paraStart;
  for (const m of sorted) {
    if (m.startIndex > cursor) {
      runs.push(runXml(text.slice(cursor - paraStart, m.startIndex - paraStart)));
    }
    const resolved = resolveRefs(m.refNumbers, refs);
    const display = formatInTextCitation(style, resolved, m.refNumbers);
    if (mode === 'active' && resolved.length > 0) {
      runs.push(activeEndNoteField(resolved, display));
    } else if (mode === 'placeholder' && resolved.length > 0) {
      runs.push(runXml(placeholderText(resolved)));
    } else {
      runs.push(runXml(display));
    }
    cursor = m.endIndex;
  }
  const tailStart = cursor - paraStart;
  if (tailStart < text.length) {
    runs.push(runXml(text.slice(tailStart)));
  }
  return paragraphXml(runs.join(''));
}

export function placeholderText(refs: Ref[]): string {
  return refs
    .map((r) => {
      const author = r.authors[0]?.family || r.authors[0]?.literal || 'Anonymous';
      const year = r.year ?? 0;
      const rec = r.enRecNum ?? 0;
      return `{${author}, ${year} #${rec}}`;
    })
    .join('');
}

export function activeEndNoteField(refs: Ref[], displayText: string): string {
  const xmlPayload = buildEnCiteXmlMulti(refs, displayText);
  const instr = ` ADDIN EN.CITE ${xmlPayload} `;
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${escapeXml(
    instr,
  )}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t xml:space="preserve">${escapeXml(
    displayText,
  )}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

function paragraphXml(inner: string): string {
  return `<w:p>${inner}</w:p>`;
}

function runXml(text: string): string {
  if (text === '') return '';
  return `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

// formatRefVancouver moved to lib/refs/styles.ts (formatBibEntry).
// stripFinalPeriod inlined into styles.ts

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:updateFields w:val="true"/>
</w:settings>`;

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
