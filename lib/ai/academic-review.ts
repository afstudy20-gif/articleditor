export const ACADEMIC_REVIEW_CATEGORIES = [
  'mechanics',
  'grammar',
  'academic-tone',
  'word-choice',
  'readability',
  'phrasing',
  'structure',
  'evidence',
  'statistics',
  'consistency',
] as const;

export type AcademicReviewCategory = (typeof ACADEMIC_REVIEW_CATEGORIES)[number];
export type AcademicReviewSeverity = 'low' | 'med' | 'high';
export type AcademicReviewStatus = 'open' | 'accepted' | 'dismissed' | 'stale';

export interface ReviewBlock {
  id: string;
  text: string;
  section?: string;
  from?: number;
  to?: number;
  sourceId?: string;
  textOffset?: number;
}

export interface ReviewChunk {
  blocks: ReviewBlock[];
  characterCount: number;
}

export interface AcademicReviewIssue {
  id: string;
  category: AcademicReviewCategory;
  severity: AcademicReviewSeverity;
  blockId: string;
  quote: string;
  occurrence?: number;
  explanation: string;
  replacement?: string;
  confidence?: number;
  status: AcademicReviewStatus;
  from?: number;
  to?: number;
}

export interface AcademicReviewGroup {
  category: AcademicReviewCategory;
  issues: AcademicReviewIssue[];
  passed: boolean;
}

export interface TextSegment {
  text: string;
  from: number;
}

export function chunkReviewBlocks(
  blocks: ReadonlyArray<ReviewBlock>,
  maxCharacters = 8_000,
): ReviewChunk[] {
  if (!Number.isFinite(maxCharacters) || maxCharacters < 1) {
    throw new Error('maxCharacters must be a positive number');
  }

  const expanded = blocks.flatMap((block) => splitOversizedBlock(block, maxCharacters));
  const chunks: ReviewChunk[] = [];
  let current: ReviewBlock[] = [];
  let characterCount = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    chunks.push({ blocks: current, characterCount });
    current = [];
    characterCount = 0;
  };

  for (const block of expanded) {
    const separator = current.length > 0 ? 2 : 0;
    const nextCount = characterCount + separator + block.text.length;
    if (current.length > 0 && nextCount > maxCharacters) flush();
    const actualSeparator = current.length > 0 ? 2 : 0;
    current = [...current, block];
    characterCount += actualSeparator + block.text.length;
  }
  flush();
  return chunks;
}

function splitOversizedBlock(block: ReviewBlock, maxCharacters: number): ReviewBlock[] {
  if (block.text.length <= maxCharacters) return [{ ...block }];
  const parts: ReviewBlock[] = [];
  for (let start = 0, index = 1; start < block.text.length; start += maxCharacters, index += 1) {
    const text = block.text.slice(start, start + maxCharacters);
    parts.push({
      ...block,
      id: `${block.id}:part-${index}`,
      sourceId: block.sourceId ?? block.id,
      textOffset: start,
      text,
    });
  }
  return parts;
}

export function locateQuoteInSegments(
  segments: ReadonlyArray<TextSegment>,
  quote: string,
  occurrence = 0,
): { from: number; to: number } | null {
  if (!quote || occurrence < 0) return null;
  const characters: Array<{ value: string; position: number }> = [];
  for (const segment of segments) {
    for (let index = 0; index < segment.text.length; index += 1) {
      characters.push({ value: segment.text[index], position: segment.from + index });
    }
  }

  const haystack = characters.map((character) => character.value).join('');
  let foundAt = -1;
  let searchFrom = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    foundAt = haystack.indexOf(quote, searchFrom);
    if (foundAt < 0) return null;
    searchFrom = foundAt + Math.max(1, quote.length);
  }

  const first = characters[foundAt];
  const last = characters[foundAt + quote.length - 1];
  if (!first || !last) return null;
  return { from: first.position, to: last.position + 1 };
}

export function groupAcademicIssues(
  issues: ReadonlyArray<AcademicReviewIssue>,
): AcademicReviewGroup[] {
  return ACADEMIC_REVIEW_CATEGORIES.map((category) => {
    const categoryIssues = issues.filter(
      (issue) => issue.category === category && issue.status === 'open',
    );
    return {
      category,
      issues: categoryIssues,
      passed: categoryIssues.length === 0,
    };
  });
}
