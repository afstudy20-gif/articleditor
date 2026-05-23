import type { Ref, RefType } from '@/store/types';
import { normalizeWhitespace, parseAuthors } from './normalize';

const BIBLIO_HEADINGS = [
  'kaynaklar',
  'kaynakça',
  'kaynakca',
  'referanslar',
  'references',
  'bibliography',
  'literature cited',
  'works cited',
];

export type BibSplit = {
  bodyText: string;
  refLines: string[];
  headingFound?: string;
};

export function splitBodyAndBiblio(fullText: string): BibSplit {
  const lines = fullText.split(/\r?\n/);
  let headingIdx = -1;
  let headingText = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim().toLowerCase();
    if (t.length === 0 || t.length > 60) continue;
    const stripped = t.replace(/[:.\s]+$/, '');
    if (BIBLIO_HEADINGS.includes(stripped)) {
      headingIdx = i;
      headingText = lines[i].trim();
      break;
    }
  }
  if (headingIdx === -1) {
    const fallback = detectTrailingNumberedList(lines);
    if (fallback >= 0) {
      headingIdx = fallback - 1;
      headingText = '';
    }
  }
  if (headingIdx < 0) {
    return { bodyText: fullText, refLines: [] };
  }
  const body = lines.slice(0, headingIdx).join('\n').trimEnd();
  const refsRaw = lines
    .slice(headingIdx + 1)
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => l.trim().length > 0);
  const refLines = groupRefLines(refsRaw);
  return { bodyText: body, refLines, headingFound: headingText };
}

function detectTrailingNumberedList(lines: string[]): number {
  let firstNumberedIdx = -1;
  let consec = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l) continue;
    if (/^\d{1,3}[\.\)]\s+/.test(l)) {
      firstNumberedIdx = i;
      consec++;
    } else {
      if (consec >= 3) return firstNumberedIdx;
      consec = 0;
      firstNumberedIdx = -1;
    }
  }
  if (consec >= 3) return firstNumberedIdx;
  return -1;
}

const REF_START_RE = /^(?:\d{1,4}[\.\)]|\[\d{1,4}\])\s+/;

function groupRefLines(lines: string[]): string[] {
  const trimmed = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const startCount = trimmed.filter((l) => REF_START_RE.test(l)).length;

  // If most lines start with a numeric prefix, use prefix-aware grouping.
  if (startCount >= 3 && startCount >= trimmed.length * 0.6) {
    const out: string[] = [];
    let current = '';
    for (const l of trimmed) {
      if (REF_START_RE.test(l)) {
        if (current) out.push(current.trim());
        current = l;
      } else {
        current = current ? `${current} ${l}` : l;
      }
    }
    if (current) out.push(current.trim());
    return out;
  }

  // Fallback: no numeric prefixes (Word auto-numbered list exported as plain text).
  // Each non-empty line is its own reference, but try to merge wrapped lines:
  // a wrapped continuation line typically starts lowercase or with a digit/symbol.
  const out: string[] = [];
  let current = '';
  for (const l of trimmed) {
    if (!current) {
      current = l;
      continue;
    }
    if (looksLikeRefStart(l, current)) {
      out.push(current.trim());
      current = l;
    } else {
      current = `${current} ${l}`;
    }
  }
  if (current) out.push(current.trim());
  return out;
}

// Heuristic: a new reference line usually starts with a capital letter and the
// previous line ended with punctuation typical of a citation end (period, year, page range).
function looksLikeRefStart(line: string, prev: string): boolean {
  const startsCapital = /^[A-ZÇĞİÖŞÜ]/.test(line);
  if (!startsCapital) return false;
  const prevEnd = prev.replace(/\s+$/, '').slice(-40);
  const closedWithYear = /(?:19|20)\d{2}(?:[a-z])?\.?\s*$/.test(prevEnd);
  const closedWithPages = /\b\d{1,5}\s*[-–]\s*\d{1,5}\.?\s*$/.test(prevEnd);
  const closedWithDoi = /(?:doi[:\s]\S+|10\.\d{4,9}\/\S+)\.?\s*$/i.test(prevEnd);
  const closedWithPmid = /\bpmid[:\s]*\d+\.?\s*$/i.test(prevEnd);
  const closedWithPeriod = /[.)]\s*$/.test(prevEnd);
  return closedWithYear || closedWithPages || closedWithDoi || closedWithPmid || closedWithPeriod;
}

export type ParsedRef = {
  ref: Ref;
  confidence: number;
};

