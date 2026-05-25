// Citation safety helpers for AI rewrites.
//
// Problem: TipTap citation nodes are stripped to "[N]" or "[1,2]" before being
// sent to the LLM. If the LLM drops/reorders/duplicates these tokens, atıflar
// kaybolur. Solution: replace each citation with an opaque sentinel BEFORE
// sending; verify post-hoc that all sentinels appear in the output; restore.
//
// Sentinels use a private-use-area char that's extremely unlikely to appear in
// generated text. Format: {n} — index into the citation list.

export type CitationPlaceholder = {
  index: number;
  original: string; // e.g. "[3]" or "[1,2,3]"
};

const OPEN = '';
const CLOSE = '';

export function encodeCitations(
  text: string,
  pattern: RegExp = /\[(\d+(?:[,\-–]\s*\d+)*)\]/g,
): { encoded: string; placeholders: CitationPlaceholder[] } {
  const placeholders: CitationPlaceholder[] = [];
  const encoded = text.replace(pattern, (match) => {
    const idx = placeholders.length;
    placeholders.push({ index: idx, original: match });
    return `${OPEN}${idx}${CLOSE}`;
  });
  return { encoded, placeholders };
}

export function decodeCitations(
  encoded: string,
  placeholders: CitationPlaceholder[],
): { decoded: string; missing: number[]; extras: number[] } {
  const seen = new Set<number>();
  const re = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');
  const decoded = encoded.replace(re, (_full, n) => {
    const idx = parseInt(n, 10);
    seen.add(idx);
    const p = placeholders[idx];
    return p ? p.original : '';
  });
  const missing: number[] = [];
  for (let i = 0; i < placeholders.length; i++) {
    if (!seen.has(i)) missing.push(i);
  }
  // Extras are sentinel indices > placeholders.length (LLM hallucinated)
  const extras: number[] = [];
  const checkRe = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = checkRe.exec(encoded))) {
    const idx = parseInt(m[1], 10);
    if (idx >= placeholders.length) extras.push(idx);
  }
  return { decoded, missing, extras };
}

// Build the LLM-facing instruction snippet describing citation tokens.
export function citationPreservationInstruction(count: number): string {
  if (count === 0) return '';
  return (
    `IMPORTANT: The text contains ${count} citation token(s) of the form ${OPEN}N${CLOSE} ` +
    'where N is a digit index. You MUST preserve every token EXACTLY as-is — do not ' +
    'remove, reorder, duplicate, translate, or modify them. Keep them in the same relative ' +
    'positions in the rewritten text. Do not invent new tokens.'
  );
}
