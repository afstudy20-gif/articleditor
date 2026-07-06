import type { Ref } from '@/store/types';
import { buildEnCiteXmlMulti, escapeXml } from '@/lib/refs/enxml';

// Assign EndNote record numbers (sequential, starting from 1).
export function assignRecNums(refs: Ref[]): Ref[] {
  return refs.map((r, i) => ({ ...r, enRecNum: r.enRecNum ?? i + 1 }));
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

export function activeEndNoteField(
  refs: Ref[],
  displayText: string,
  superscript = false,
): string {
  const xmlPayload = buildEnCiteXmlMulti(refs, displayText);
  const instr = ` ADDIN EN.CITE ${xmlPayload} `;
  const resultProperties = superscript
    ? '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
    : '';
  return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${escapeXml(
    instr,
  )}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r>${resultProperties}<w:t xml:space="preserve">${escapeXml(
    displayText,
  )}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}
