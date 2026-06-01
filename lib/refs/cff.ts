// Minimal Citation File Format (CFF v1.x) parser. YAML, but we use a tiny
// flat key/value reader sufficient for the common fields. References section
// is iterated; the top-level project itself is also imported.

import type { Author, Ref } from '@/store/types';

interface Cursor {
  lines: string[];
  i: number;
}

function lineKey(line: string): { key: string; value: string; indent: number } | null {
  const m = /^(\s*)([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
  if (!m) return null;
  return { indent: m[1].length, key: m[2], value: m[3].trim() };
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Read a flat block of key/value pairs at the given indent until a dedent. */
function readBlock(c: Cursor, baseIndent: number): Record<string, string> {
  const out: Record<string, string> = {};
  while (c.i < c.lines.length) {
    const line = c.lines[c.i];
    if (!line.trim()) {
      c.i += 1;
      continue;
    }
    const parsed = lineKey(line);
    if (!parsed) {
      c.i += 1;
      continue;
    }
    if (parsed.indent < baseIndent) break;
    if (parsed.indent === baseIndent) {
      if (parsed.value) out[parsed.key] = stripQuotes(parsed.value);
      c.i += 1;
    } else {
      // Skip nested unknown blocks.
      c.i += 1;
    }
  }
  return out;
}

/** Read `authors:` style YAML list of name maps. */
function readAuthorList(c: Cursor, baseIndent: number): Author[] {
  const out: Author[] = [];
  while (c.i < c.lines.length) {
    const line = c.lines[c.i];
    if (!line.trim()) {
      c.i += 1;
      continue;
    }
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    if (indent < baseIndent || !trimmed.startsWith('-')) break;
    // Item start: parse subsequent indented key/values.
    c.i += 1;
    const obj: Record<string, string> = {};
    const inlineKv = /^-\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(trimmed);
    if (inlineKv) obj[inlineKv[1]] = stripQuotes(inlineKv[2].trim());
    while (c.i < c.lines.length) {
      const nl = c.lines[c.i];
      if (!nl.trim()) {
        c.i += 1;
        continue;
      }
      const nt = nl.trimStart();
      const nind = nl.length - nt.length;
      if (nind <= baseIndent) break;
      const kv = lineKey(nl);
      if (kv && kv.value) obj[kv.key] = stripQuotes(kv.value);
      c.i += 1;
    }
    out.push({
      family: obj['family-names'] || obj.family || undefined,
      given: obj['given-names'] || obj.given || undefined,
      literal: obj.name || obj.literal || undefined,
    });
  }
  return out;
}

function toRef(meta: Record<string, string>, authors: Author[], idx: number): Ref | null {
  const title = meta.title;
  if (!title) return null;
  const yearRaw = meta.year || meta['date-released'] || meta['date-published'] || '';
  const ymatch = /\b(19|20)\d{2}\b/.exec(yearRaw);
  return {
    id: `cff-${idx}`,
    type: meta.type === 'article' ? 'journal-article' : 'other',
    authors,
    title,
    containerTitle: meta.journal || meta['conference-title'] || meta.repository || undefined,
    year: ymatch ? parseInt(ymatch[0], 10) : undefined,
    volume: meta.volume || undefined,
    issue: meta.issue || undefined,
    pages: meta['start'] && meta['end'] ? `${meta['start']}-${meta['end']}` : meta.pages || undefined,
    doi: meta.doi || undefined,
    url: meta.url || meta['repository-code'] || meta.repository || undefined,
    abstract: meta.abstract || undefined,
    publisher: meta.publisher || undefined,
  };
}

export function parseCff(text: string): Ref[] {
  const c: Cursor = { lines: text.split(/\r?\n/), i: 0 };
  const refs: Ref[] = [];
  let topMeta: Record<string, string> = {};
  let topAuthors: Author[] = [];
  let inReferences = false;
  let refIdx = 1;

  while (c.i < c.lines.length) {
    const line = c.lines[c.i];
    if (!line.trim()) {
      c.i += 1;
      continue;
    }
    const parsed = lineKey(line);
    if (!parsed) {
      c.i += 1;
      continue;
    }
    if (parsed.indent === 0) {
      if (parsed.key === 'authors') {
        c.i += 1;
        topAuthors = readAuthorList(c, 2);
        continue;
      }
      if (parsed.key === 'references') {
        c.i += 1;
        inReferences = true;
        // Iterate list items (each is a ref).
        while (c.i < c.lines.length) {
          const ln = c.lines[c.i];
          if (!ln.trim()) {
            c.i += 1;
            continue;
          }
          const t = ln.trimStart();
          const ind = ln.length - t.length;
          if (ind === 0) break;
          if (!t.startsWith('-')) {
            c.i += 1;
            continue;
          }
          c.i += 1;
          const meta = readBlock(c, ind + 2);
          // Detect inline authors of the ref (sub-list).
          let refAuthors: Author[] = [];
          // Reparse — if we just skipped 'authors:' inside readBlock, it didn't capture the list.
          // Rewind: simpler — leave refAuthors empty if not flat-string.
          refAuthors = meta.authors ? meta.authors.split(/\s*,\s*/).map((n) => ({ literal: n })) : [];
          const ref = toRef(meta, refAuthors, refIdx);
          if (ref) {
            refs.push(ref);
            refIdx += 1;
          }
        }
        inReferences = false;
        continue;
      }
      if (parsed.value) topMeta[parsed.key] = stripQuotes(parsed.value);
    }
    c.i += 1;
  }

  // Top-level project also becomes a citation if it has a title.
  const topRef = toRef(topMeta, topAuthors, 0);
  if (topRef) refs.unshift(topRef);
  return refs;
}

export function looksLikeCff(text: string): boolean {
  return /^cff-version\s*:/m.test(text.slice(0, 500));
}
