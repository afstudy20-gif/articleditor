import type { Ref } from '@/store/types';
import { firstAuthorFamily, initialsOf } from './normalize';

// EndNote ADDIN EN.CITE XML payload generator.
// Builds <EndNote><Cite>...</Cite>...</EndNote> for one or more refs.

export function buildEnCiteXml(refs: Ref[], displayText: string): string {
  const cites = refs.map((r) => citeBlock(r)).join('');
  return `<EndNote><Cite>${cites}</Cite><DisplayText>${escapeXml(displayText)}</DisplayText></EndNote>`;
}

export function buildEnCiteXmlMulti(refs: Ref[], displayText: string): string {
  // Multi-cite uses repeated <Cite> children, not nested.
  const cites = refs.map((r) => `<Cite>${citeBlock(r)}</Cite>`).join('');
  return `<EndNote>${cites}<DisplayText>${escapeXml(displayText)}</DisplayText></EndNote>`;
}

function citeBlock(ref: Ref): string {
  const author = firstAuthorFamily(ref.authors);
  const year = ref.year ?? 0;
  const rec = ref.enRecNum ?? 0;
  const inner: string[] = [];
  inner.push(`<Author>${escapeXml(author)}</Author>`);
  if (ref.year) inner.push(`<Year>${year}</Year>`);
  inner.push(`<RecNum>${rec}</RecNum>`);
  inner.push(`<record>`);
  inner.push(`<rec-number>${rec}</rec-number>`);
  inner.push(`<ref-type name="Journal Article">17</ref-type>`);
  inner.push(`<contributors><authors>`);
  for (const a of ref.authors) {
    let name = '';
    if (a.family) {
      // EndNote prefers "Family, Given" with initials. Preserve given as-is so
      // EndNote can render full or abbreviated per style.
      name = a.given ? `${a.family}, ${a.given}` : a.family;
    } else if (a.literal) {
      name = a.literal;
    } else if (a.given) {
      name = a.given;
    }
    if (name) inner.push(`<author>${escapeXml(name)}</author>`);
  }
  inner.push(`</authors></contributors>`);
  if (ref.title) inner.push(`<titles><title>${escapeXml(ref.title)}</title>${ref.containerTitle ? `<secondary-title>${escapeXml(ref.containerTitle)}</secondary-title>` : ''}</titles>`);
  if (ref.containerTitle) inner.push(`<periodical><full-title>${escapeXml(ref.containerTitle)}</full-title></periodical>`);
  if (ref.pages) inner.push(`<pages>${escapeXml(ref.pages)}</pages>`);
  if (ref.volume) inner.push(`<volume>${escapeXml(ref.volume)}</volume>`);
  if (ref.issue) inner.push(`<number>${escapeXml(ref.issue)}</number>`);
  if (ref.year) inner.push(`<dates><year>${year}</year></dates>`);
  if (ref.doi) inner.push(`<electronic-resource-num>${escapeXml(ref.doi)}</electronic-resource-num>`);
  if (ref.url) inner.push(`<urls><related-urls><url>${escapeXml(ref.url)}</url></related-urls></urls>`);
  inner.push(`</record>`);
  return inner.join('');
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Vancouver-style display text for a numbered citation: [1], [1,2], [1-3]
export function formatVancouverDisplay(refNumbers: number[]): string {
  if (refNumbers.length === 0) return '';
  const sorted = [...refNumbers].sort((a, b) => a - b);
  const groups: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    groups.push([start, prev]);
    start = n;
    prev = n;
  }
  groups.push([start, prev]);
  const inner = groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
  return `[${inner}]`;
}
