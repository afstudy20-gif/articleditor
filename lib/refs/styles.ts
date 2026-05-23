import type { Ref } from '@/store/types';
import { vancouverAuthorList, firstAuthorFamily } from './normalize';

export type CitationStyle = 'vancouver' | 'apa' | 'ama' | 'ieee';

export const STYLE_LABELS: Record<CitationStyle, string> = {
  vancouver: 'Vancouver',
  apa: 'APA 7',
  ama: 'AMA',
  ieee: 'IEEE',
};

// In-text citation display. Numbers parameter = ref numbers in order of citation.
// refs parameter = the actual Ref objects for author-year styles.
export function formatInTextCitation(style: CitationStyle, refs: Ref[], numbers: number[]): string {
  switch (style) {
    case 'apa':
      return formatApaInText(refs);
    case 'vancouver':
    case 'ama':
      return formatNumeric(numbers, '[', ']');
    case 'ieee':
      return formatNumeric(numbers, '[', ']');
    default:
      return formatNumeric(numbers, '[', ']');
  }
}

function formatApaInText(refs: Ref[]): string {
  if (refs.length === 0) return '';
  const parts = refs
    .map((r) => {
      const author = firstAuthorFamily(r.authors);
      const year = r.year ?? 'n.d.';
      const co = r.authors.length === 2 && r.authors[1].family ? ` & ${r.authors[1].family}` : '';
      const etAl = r.authors.length > 2 ? ' et al.' : '';
      return `${author}${co}${etAl}, ${year}`;
    })
    .join('; ');
  return `(${parts})`;
}

function formatNumeric(numbers: number[], open: string, close: string): string {
  if (numbers.length === 0) return '';
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups: Array<[number, number]> = [];
  let s = sorted[0];
  let p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) {
      p = sorted[i];
    } else {
      groups.push([s, p]);
      s = sorted[i];
      p = sorted[i];
    }
  }
  groups.push([s, p]);
  return `${open}${groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',')}${close}`;
}

// Bibliography entry formatting. n = ordinal (1-based) for numeric styles.
export function formatBibEntry(style: CitationStyle, r: Ref, n: number): string {
  switch (style) {
    case 'apa':
      return formatApaEntry(r);
    case 'vancouver':
    case 'ama':
      return formatVancouverEntry(r, n);
    case 'ieee':
      return formatIeeeEntry(r, n);
    default:
      return formatVancouverEntry(r, n);
  }
}

function formatVancouverEntry(r: Ref, n: number): string {
  const parts: string[] = [`${n}.`];
  const authors = vancouverAuthorList(r.authors, 6);
  if (authors) parts.push(`${authors}.`);
  if (r.title) parts.push(`${stripPeriod(r.title)}.`);
  if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)}.`);
  const yvi: string[] = [];
  if (r.year) yvi.push(`${r.year}`);
  if (r.volume) yvi.push(`;${r.volume}`);
  if (r.issue) yvi.push(`(${r.issue})`);
  if (r.pages) yvi.push(`:${r.pages}`);
  if (yvi.length) parts.push(`${yvi.join('')}.`);
  if (r.doi) parts.push(`doi:${r.doi}`);
  return parts.join(' ');
}

function formatIeeeEntry(r: Ref, n: number): string {
  const parts: string[] = [`[${n}]`];
  const authors = vancouverAuthorList(r.authors, 6).replace(/, et al$/, ', et al.');
  if (authors) parts.push(`${authors},`);
  if (r.title) parts.push(`"${stripPeriod(r.title)},"`);
  if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)},`);
  if (r.volume) parts.push(`vol. ${r.volume},`);
  if (r.issue) parts.push(`no. ${r.issue},`);
  if (r.pages) parts.push(`pp. ${r.pages},`);
  if (r.year) parts.push(`${r.year}.`);
  if (r.doi) parts.push(`doi: ${r.doi}`);
  return parts.join(' ');
}

function formatApaEntry(r: Ref): string {
  const parts: string[] = [];
  const authors = apaAuthorList(r);
  if (authors) parts.push(`${authors}`);
  if (r.year) parts.push(`(${r.year}).`);
  if (r.title) parts.push(`${stripPeriod(r.title)}.`);
  if (r.containerTitle) {
    let cite = `*${stripPeriod(r.containerTitle)}*`;
    if (r.volume) cite += `, ${r.volume}`;
    if (r.issue) cite += `(${r.issue})`;
    if (r.pages) cite += `, ${r.pages}`;
    parts.push(`${cite}.`);
  }
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  return parts.join(' ');
}

function apaAuthorList(r: Ref): string {
  const authors = r.authors;
  if (authors.length === 0) return '';
  const formatOne = (a: typeof authors[number]): string => {
    if (a.literal) return a.literal;
    const fam = a.family ?? '';
    const giv = a.given ?? '';
    const inits = giv
      .replace(/\./g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `${t[0].toUpperCase()}.`)
      .join(' ');
    return fam && inits ? `${fam}, ${inits}` : fam || inits;
  };
  if (authors.length === 1) return formatOne(authors[0]);
  if (authors.length === 2) return `${formatOne(authors[0])}, & ${formatOne(authors[1])}`;
  if (authors.length <= 20) {
    const list = authors.slice(0, -1).map(formatOne).join(', ');
    return `${list}, & ${formatOne(authors[authors.length - 1])}`;
  }
  // 21+: APA 7 first 19 ... last
  const first19 = authors.slice(0, 19).map(formatOne).join(', ');
  return `${first19}, ... ${formatOne(authors[authors.length - 1])}`;
}

function stripPeriod(s: string): string {
  return s.replace(/\.+\s*$/, '');
}

// Sort refs for bibliography ordering. APA = alphabetical by first author family;
// others = order of citation in document (caller provides already-ordered array).
export function orderRefsForBib<T extends Ref>(style: CitationStyle, refs: T[]): T[] {
  if (style !== 'apa') return refs;
  return [...refs].sort((a, b) => {
    const fa = (a.authors[0]?.family ?? a.authors[0]?.literal ?? '').toLowerCase();
    const fb = (b.authors[0]?.family ?? b.authors[0]?.literal ?? '').toLowerCase();
    return fa.localeCompare(fb);
  });
}

export function isNumericStyle(style: CitationStyle): boolean {
  return style === 'vancouver' || style === 'ama' || style === 'ieee';
}
