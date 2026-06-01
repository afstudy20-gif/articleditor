// Shared shape for writing statistics. Implementation in writing-stats.ts.

export interface WritingStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  headings: number;
  citations: number;
  /** Distinct reference ids cited at least once. */
  uniqueCitations: number;
  /** Citations per 1000 words (rounded to 1 decimal). */
  citationDensity: number;
  /** Estimated reading time in minutes (>= 1 when any words). */
  readingTimeMin: number;
}
