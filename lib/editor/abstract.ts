import type { ImportParagraph } from './import-rich';

const ABSTRACT_INLINE_RE = /^(abstract|summary|öz|özet)\s*[:：]\s*(.+)$/i;
const ABSTRACT_HEADING_RE = /^(abstract|summary|öz|özet)\s*[:：]?\s*$/i;
const KEYWORD_LABEL = String.raw`(?:key\s*words?|keywords?|anahtar\s+(?:kelimeler|sözcükler))`;
const KEYWORD_INLINE_RE = new RegExp(`^${KEYWORD_LABEL}\\b\\s*(?:[:：\\-–—]\\s*|\\s+)(.+)$`, 'i');
const KEYWORD_HEADING_RE = new RegExp(`^${KEYWORD_LABEL}\\b\\s*[:：]?\\s*$`, 'i');
const SECTION_HEADING_RE =
  /^(introduction|background|methods?|materials?(?:\s+and\s+methods)?|patients?(?:\s+and\s+methods)?|results?|findings?|discussion|conclusions?|limitations?|references?|bibliography|keywords?|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|ethics|giri[şs]|arka\s+plan|y[öo]ntem(?:ler)?|materyal|hastalar|bulgular|tart[ıi][şs]ma|sonu[çc](?:lar)?|k[ıi]s[ıi]tl[ıi]l[ıi]klar|kaynak(?:lar|ça|ca)?|anahtar\s+kelimeler|te[şs]ekkür|finansman|[çc][ıi]kar\s+[çc]at[ıi][şs]mas[ıi]|etik)\b/i;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitAbstractFromParagraphs(
  paragraphs: ImportParagraph[],
): { bodyParagraphs: ImportParagraph[]; abstractText: string } {
  const { bodyParagraphs, abstractText } = splitAbstractMetadataFromParagraphs(paragraphs);
  return { bodyParagraphs, abstractText };
}

export function splitAbstractMetadataFromParagraphs(
  paragraphs: ImportParagraph[],
): { bodyParagraphs: ImportParagraph[]; abstractText: string; keywords: string[] } {
  const start = paragraphs.findIndex((paragraph) => isAbstractStart(paragraph));
  if (start < 0) {
    const keywordOnly = splitKeywordsFromParagraphs(paragraphs);
    return { bodyParagraphs: keywordOnly.bodyParagraphs, abstractText: '', keywords: keywordOnly.keywords };
  }

  const abstractParts: string[] = [];
  const first = paragraphs[start];
  const inline = first.text.trim().match(ABSTRACT_INLINE_RE);
  if (inline?.[2]) abstractParts.push(inline[2].trim());

  let end = start + 1;
  for (; end < paragraphs.length; end += 1) {
    const paragraph = paragraphs[end];
    if (isAbstractBoundary(paragraph, abstractParts.length > 0)) break;
    const text = paragraph.text.trim();
    if (text) abstractParts.push(text);
  }

  return {
    ...splitKeywordsFromParagraphs([
      ...paragraphs.slice(0, start),
      ...paragraphs.slice(end),
    ]),
    abstractText: abstractParts.join('\n\n').trim(),
  };
}

function splitKeywordsFromParagraphs(
  paragraphs: ImportParagraph[],
): { bodyParagraphs: ImportParagraph[]; keywords: string[] } {
  const index = paragraphs.findIndex((paragraph) => isKeywordStart(paragraph));
  if (index < 0) return { bodyParagraphs: paragraphs, keywords: [] };

  const first = paragraphs[index].text.trim();
  const inline = first.match(KEYWORD_INLINE_RE);
  const parts: string[] = [];
  if (inline?.[1]) parts.push(inline[1]);

  let end = index + 1;
  for (; end < paragraphs.length; end += 1) {
    const paragraph = paragraphs[end];
    if (isKeywordBoundary(paragraph, parts.length > 0)) break;
    const text = paragraph.text.trim();
    if (text) parts.push(text);
  }

  return {
    bodyParagraphs: [
      ...paragraphs.slice(0, index),
      ...paragraphs.slice(end),
    ],
    keywords: parseKeywords(parts.join('; ')),
  };
}

function isAbstractStart(paragraph: ImportParagraph): boolean {
  const text = paragraph.text.trim();
  return ABSTRACT_HEADING_RE.test(text) || ABSTRACT_INLINE_RE.test(text);
}

function isAbstractBoundary(paragraph: ImportParagraph, hasAbstractText: boolean): boolean {
  if (paragraph.table) return true;
  const text = paragraph.text.trim();
  if (!text) return false;
  const style = paragraph.style?.toLowerCase() ?? '';
  const styledHeading = style.includes('heading') || style === 'title' || style === 'subtitle';
  if (styledHeading && hasAbstractText) return true;
  return hasAbstractText && SECTION_HEADING_RE.test(text);
}

function isKeywordStart(paragraph: ImportParagraph): boolean {
  const text = paragraph.text.trim();
  return KEYWORD_HEADING_RE.test(text) || KEYWORD_INLINE_RE.test(text);
}

function isKeywordBoundary(paragraph: ImportParagraph, hasKeywordText: boolean): boolean {
  if (paragraph.table) return true;
  const text = paragraph.text.trim();
  if (!text) return false;
  const style = paragraph.style?.toLowerCase() ?? '';
  const styledHeading = style.includes('heading') || style === 'title' || style === 'subtitle';
  return (styledHeading && hasKeywordText) || (hasKeywordText && SECTION_HEADING_RE.test(text));
}

function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  text
    .split(/[;,|•·]\s*|\n+/)
    .map((part) => part.trim().replace(/[.:]+$/g, ''))
    .filter(Boolean)
    .forEach((keyword) => {
      const key = keyword.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(keyword);
    });
  return out;
}
