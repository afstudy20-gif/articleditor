import { XMLParser } from 'fast-xml-parser';
import type { Author, Ref, RefType } from '@/store/types';

// EndNote XML export structure parser.
// Handles <records>/<record> with EndNote field naming.

const TYPE_MAP: Record<string, RefType> = {
  'Journal Article': 'journal-article',
  Book: 'book',
  'Book Section': 'book-chapter',
  'Conference Proceedings': 'conference-paper',
  'Conference Paper': 'conference-paper',
  Thesis: 'thesis',
  'Web Page': 'webpage',
  Report: 'report',
};

export function parseEndnoteXml(xml: string): Ref[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
  });
  const data = parser.parse(xml) as any;
  // Possible roots: <xml><records><record>... or <records><record>...
  const records = findRecords(data);
  return records.map((rec, i) => recordToRef(rec, `enxml-${i}`));
}

function findRecords(data: any): any[] {
  if (!data) return [];
  // Direct
  if (data.records) {
    const rs = arrayify(data.records.record);
    return rs;
  }
  if (data.xml?.records) {
    return arrayify(data.xml.records.record);
  }
  // Search shallowly
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v && typeof v === 'object' && 'records' in v) {
      return arrayify(v.records.record);
    }
  }
  return [];
}

function arrayify<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function textOf(node: any): string | undefined {
  if (node == null) return undefined;
  if (typeof node === 'string') return node.trim() || undefined;
  if (typeof node === 'number') return String(node);
  // EndNote sometimes wraps: { style: { '#text': '...' } } or '#text' directly
  if (typeof node === 'object') {
    if ('#text' in node) return textOf(node['#text']);
    if (node.style != null) return textOf(node.style);
    // Try first value
    for (const k of Object.keys(node)) {
      if (k.startsWith('@_')) continue;
      const v = textOf(node[k]);
      if (v) return v;
    }
  }
  return undefined;
}

function recordToRef(rec: any, id: string): Ref {
  const refTypeNode = rec['ref-type'];
  const refTypeName =
    refTypeNode && typeof refTypeNode === 'object' && refTypeNode['@_name']
      ? String(refTypeNode['@_name'])
      : undefined;
  const type: RefType = (refTypeName && TYPE_MAP[refTypeName]) || 'journal-article';

  const authorNodes = arrayify(rec.contributors?.authors?.author);
  const authors: Author[] = authorNodes
    .map((a) => parseAuthor(textOf(a) ?? ''))
    .filter((a) => a.family || a.given || a.literal);

  const title = textOf(rec.titles?.title);
  const containerTitle =
    textOf(rec['periodical']?.['full-title']) || textOf(rec.titles?.['secondary-title']);
  const year = textOf(rec.dates?.year);
  const yearNum = year ? parseInt(year, 10) : undefined;

  const volume = textOf(rec.volume);
  const issue = textOf(rec.number) || textOf(rec.issue);
  const pages = textOf(rec.pages);
  const doi = textOf(rec['electronic-resource-num']) || textOf(rec.doi);
  const pmid = textOf(rec['accession-num']);
  const url = textOf(rec.urls?.['related-urls']?.url) || textOf(rec.url);
  const abstract = textOf(rec.abstract);
  const publisher = textOf(rec.publisher);

  return {
    id,
    type,
    authors,
    title,
    containerTitle,
    year: Number.isFinite(yearNum) ? yearNum : undefined,
    volume,
    issue,
    pages,
    publisher,
    doi: doi ? cleanDoi(doi) : undefined,
    pmid: pmid && /^\d{4,9}$/.test(pmid) ? pmid : undefined,
    url,
    abstract,
  };
}

function parseAuthor(raw: string): Author {
  const t = raw.trim();
  if (!t) return {};
  const comma = t.match(/^([^,]+),\s*(.+)$/);
  if (comma) return { family: comma[1].trim(), given: comma[2].trim() };
  return { literal: t };
}

function cleanDoi(s: string): string {
  return s
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '');
}
