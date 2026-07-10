/**
 * Image → table extraction helpers (pure logic).
 *
 * Inspired by microsoft/markitdown, which turns an image into structured text
 * by prompting a multimodal LLM. Here the LLM is asked to transcribe the table
 * in the image EXACTLY as laid out and return a rectangular JSON grid, which we
 * then normalize into the app's ParsedTable shape for the existing table
 * insertion / styling pipeline.
 *
 * The network + provider call lives in the API route; everything here is pure
 * and unit-tested.
 */

import type { ParsedTable } from './parse-table';
import type { ImageTableResultT } from '@/lib/ai/schemas';

/** Accepted raster image MIME types (vision providers understand these). */
export const IMAGE_TABLE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type ImageTableMime = (typeof IMAGE_TABLE_MIME_TYPES)[number];

export type DecodedImage = {
  mimeType: ImageTableMime;
  base64: string;
  /** Original `data:...;base64,...` string (OpenAI transport wants this). */
  dataUrl: string;
  /** Decoded byte length, for size limits. */
  byteLength: number;
};

const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * Validate and decode a base64 image data URL. Returns null when the string is
 * not a base64 data URL of a supported image type. Never throws.
 */
export function parseImageDataUrl(input: string): DecodedImage | null {
  const match = DATA_URL_RE.exec(input.trim());
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!(IMAGE_TABLE_MIME_TYPES as readonly string[]).includes(mimeType)) return null;
  const base64 = match[2].replace(/\s+/g, '');
  if (base64.length === 0) return null;
  // 4 base64 chars ≈ 3 bytes; subtract padding.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - padding;
  return {
    mimeType: mimeType as ImageTableMime,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
    byteLength,
  };
}

/** LLM instruction: transcribe the table faithfully as a rectangular grid. */
export function buildImageTablePrompt(lang: 'tr' | 'en'): string {
  const noteLang = lang === 'tr' ? 'Turkish' : 'English';
  return [
    'You are a precise table transcription engine. The image contains ONE data table.',
    'Transcribe it EXACTLY as it appears — same rows, same columns, same order, same cell text.',
    'Rules:',
    '- Output a rectangular grid: every row must have the same number of columns.',
    '- For a cell that visually spans multiple columns, put its text in the first',
    '  column it covers and leave the remaining covered cells as empty strings "".',
    '- For a cell that spans multiple rows, repeat its text in each row it covers.',
    '- Preserve numbers, symbols, units, superscripts and footnote markers verbatim.',
    '- Do NOT add, remove, reorder, translate, summarize or "fix" any content.',
    '- "hasHeader" is true when the first row is a header row.',
    '- If a caption/title is visible above the table put it in "title";',
    `  put any footnote below the table in "footnote" (keep original language).`,
    `- Any explanation you owe the user must be omitted; return ONLY JSON.`,
    'JSON schema:',
    '{"title":"optional caption","footnote":"optional note","hasHeader":true,"rows":[["c1","c2"],["v1","v2"]]}',
    `(Titles/footnotes stay in their original language; do not translate to ${noteLang}.)`,
    'Return valid JSON only.',
  ].join('\n');
}

/**
 * Condensed, single-paragraph variant of {@link buildImageTablePrompt} for
 * local-CLI vision backends (see lib/ai/cli-vision.ts). The long, itemized
 * version above measurably degraded one CLI backend (zcode): its own
 * internal vision-tool call sometimes derailed into an unrelated sub-task
 * with the full instruction set, but stayed on-task with this shorter form.
 * Kept functionally equivalent (same JSON schema, same fidelity rules) —
 * just fewer words for a CLI's own tool-call layer to lose track of.
 */
export function buildCliImageTablePrompt(lang: 'tr' | 'en'): string {
  const noteLang = lang === 'tr' ? 'Turkish' : 'English';
  return (
    'Transcribe the table in this image EXACTLY as a rectangular JSON grid — same rows, ' +
    'columns, order and cell text, no translating, summarizing, or inventing content. ' +
    'A cell spanning multiple columns: put its text in the first column it covers, leave ' +
    'the rest as "". A cell spanning multiple rows: repeat its text in each row. ' +
    `JSON schema: {"title":"optional caption","footnote":"optional note","hasHeader":true,` +
    `"rows":[["c1","c2"],["v1","v2"]]} (title/footnote stay in their original language, do ` +
    `not translate to ${noteLang}). Return ONLY that JSON, nothing else.`
  );
}

/**
 * Normalize a raw LLM result into a ParsedTable: drop fully-empty trailing
 * rows/cols and pad ragged rows so the grid is rectangular. Returns null when
 * there is no usable content.
 */
export function imageResultToParsedTable(result: ImageTableResultT): ParsedTable | null {
  const rows = result.rows
    .map((row) => row.map((cell) => (typeof cell === 'string' ? cell : String(cell ?? '')).trim()));

  // Drop trailing all-empty rows.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  if (rows.length === 0) return null;

  // Pad to the widest row so every row has equal length.
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0) return null;
  const padded = rows.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  });

  // Drop trailing all-empty columns.
  let cols = width;
  while (cols > 1 && padded.every((row) => row[cols - 1] === '')) {
    padded.forEach((row) => row.pop());
    cols -= 1;
  }

  const hasContent = padded.some((row) => row.some((c) => c !== ''));
  if (!hasContent) return null;

  return {
    rows: padded,
    hasHeader: result.hasHeader,
    format: 'html',
    title: result.title?.trim() || undefined,
    footnote: result.footnote?.trim() || undefined,
  };
}
