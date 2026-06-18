export type Chunk = {
  text: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
};

type ChunkOptions = {
  tokens?: number;
  overlap?: number;
};

const DEFAULT_TOKENS = 500;
const DEFAULT_OVERLAP = 50;
const TOKEN_MULTIPLIER = 1.3;
const WORD_PATTERN = /\S+/g;
const BOUNDARY_PATTERN = /[.!?]\s+|\n\n/g;

export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  if (text.length === 0) {
    return [{ text: '', charStart: 0, charEnd: 0, tokenCount: 0 }];
  }

  const targetTokens = normalizePositiveInteger(opts.tokens, DEFAULT_TOKENS);
  const overlapTokens = Math.min(
    normalizeNonNegativeInteger(opts.overlap, DEFAULT_OVERLAP),
    Math.max(0, targetTokens - 1),
  );
  const words = collectWords(text);
  const totalTokens = estimateTokenCount(words.length);

  if (words.length === 0 || totalTokens <= targetTokens) {
    return [makeChunk(text, 0, text.length)];
  }

  const targetWords = Math.max(1, Math.floor(targetTokens / TOKEN_MULTIPLIER));
  const overlapWords = Math.min(
    Math.floor(overlapTokens / TOKEN_MULTIPLIER),
    Math.max(0, targetWords - 1),
  );
  const chunks: Chunk[] = [];
  let startWordIndex = 0;

  while (startWordIndex < words.length) {
    const rawEndWordIndex = Math.min(words.length, startWordIndex + targetWords);
    const rawStart = words[startWordIndex]?.start ?? 0;
    const rawEnd = words[rawEndWordIndex - 1]?.end ?? text.length;
    const preferredEnd = chooseBoundaryEnd(text, rawStart, rawEnd, targetTokens);
    const endWordIndex = wordIndexAfterChar(words, preferredEnd, rawEndWordIndex);
    const chunkEnd = words[endWordIndex - 1]?.end ?? preferredEnd;

    chunks.push(makeChunk(text, rawStart, chunkEnd));

    if (endWordIndex >= words.length) {
      break;
    }

    const nextStartWordIndex = Math.max(
      startWordIndex + 1,
      endWordIndex - overlapWords,
    );

    if (nextStartWordIndex <= startWordIndex) {
      startWordIndex = rawEndWordIndex;
    } else {
      startWordIndex = nextStartWordIndex;
    }
  }

  return chunks;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}

function collectWords(text: string): Array<{ start: number; end: number }> {
  return Array.from(text.matchAll(WORD_PATTERN), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function estimateTokenCount(wordCount: number): number {
  return Math.ceil(wordCount * TOKEN_MULTIPLIER);
}

function makeChunk(text: string, charStart: number, charEnd: number): Chunk {
  const chunkTextValue = text.slice(charStart, charEnd);

  return {
    text: chunkTextValue,
    charStart,
    charEnd,
    tokenCount: estimateTokenCount(countWords(chunkTextValue)),
  };
}

function countWords(text: string): number {
  return Array.from(text.matchAll(WORD_PATTERN)).length;
}

function chooseBoundaryEnd(
  text: string,
  rawStart: number,
  rawEnd: number,
  targetTokens: number,
): number {
  const maxLookaroundChars = Math.max(80, Math.floor(targetTokens * 1.5));
  const minEnd = Math.max(rawStart + 1, rawEnd - maxLookaroundChars);
  const maxEnd = Math.min(text.length, rawEnd + maxLookaroundChars);
  let bestEnd = rawEnd;
  let bestDistance = Number.POSITIVE_INFINITY;

  BOUNDARY_PATTERN.lastIndex = rawStart;
  let match = BOUNDARY_PATTERN.exec(text);

  while (match !== null) {
    const boundaryEnd = match.index + match[0].length;
    if (boundaryEnd > maxEnd) {
      break;
    }

    if (boundaryEnd >= minEnd) {
      const distance = Math.abs(boundaryEnd - rawEnd);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnd = boundaryEnd;
      }
    }

    match = BOUNDARY_PATTERN.exec(text);
  }

  return bestEnd;
}

function wordIndexAfterChar(
  words: Array<{ start: number; end: number }>,
  charEnd: number,
  fallback: number,
): number {
  for (let index = 0; index < words.length; index += 1) {
    if ((words[index]?.end ?? 0) > charEnd) {
      return Math.max(1, index);
    }
  }

  return fallback;
}
