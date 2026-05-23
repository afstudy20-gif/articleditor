import type { Ref, RefType } from '@/store/types';

const TYPE_MAP: Record<RefType, string> = {
  'journal-article': 'article',
  book: 'book',
  'book-chapter': 'incollection',
  'conference-paper': 'inproceedings',
  thesis: 'phdthesis',
  webpage: 'online',
  report: 'techreport',
  other: 'misc',
};

export function generateBibtex(refs: Ref[]): string {
  const usedKeys = new Set<string>();
  return refs.map((r) => refToBibtex(r, usedKeys)).join('\n\n');
}

export function generateCitationKey(ref: Ref, used: Set<string> = new Set()): string {
  const first = ref.authors[0];
  const family = first?.family || first?.literal || 'Anonymous';
  const cleanFamily = family
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
  const year = ref.year ?? 'nd';
  let base = `${cleanFamily || 'anon'}${year}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (const suffix of 'abcdefghijklmnopqrstuvwxyz') {
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Fallback with random suffix
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  const final = `${base}_${i}`;
  used.add(final);
  return final;
}

function refToBibtex(ref: Ref, usedKeys: Set<string>): string {
  const key = generateCitationKey(ref, usedKeys);
  const type = TYPE_MAP[ref.type] ?? 'misc';
  const fields: Array<[string, string]> = [];

  if (ref.authors.length > 0) {
    fields.push(['author', formatBibAuthors(ref.authors)]);
  }
  if (ref.title) fields.push(['title', escapeBib(ref.title)]);
  if (ref.containerTitle) {
    const key = type === 'incollection' || type === 'inproceedings' ? 'booktitle' : 'journal';
    fields.push([key, escapeBib(ref.containerTitle)]);
  }
  if (ref.year) fields.push(['year', String(ref.year)]);
  if (ref.volume) fields.push(['volume', ref.volume]);
  if (ref.issue) fields.push(['number', ref.issue]);
  if (ref.pages) fields.push(['pages', ref.pages.replace(/-/g, '--')]);
  if (ref.publisher) fields.push(['publisher', escapeBib(ref.publisher)]);
  if (ref.doi) fields.push(['doi', ref.doi]);
  if (ref.pmid) fields.push(['pmid', ref.pmid]);
  if (ref.url) fields.push(['url', ref.url]);
  if (ref.abstract) fields.push(['abstract', escapeBib(ref.abstract)]);

  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${type}{${key},\n${body}\n}`;
}

function formatBibAuthors(authors: Array<{ family?: string; given?: string; literal?: string }>): string {
  return authors
    .map((a) => {
      if (a.literal) return `{${escapeBib(a.literal)}}`;
      const fam = a.family ?? '';
      const giv = a.given ?? '';
      if (fam && giv) return `${escapeBib(fam)}, ${escapeBib(giv)}`;
      return escapeBib(fam || giv);
    })
    .filter(Boolean)
    .join(' and ');
}

function escapeBib(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/—/g, '---')
    .replace(/–/g, '--');
}

// Map ref id (internal) to citation key for use in \cite{...}
export function buildCitationKeyMap(refs: Ref[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const r of refs) {
    map.set(r.id, generateCitationKey(r, used));
  }
  return map;
}
