// CSL-JSON parser (Citation Style Language JSON). Zotero's default JSON export
// and the format Pandoc consumes. Accepts either a top-level array or a
// single object; we ignore items that lack a title or id.

import type { Author, Ref, RefType } from '@/store/types';

const TYPE_MAP: Record<string, RefType> = {
  'article-journal': 'journal-article',
  article: 'journal-article',
  'article-magazine': 'journal-article',
  'article-newspaper': 'journal-article',
  book: 'book',
  chapter: 'book-chapter',
  'book-chapter': 'book-chapter',
  'paper-conference': 'conference-paper',
  thesis: 'thesis',
  report: 'report',
  webpage: 'webpage',
  software: 'other',
  dataset: 'other',
};

interface CSLName {
  family?: string;
  given?: string;
  literal?: string;
  'non-dropping-particle'?: string;
}

interface CSLDate {
  'date-parts'?: number[][];
  literal?: string;
  raw?: string;
}

interface CSLItem {
  id?: string | number;
  type?: string;
  title?: string;
  author?: CSLName[];
  editor?: CSLName[];
  'container-title'?: string;
  publisher?: string;
  issued?: CSLDate;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  DOI?: string;
  doi?: string;
  PMID?: string;
  pmid?: string;
  URL?: string;
  url?: string;
  abstract?: string;
}

function toAuthor(n: CSLName): Author {
  if (n.literal) return { literal: n.literal };
  const family = [n['non-dropping-particle'], n.family].filter(Boolean).join(' ').trim();
  return { family: family || undefined, given: n.given };
}

function yearOf(d?: CSLDate): number | undefined {
  const parts = d?.['date-parts']?.[0];
  if (parts && typeof parts[0] === 'number') return parts[0];
  const raw = d?.literal || d?.raw;
  if (!raw) return undefined;
  const m = /\b(19|20)\d{2}\b/.exec(raw);
  return m ? parseInt(m[0], 10) : undefined;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function toRef(item: CSLItem, fallbackId: string): Ref | null {
  const title = str(item.title);
  if (!title) return null;
  const id = str(item.id) ?? fallbackId;
  return {
    id: `csl-${id}`,
    type: TYPE_MAP[item.type ?? ''] ?? 'other',
    authors: (item.author ?? []).map(toAuthor).filter((a) => a.family || a.given || a.literal),
    title,
    containerTitle: str(item['container-title']),
    year: yearOf(item.issued),
    volume: str(item.volume),
    issue: str(item.issue),
    pages: str(item.page),
    doi: str(item.DOI ?? item.doi),
    pmid: str(item.PMID ?? item.pmid),
    url: str(item.URL ?? item.url),
    abstract: str(item.abstract),
    publisher: str(item.publisher),
  };
}

export function parseCslJson(text: string): Ref[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const items: CSLItem[] = Array.isArray(data) ? (data as CSLItem[]) : [data as CSLItem];
  const out: Ref[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const ref = toRef(items[i], String(i + 1));
    if (ref) out.push(ref);
  }
  return out;
}

export function looksLikeCslJson(text: string): boolean {
  const s = text.trim();
  if (!s.startsWith('[') && !s.startsWith('{')) return false;
  // Cheap probe: any CSL item must have one of these top-level keys.
  return /"(type|title|container-title|issued|DOI|author)"\s*:/.test(s);
}
