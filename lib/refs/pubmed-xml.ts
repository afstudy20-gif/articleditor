// PubMed/Entrez XML parser. Handles `<PubmedArticleSet>` containing
// `<PubmedArticle>` records (the format you get from efetch?db=pubmed&retmode=xml).

import { XMLParser } from 'fast-xml-parser';
import type { Author, Ref } from '@/store/types';

interface XmlAuthor {
  LastName?: string;
  ForeName?: string;
  Initials?: string;
  CollectiveName?: string;
}

interface XmlPubDate {
  Year?: string | number;
  MedlineDate?: string;
}

interface XmlJournal {
  Title?: string;
  ISOAbbreviation?: string;
  JournalIssue?: {
    Volume?: string;
    Issue?: string;
    PubDate?: XmlPubDate;
  };
}

interface XmlArticle {
  ArticleTitle?: string | { '#text'?: string };
  Abstract?: {
    AbstractText?: string | Array<string | { '#text'?: string; '@_Label'?: string }>;
  };
  AuthorList?: { Author?: XmlAuthor | XmlAuthor[] };
  Pagination?: { MedlinePgn?: string; StartPage?: string; EndPage?: string };
  Journal?: XmlJournal;
  ELocationID?: string | string[] | Array<{ '#text'?: string; '@_EIdType'?: string }>;
}

interface MedlineCitation {
  PMID?: string | { '#text'?: string };
  Article?: XmlArticle;
}

interface PubmedArticle {
  MedlineCitation?: MedlineCitation;
  PubmedData?: {
    ArticleIdList?: {
      ArticleId?: Array<{ '#text'?: string; '@_IdType'?: string }> | { '#text'?: string; '@_IdType'?: string };
    };
  };
}

function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' || typeof v === 'number') {
    const s = String(v).trim();
    return s.length > 0 ? s : undefined;
  }
  if (typeof v === 'object') {
    const t = (v as { '#text'?: unknown })['#text'];
    if (t !== undefined) return text(t);
  }
  return undefined;
}

function arr<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function joinAbstract(node: XmlArticle['Abstract']): string | undefined {
  const sections = arr(node?.AbstractText);
  if (sections.length === 0) return undefined;
  const parts = sections
    .map((s) => {
      if (typeof s === 'string') return s;
      const label = s['@_Label'];
      const body = s['#text'] ?? '';
      return label ? `${label}: ${body}` : body;
    })
    .filter(Boolean);
  const joined = parts.join('\n').trim();
  return joined.length > 0 ? joined : undefined;
}

function toAuthor(a: XmlAuthor): Author | null {
  if (a.CollectiveName) return { literal: a.CollectiveName };
  const family = a.LastName?.trim();
  const given = (a.ForeName ?? a.Initials)?.trim();
  if (!family && !given) return null;
  return { family, given };
}

function extractDoiAndPmid(rec: PubmedArticle): { doi?: string; pmid?: string } {
  const ids = arr(rec.PubmedData?.ArticleIdList?.ArticleId);
  let doi: string | undefined;
  let pmid: string | undefined;
  for (const id of ids) {
    const type = id['@_IdType'];
    const value = text(id['#text']);
    if (!value) continue;
    if (type === 'doi') doi = value;
    if (type === 'pubmed') pmid = value;
  }
  if (!pmid) pmid = text(rec.MedlineCitation?.PMID);
  if (!doi) {
    const elocRaw = rec.MedlineCitation?.Article?.ELocationID;
    const eloc: Array<string | { '#text'?: string; '@_EIdType'?: string }> =
      elocRaw === undefined ? [] : Array.isArray(elocRaw) ? elocRaw : [elocRaw];
    for (const e of eloc) {
      if (e && typeof e === 'object' && e['@_EIdType'] === 'doi') {
        const v = text(e['#text']);
        if (v) doi = v;
      }
    }
  }
  return { doi, pmid };
}

function recordToRef(rec: PubmedArticle, index: number): Ref | null {
  const article = rec.MedlineCitation?.Article;
  if (!article) return null;
  const title = text(article.ArticleTitle);
  const { doi, pmid } = extractDoiAndPmid(rec);
  if (!title && !pmid) return null;
  const issue = article.Journal?.JournalIssue;
  const date = issue?.PubDate;
  let year: number | undefined;
  if (date?.Year) year = parseInt(String(date.Year), 10);
  else if (date?.MedlineDate) {
    const m = /\b(19|20)\d{2}\b/.exec(String(date.MedlineDate));
    if (m) year = parseInt(m[0], 10);
  }
  const authors = arr(article.AuthorList?.Author).map(toAuthor).filter((a): a is Author => a !== null);
  return {
    id: pmid ? `pmxml-${pmid}` : `pmxml-${index + 1}`,
    type: 'journal-article',
    title: title?.replace(/\.$/, ''),
    authors,
    containerTitle: text(article.Journal?.Title) || text(article.Journal?.ISOAbbreviation),
    year,
    volume: issue?.Volume ? String(issue.Volume) : undefined,
    issue: issue?.Issue ? String(issue.Issue) : undefined,
    pages: article.Pagination?.MedlinePgn || undefined,
    doi,
    pmid,
    abstract: joinAbstract(article.Abstract),
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: false,
});

interface Root {
  PubmedArticleSet?: {
    PubmedArticle?: PubmedArticle | PubmedArticle[];
  };
  PubmedArticle?: PubmedArticle | PubmedArticle[];
}

export function parsePubmedXml(xml: string): Ref[] {
  let root: Root;
  try {
    root = parser.parse(xml) as Root;
  } catch {
    return [];
  }
  const records = arr(root.PubmedArticleSet?.PubmedArticle ?? root.PubmedArticle);
  const refs: Ref[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const ref = recordToRef(records[i], i);
    if (ref) refs.push(ref);
  }
  return refs;
}

export function looksLikePubmedXml(text: string): boolean {
  return /<PubmedArticleSet|<PubmedArticle\b/.test(text.slice(0, 1500));
}
