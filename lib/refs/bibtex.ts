import type { Author, Ref, RefType } from '@/store/types';

// Minimal BibTeX parser. Handles @type{key, field = {value} or "value", ...}

const TYPE_MAP: Record<string, RefType> = {
  article: 'journal-article',
  book: 'book',
  inbook: 'book-chapter',
  incollection: 'book-chapter',
  inproceedings: 'conference-paper',
  conference: 'conference-paper',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  misc: 'other',
  techreport: 'report',
  online: 'webpage',
};

export function parseBibtex(text: string): Ref[] {
  const refs: Ref[] = [];
  // Find all entries
  const entryRe = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = entryRe.exec(text))) {
    const entryType = m[1].toLowerCase();
    const key = m[2].trim();
    const body = m[3];
    const fields = parseFields(body);
    const ref = bibToRef(entryType, key, fields, `bib-${i++}`);
    if (ref) refs.push(ref);
  }
  return refs;
}

function parseFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // field = {...} or "..." possibly with nested braces
  const re = /(\w+)\s*=\s*(\{|")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const name = m[1].toLowerCase();
    const opener = m[2];
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    if (opener === '{') {
      while (i < body.length && depth > 0) {
        const ch = body[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) break;
        i++;
      }
    } else {
      // " — find next unescaped quote
      while (i < body.length) {
        if (body[i] === '"' && body[i - 1] !== '\\') break;
        i++;
      }
    }
    const value = body.slice(start, i).trim();
    out[name] = cleanBibValue(value);
    re.lastIndex = i + 1;
  }
  return out;
}

function cleanBibValue(s: string): string {
  return s
    .replace(/\{([^{}]*)\}/g, '$1') // strip simple braces
    .replace(/\\&/g, '&')
    .replace(/\\\$/g, '$')
    .replace(/\s+/g, ' ')
    .trim();
}

function bibToRef(
  entryType: string,
  _key: string,
  f: Record<string, string>,
  id: string,
): Ref | null {
  const type = TYPE_MAP[entryType] ?? 'other';
  const authors = f.author ? parseBibAuthors(f.author) : [];
  const yearMatch = f.year?.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;
  const pages = f.pages?.replace(/--/g, '-');
  const doi = f.doi ? cleanDoi(f.doi) : undefined;
  const url = f.url || (doi ? undefined : undefined);

  if (!f.title && authors.length === 0 && !year) return null;

  return {
    id,
    type,
    authors,
    title: f.title,
    containerTitle: f.journal || f.booktitle,
    year,
    volume: f.volume,
    issue: f.number || f.issue,
    pages,
    publisher: f.publisher,
    doi,
    pmid: f.pmid && /^\d{4,9}$/.test(f.pmid) ? f.pmid : undefined,
    url,
    abstract: f.abstract,
  };
}

function parseBibAuthors(raw: string): Author[] {
  const list = raw.split(/\s+and\s+/i);
  return list
    .map((a) => {
      const t = a.trim();
      if (!t) return null;
      const comma = t.match(/^([^,]+),\s*(.+)$/);
      if (comma) return { family: comma[1].trim(), given: comma[2].trim() } as Author;
      const parts = t.split(/\s+/);
      if (parts.length >= 2) {
        return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') } as Author;
      }
      return { literal: t } as Author;
    })
    .filter((a): a is Author => a !== null);
}

function cleanDoi(s: string): string {
  return s
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '');
}
