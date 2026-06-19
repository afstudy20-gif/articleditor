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
  let i = 0;
  // Scan for entry starts "@type{" and brace-match to the closing brace so we
  // support both multi-line and single-line entries (the previous \n\s*\}
  // regex dropped single-line and @string-less compact exports entirely).
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor);
    if (at < 0) break;
    const header = text.slice(at).match(/^@(\w+)\s*\{/);
    if (!header) {
      cursor = at + 1;
      continue;
    }
    const entryType = header[1].toLowerCase();
    // Skip @string / @comment / @preamble macros — they hold no reference.
    if (entryType === 'string' || entryType === 'comment' || entryType === 'preamble') {
      cursor = at + header[0].length;
      continue;
    }
    const openBraceAt = at + header[0].length - 1;
    const closeBraceAt = matchBrace(text, openBraceAt);
    if (closeBraceAt < 0) break;
    const inner = text.slice(openBraceAt + 1, closeBraceAt);
    cursor = closeBraceAt + 1;

    // Split off the citation key: everything up to the first top-level comma.
    const commaIdx = findTopLevelComma(inner);
    const key = (commaIdx >= 0 ? inner.slice(0, commaIdx) : inner).trim();
    const body = commaIdx >= 0 ? inner.slice(commaIdx + 1) : '';
    const fields = parseFields(body);
    const ref = bibToRef(entryType, key, fields, `bib-${i++}`);
    if (ref) refs.push(ref);
  }
  return refs;
}

/** Index of the matching closing brace for the brace at `openIdx`, or -1. */
function matchBrace(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** First comma not nested inside braces or quotes (the key/body separator). */
function findTopLevelComma(s: string): number {
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"' && s[i - 1] !== '\\') inQuotes = false;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
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
  const url = f.url;

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
