// PubMed MEDLINE / NBIB format parser. PubMed's "Save → Format: PubMed" exports
// .nbib files in MEDLINE tagged-line format, NOT the EndNote `%T` (.enw)
// format. Lines look like `TI  - Title text`, with continuation lines indented
// by 6 spaces. Records are separated by blank lines.

import type { Author, Ref, RefType } from '@/store/types';

const PUB_TYPE_MAP: Record<string, RefType> = {
  'journal article': 'journal-article',
  book: 'book',
  'book chapter': 'book-chapter',
  'conference proceedings': 'conference-paper',
  'congress paper': 'conference-paper',
  thesis: 'thesis',
};

function mapPublicationType(values: string[]): RefType {
  for (const v of values) {
    const hit = PUB_TYPE_MAP[v.toLowerCase().trim()];
    if (hit) return hit;
  }
  return 'journal-article';
}

interface RawRecord {
  [tag: string]: string[];
}

// Split file into MEDLINE records. Blank lines separate them; lines starting
// with 6 spaces continue the previous tag's value.
function splitRecords(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  let current: RawRecord | null = null;
  let lastTag: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) {
      if (current && Object.keys(current).length > 0) {
        records.push(current);
        current = null;
        lastTag = null;
      }
      continue;
    }
    // MEDLINE tag = 4 chars: 2-4 letters + spaces + "-" at column 5.
    const m = /^([A-Z]{1,4})\s*-\s?(.*)$/.exec(raw);
    if (m) {
      if (!current) current = {};
      const [, tag, value] = m;
      const list = current[tag] ?? [];
      list.push(value);
      current[tag] = list;
      lastTag = tag;
    } else if (current && lastTag) {
      // Continuation (6-space indent in spec, but be permissive).
      const cont = raw.replace(/^\s+/, ' ');
      const list = current[lastTag];
      if (list && list.length > 0) {
        list[list.length - 1] = `${list[list.length - 1]}${cont}`;
      }
    }
  }
  if (current && Object.keys(current).length > 0) records.push(current);
  return records;
}

function parseAuthor(raw: string): Author {
  // MEDLINE format: "Family GN" (e.g. "Smith JA"). Initials follow family.
  const trimmed = raw.trim();
  if (!trimmed) return { literal: '' };
  if (trimmed.includes(',')) {
    const [family, given] = trimmed.split(',', 2).map((s) => s.trim());
    return { family, given };
  }
  const m = /^(.+?)\s+([A-Z][A-Z\-]*)$/.exec(trimmed);
  if (m) return { family: m[1].trim(), given: m[2].trim() };
  return { literal: trimmed };
}

function pickFirst(rec: RawRecord, tag: string): string | undefined {
  const v = rec[tag];
  if (!v || v.length === 0) return undefined;
  return v[0].trim() || undefined;
}

function parseYear(rec: RawRecord): number | undefined {
  const candidates = [rec.DP?.[0], rec.PDAT?.[0], rec.EDAT?.[0], rec.DA?.[0]].filter(Boolean) as string[];
  for (const c of candidates) {
    const m = /\b(19|20)\d{2}\b/.exec(c);
    if (m) return parseInt(m[0], 10);
  }
  return undefined;
}

function extractDoi(rec: RawRecord): string | undefined {
  const aids = rec.AID ?? [];
  for (const a of aids) {
    const m = /^(10\.\d{4,9}\/\S+?)\s*\[doi\]/i.exec(a.trim());
    if (m) return m[1];
  }
  const lid = rec.LID;
  if (lid) {
    for (const a of lid) {
      const m = /^(10\.\d{4,9}\/\S+?)\s*\[doi\]/i.exec(a.trim());
      if (m) return m[1];
    }
  }
  return undefined;
}

function parsePages(rec: RawRecord): string | undefined {
  const pg = pickFirst(rec, 'PG');
  if (!pg) return undefined;
  // MEDLINE often shortens trailing page (123-30); leave as-is — users usually expect it.
  return pg;
}

function parseRecord(rec: RawRecord, index: number): Ref | null {
  const title = pickFirst(rec, 'TI');
  const pmid = pickFirst(rec, 'PMID');
  if (!title && !pmid) return null;
  const authors = (rec.FAU ?? rec.AU ?? []).map(parseAuthor).filter((a) => a.family || a.literal || a.given);
  return {
    id: pmid ? `nbib-${pmid}` : `nbib-${index + 1}`,
    type: mapPublicationType(rec.PT ?? []),
    authors,
    title: title?.replace(/\.$/, ''),
    containerTitle: pickFirst(rec, 'JT') || pickFirst(rec, 'TA') || pickFirst(rec, 'BTI'),
    year: parseYear(rec),
    volume: pickFirst(rec, 'VI'),
    issue: pickFirst(rec, 'IP'),
    pages: parsePages(rec),
    doi: extractDoi(rec),
    pmid,
    abstract: pickFirst(rec, 'AB'),
    publisher: pickFirst(rec, 'PB'),
    raw: pickFirst(rec, 'SO'),
  };
}

export function parseNbib(text: string): Ref[] {
  const records = splitRecords(text);
  const out: Ref[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const ref = parseRecord(records[i], i);
    if (ref) out.push(ref);
  }
  return out;
}

/** True when the text looks like MEDLINE / NBIB. */
export function looksLikeNbib(text: string): boolean {
  const sample = text.slice(0, 1000);
  // PMID/TI/AU/JT/SO are near-universal MEDLINE tags.
  return /^PMID-\s/m.test(sample) || (/^TI\s*-\s/m.test(sample) && /^AU\s*-\s/m.test(sample));
}