export function parseRefLine(raw: string, id: string): ParsedRef {
  const original = normalizeWhitespace(raw);
  const numMatch = original.match(/^(?:\[(\d+)\]|(\d+)[\.\)])\s+/);
  const remainder = numMatch ? original.slice(numMatch[0].length) : original;

  let confidence = 0;
  const ref: Ref = {
    id,
    type: 'journal-article',
    authors: [],
    raw: original,
  };

  const doi = extractDoi(remainder);
  if (doi) {
    ref.doi = doi;
    confidence += 0.25;
  }
  const pmid = extractPmid(remainder);
  if (pmid) {
    ref.pmid = pmid;
    confidence += 0.15;
  }
  const url = extractUrl(remainder);
  if (url && !ref.doi) ref.url = url;

  const yearMatch = remainder.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    ref.year = parseInt(yearMatch[0], 10);
    confidence += 0.2;
  }

  // Authors usually at start, ending with a period before year or before title.
  const authorBlock = extractAuthorBlock(remainder);
  if (authorBlock.text) {
    ref.authors = parseAuthors(authorBlock.text);
    if (ref.authors.length > 0) confidence += 0.2;
  }

  // Title heuristic: text after authors, before journal/year. Ends with period.
  const rest = remainder.slice(authorBlock.endIndex);
  const titleMatch = rest.match(/^\.?\s*(.+?[?.!])\s+/);
  let afterTitle = rest;
  if (titleMatch) {
    ref.title = stripTrailingPunct(titleMatch[1]);
    afterTitle = rest.slice(titleMatch[0].length);
    confidence += 0.15;
  }

  const journal = extractJournalLikely(afterTitle);
  if (journal) {
    ref.containerTitle = journal.name;
    if (journal.volume) ref.volume = journal.volume;
    if (journal.issue) ref.issue = journal.issue;
    if (journal.pages) ref.pages = journal.pages;
    confidence += 0.1;
  }

  ref.type = detectType(remainder);
  ref.confidence = +confidence.toFixed(2);
  return { ref, confidence };
}

function extractDoi(s: string): string | undefined {
  const m =
    s.match(/\b(10\.\d{4,9}\/[^\s"'<>,;]+)/i) ||
    s.match(/doi[:\s]+([^\s"'<>,;]+)/i);
  if (!m) return undefined;
  return m[1].replace(/[.,;)]+$/, '');
}

function extractPmid(s: string): string | undefined {
  const m = s.match(/\bPMID[:\s]+(\d{4,9})\b/i);
  return m ? m[1] : undefined;
}

function extractUrl(s: string): string | undefined {
  const m = s.match(/https?:\/\/[^\s)<>,;"']+/);
  return m ? m[0] : undefined;
}

function extractAuthorBlock(s: string): { text: string; endIndex: number } {
  // Find first ". X" where X starts the title. Authors typically end with a single
  // capital initial (J., AB.) or a family name; the next sentence starts with a
  // capital letter or digit. Use a non-greedy scan.
  const re = /\.\s+(?=[A-ZÇĞİÖŞÜ\(\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const prefix = s.slice(0, m.index);
    if (looksLikeAuthorList(prefix)) {
      return { text: prefix, endIndex: m.index + 1 };
    }
  }
  return { text: '', endIndex: 0 };
}

function looksLikeAuthorList(s: string): boolean {
  if (!s) return false;
  // Heuristics: short, contains commas or "et al", and ends with initials or family name.
  if (s.length > 500) return false;
  const endingInitials = /[A-ZÇĞİÖŞÜ]{1,4}\s*$/.test(s);
  const hasComma = /,/.test(s);
  const hasEtAl = /\bet\s+al/i.test(s);
  const singleAuthorWithInitial = /^[A-ZÇĞİÖŞÜ][\w'\-]+\s+[A-ZÇĞİÖŞÜ]{1,4}\s*$/.test(s.trim());
  return endingInitials || singleAuthorWithInitial || (hasComma && hasEtAl) || (hasComma && s.length < 250);
}

function extractJournalLikely(s: string): { name?: string; volume?: string; issue?: string; pages?: string } | undefined {
  // Pattern: "JournalName. 2020;15(3):123-130" or "JournalName 2020; 15: 123-130"
  const m = s.match(
    /([A-Z][\w &.\-:'/]{1,80}?)\.?\s+(?:19|20)?\d{2}\s*[;,]?\s*(\d+)?(?:\s*\((\d+)\))?\s*[:\-]?\s*([\dA-Za-z\-–]+)?/,
  );
  if (!m) return undefined;
  return {
    name: m[1] ? stripTrailingPunct(m[1].trim()) : undefined,
    volume: m[2],
    issue: m[3],
    pages: m[4],
  };
}

function detectType(s: string): RefType {
  if (/\bThesis|Tez\b/i.test(s)) return 'thesis';
  if (/\bIn:\s+/.test(s)) return 'book-chapter';
  if (/Conference|Proceedings/i.test(s)) return 'conference-paper';
  if (/https?:\/\//.test(s) && !/\bdoi\b/i.test(s) && !/\bvol|vol\.|issue\b/i.test(s)) return 'webpage';
  return 'journal-article';
}

function stripTrailingPunct(s: string): string {
  return s.replace(/[\s.,;:]+$/, '').trim();
}

export function parseBiblioLines(refLines: string[]): { refs: Ref[]; lowConfidence: number[] } {
  const refs: Ref[] = [];
  const lowConfidence: number[] = [];
  refLines.forEach((line, i) => {
    const { ref, confidence } = parseRefLine(line, `r${i + 1}`);
    refs.push(ref);
    if (confidence < 0.4) lowConfidence.push(i);
  });
  return { refs, lowConfidence };
}
