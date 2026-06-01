// Header-driven CSV/TSV import. Accepts any column ordering; columns matched
// by case/accent-insensitive header alias (title/authors/journal/year/...).
// Authors split by ';' or '|'; falls back to ',' if neither present.

import type { Author, Ref } from '@/store/types';

const HEADER_ALIASES: Record<string, string> = {
  title: 'title',
  baslik: 'title',
  baslık: 'title',
  authors: 'authors',
  author: 'authors',
  yazar: 'authors',
  yazarlar: 'authors',
  journal: 'container',
  publication: 'container',
  source: 'container',
  dergi: 'container',
  'container-title': 'container',
  year: 'year',
  yil: 'year',
  yıl: 'year',
  date: 'year',
  volume: 'volume',
  cilt: 'volume',
  issue: 'issue',
  sayi: 'issue',
  sayı: 'issue',
  number: 'issue',
  pages: 'pages',
  page: 'pages',
  sayfa: 'pages',
  doi: 'doi',
  pmid: 'pmid',
  url: 'url',
  link: 'url',
  abstract: 'abstract',
  ozet: 'abstract',
  özet: 'abstract',
  publisher: 'publisher',
  yayinci: 'publisher',
  yayıncı: 'publisher',
};

function normalize(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[Ää]/g, 'a')
    .replace(/[Öö]/g, 'o')
    .replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's')
    .replace(/[Çç]/g, 'c')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[İı]/g, 'i');
}

function parseAuthors(raw: string): Author[] {
  // Multi-author cells use ; or |. A single comma inside a cell is treated as
  // "family, given" (one author), not as a list separator — splitting on it
  // would split "Lee, Charles" into two bogus authors.
  const hasMulti = /[;|]/.test(raw);
  const commaCount = (raw.match(/,/g) ?? []).length;
  let entries: string[];
  if (hasMulti) entries = raw.split(/\s*[;|]\s*/);
  else if (commaCount === 1) entries = [raw];
  else entries = raw.split(/\s*,\s*/);
  return entries
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes(',')) {
        const [family, given] = entry.split(',', 2).map((s) => s.trim());
        return { family, given };
      }
      const parts = entry.split(/\s+/);
      if (parts.length === 1) return { literal: parts[0] };
      const last = parts.at(-1)!;
      // MEDLINE-style "Smith JA": last token is all-caps initials → family-first.
      if (/^[A-Z]{1,4}$/.test(last)) {
        return { family: parts.slice(0, -1).join(' '), given: last };
      }
      // Western-style "John Smith": last token is family name.
      return { family: last, given: parts.slice(0, -1).join(' ') };
    });
}

function parseYear(raw: string): number | undefined {
  const m = /\b(19|20)\d{2}\b/.exec(raw);
  return m ? parseInt(m[0], 10) : undefined;
}

// Minimal RFC 4180 parser: quoted fields, doubled-quote escapes, configurable delim.
function parseRow(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

export function parseCsv(text: string): Ref[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delim = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delim).map((h) => HEADER_ALIASES[normalize(h)] ?? '');
  if (!headers.includes('title')) return [];

  const refs: Ref[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseRow(lines[i], delim);
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c];
      if (key && cols[c] !== undefined) row[key] = cols[c].trim();
    }
    if (!row.title) continue;
    refs.push({
      id: `csv-${i}`,
      type: 'journal-article',
      authors: row.authors ? parseAuthors(row.authors) : [],
      title: row.title,
      containerTitle: row.container || undefined,
      year: row.year ? parseYear(row.year) : undefined,
      volume: row.volume || undefined,
      issue: row.issue || undefined,
      pages: row.pages || undefined,
      doi: row.doi || undefined,
      pmid: row.pmid || undefined,
      url: row.url || undefined,
      abstract: row.abstract || undefined,
      publisher: row.publisher || undefined,
    });
  }
  return refs;
}

export function looksLikeCsv(text: string): boolean {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = detectDelimiter(first);
  const headers = parseRow(first, delim).map((h) => HEADER_ALIASES[normalize(h)] ?? '');
  return headers.includes('title');
}
