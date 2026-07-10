/**
 * Best-effort bibliographic metadata extraction from full-article plain
 * text (as produced by lib/pdf/pdf-to-markdown.ts). Ports the heuristics
 * from the sibling `paper` project's reference checker
 * (backend/services/reference_checker.py: `_guess_article_title`,
 * `_extract_first_author`, `_extract_year`, `_extract_doi`, `_extract_pmid`,
 * `_extract_article_abstract`) — same regex strategy, same field set.
 *
 * These operate on the raw text of an ENTIRE article (title page, abstract,
 * body), not on a single citation-style reference string — that's a
 * different job already covered by lib/refs/parse-biblio.ts.
 */

import type { Author, Ref } from '@/store/types';
import { newId } from '@/lib/id';

/** Best-effort article title from the first page of text. */
export function guessArticleTitle(text: string): string {
  if (!text) return '';
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 80)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const low = line.toLowerCase();
    if (low === 'abstract' || low === 'introduction' || low === 'keywords') break;
    if (['doi:', 'copyright', 'published by', 'creative commons', 'journal homepage'].some((x) => low.includes(x))) {
      continue;
    }
    if (line.length >= 20 && line.length <= 220 && line.split(/\s+/).length >= 4) {
      lines.push(line);
    }
  }
  if (lines.length === 0) return '';
  return lines.slice(0, 12).reduce((longest, l) => (l.length > longest.length ? l : longest)).replace(/\.$/, '');
}

/**
 * First author surname/initials from the start of an article's text.
 * Handles non-ASCII surnames (Turkish, Slavic, accented Latin).
 */
export function extractFirstAuthor(text: string): string {
  const trimmed = text.trimStart();
  // \p{L} (Unicode letter) rather than \W-based classes — plain \w/\W are
  // ASCII-only even under the `u` flag, which truncated names like "Uzunoğlu".
  const m = trimmed.match(/^([\p{Lu}]\p{L}+(?:\s+[\p{Lu}]{1,3}\.?)?)/u);
  return m ? m[1] : trimmed.slice(0, 30);
}

/** Publication year: first plausible 4-digit year (1900–2099) in the text. */
export function extractYear(text: string): number | undefined {
  const m = text.match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

/** DOI from free text, tolerant of a leading "doi:" label or doi.org URL. */
export function extractDoi(text: string): string | undefined {
  const m = text.match(/(?:doi[:\s]*|https?:\/\/doi\.org\/)?(10\.\d{4,}\/[^\s,;]+)/i);
  return m ? m[1].replace(/[.,;)\]]+$/, '') : undefined;
}

/**
 * PubMed ID from free text: a "PMID: 12345678" label, or a pubmed.ncbi URL
 * (full `pubmed.ncbi.nlm.nih.gov/12345678` or short `pubmed/12345678`).
 */
export function extractPmid(text: string): string | undefined {
  const m = text.match(/(?:PMID[:\s]*|pubmed(?:\.ncbi\.nlm\.nih\.gov)?\/)(\d{6,10})/i);
  return m ? m[1] : undefined;
}

const ABSTRACT_STOP =
  '(?=\\n\\s*(?:#{1,6}\\s*)?(?:keywords?|key\\s+words?|introduction|1\\.?\\s+introduction|abbreviations?|article\\s+information|references)\\b)';

/** Abstract section, when the article text has one clearly labeled. */
export function extractArticleAbstract(text: string): string {
  if (!text) return '';
  const source = text.replace(/\r/g, '\n');
  const label = '(?:abstract|a\\s*b\\s*s\\s*t\\s*r\\s*a\\s*c\\s*t|summary)';
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?${label}\\s*[:.\\-]?\\s*\\n+([\\s\\S]*?)${ABSTRACT_STOP}`, 'i'),
    new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?${label}\\s*[:.\\-]?\\s+([\\s\\S]{100,3500})`, 'i'),
    new RegExp(`\\b${label}\\b\\s*[:.\\-]?\\s+([\\s\\S]{100,3500})`, 'i'),
  ];
  for (const pattern of patterns) {
    const m = source.match(pattern);
    if (!m) continue;
    let abstract = m[1].replace(/\s+/g, ' ').trim().replace(/^[\s:.\-]+|[\s:.\-]+$/g, '');
    abstract = abstract
      .split(/\b(?:keywords?|key words?|introduction|1\.?\s+introduction|abbreviations?|article information|references)\b/i)[0]
      .trim()
      .replace(/[\s:.\-]+$/g, '');
    if (abstract.length >= 80) return abstract.slice(0, 3000);
  }
  return '';
}

export type ArticleFileRefInput = {
  filename: string;
  text: string;
};

/**
 * Builds a Ref from an article's extracted full text. Mirrors paper's
 * `_reference_from_article_file`: title/authors/year/DOI/PMID/abstract from
 * regex heuristics, journal left blank (the source text rarely states it
 * unambiguously) — callers typically run this through lib/lookup/enrich.ts
 * afterward when a DOI was found, to fill in the rest.
 */
export function refFromArticleText({ filename, text }: ArticleFileRefInput): Ref {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const title = guessArticleTitle(text) || filename.replace(/\.[^.]+$/, '');
  const doi = extractDoi(cleaned);
  const pmid = extractPmid(cleaned);
  const year = extractYear(cleaned);
  const abstract = extractArticleAbstract(text) || undefined;
  const firstAuthor = cleaned ? extractFirstAuthor(cleaned) : '';
  const authors: Author[] = firstAuthor ? [{ literal: firstAuthor }] : [];

  return {
    id: newId('ref'),
    type: 'journal-article',
    authors,
    title,
    year,
    doi,
    pmid,
    abstract,
    raw: title,
    source: 'pdf_folder',
  };
}
