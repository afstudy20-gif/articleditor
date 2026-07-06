import type { MarkerOccurrence } from '@/store/types';

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

export function normalizeSuperscripts(s: string): string {
  return normalizeSuperscriptsWithMap(s).text;
}

type IndexMapEntry = { start: number; end: number };

function normalizeSuperscriptsWithMap(s: string): { text: string; map: IndexMapEntry[] } {
  let text = '';
  const map: IndexMapEntry[] = [];
  let index = 0;

  const push = (chunk: string, start: number, end: number): void => {
    for (const char of chunk) {
      text += char;
      map.push({ start, end });
    }
  };

  while (index < s.length) {
    const rest = s.slice(index);
    const match = rest.match(/^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
    if (!match) {
      const char = s[index];
      push(char, index, index + char.length);
      index += char.length;
      continue;
    }

    const raw = match[0];
    const before = s[index - 1] ?? '';
    const digits = [...raw].map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join('');
    const rawEnd = index + raw.length;
    const isExponent = /\d/.test(before);
    const isUnit = raw.length === 1 && /[a-zA-Z]/.test(before) && (digits === '2' || digits === '3');
    push(isExponent || isUnit ? raw : `[${digits}]`, index, rawEnd);
    index = rawEnd;
  }

  return { text, map };
}

const RANGE_RE =
  /(?:\[\s*((?:\d+\s*[,;–—\-]?\s*)+)\s*\]|\(\s*((?:\d+\s*[,;–—\-]?\s*)+)\s*\))/g;

const LOOSE_MARKER_RE = /\s(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)(?=[\.,;:](?:\s|$))/g;
const LOOSE_REJECT_BEFORE_RE =
  /(?:\b(?:or|rr|hr|ci|auc|sd|se|iqr|p|n|no|table|fig|figure|group|grade|class|type|day|month|year|years?|week|weeks?)|[%=<>±+\-/:])\s*$/i;

export function detectMarkers(text: string): MarkerOccurrence[] {
  const out: MarkerOccurrence[] = [];
  const { text: normalized, map } = normalizeSuperscriptsWithMap(text);
  // Critical: reset lastIndex because RANGE_RE is module-level with /g flag.
  // Without this, repeated calls in the same tick skip earlier matches.
  RANGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RANGE_RE.exec(normalized))) {
    const raw = m[0];
    const inner = m[1] ?? m[2];
    const refNumbers = expandRange(inner);
    if (refNumbers.length === 0) continue;
    const start = map[m.index]?.start ?? m.index;
    const last = map[m.index + raw.length - 1];
    const end = last?.end ?? (m.index + raw.length);
    // Reject bracket ranges that are actually statistical value ranges
    // (IQR / CI / measurement intervals), e.g. "median 61 [49–63]",
    // "83 [71–92] mg/dL", "IQR [53–70]". Parenthetical ranges are kept —
    // Vancouver-style citations "(4-6)" must still resolve.
    if (
      raw[0] === '['
      && looksLikeValueRange(normalized, m.index, m.index + raw.length, raw)
    ) {
      continue;
    }
    out.push({
      startIndex: start,
      endIndex: end,
      raw: text.slice(start, end),
      refNumbers,
    });
  }
  RANGE_RE.lastIndex = 0;
  appendLooseNumericMarkers(text, out);
  return out.sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Heuristic: is the bracketed span [start, end) a statistical value range
 * rather than a citation? Signals (any one is sufficient):
 *  1. The token immediately before '[' is a number (e.g. "61 [49–63]").
 *  2. A range/stats keyword precedes it within ~16 chars (IQR, median,
 *     mean, range, CI, percentile, interquartile).
 *  3. A unit follows ']' within ~12 chars (mg/dL, mmol/L, years, kg, %).
 */
function looksLikeValueRange(text: string, start: number, end: number, raw: string): boolean {
  const inner = raw.replace(/^\[\s*|\s*\]$/g, '');
  const isRangeLike = /[–—-]/.test(inner) || /\b(?:iqr|ci|range)\b/i.test(inner);
  const singleNumber = /^\d+$/.test(inner.trim());

  // 1. Digit immediately before the opening bracket (ignoring spaces).
  let i = start - 1;
  while (i >= 0 && /\s/.test(text[i])) i -= 1;
  if (i >= 0 && /\d/.test(text[i]) && isRangeLike) return true;

  // 2. Stats/range keyword within the preceding ~16 characters.
  const before = text.slice(Math.max(0, start - 24), start).toLowerCase();
  if (
    /(interquartile|\biqr\b|\bmedian\b|\bmean\b|\branges?\s+from|\branged\s+from|\brange\s+of|\bpercentile\b|\bci\b)/.test(
      before,
    )
  ) {
    return !singleNumber;
  }

  // 3. A measurement unit follows the closing bracket.
  const after = text.slice(end, end + 14).toLowerCase();
  if (
    /\s*(mg\/dl|mmol\/l|mg\/l|µg\/l|mcg\/l|g\/l|g\/dl|years?|year-old|months?|weeks?|days?|hours?|kg|mEq\/l|ml\/min|×10|cells?\/|u\/l|iu\/l|%)/.test(
      after,
    )
  ) {
    return !singleNumber;
  }
  return false;
}

function appendLooseNumericMarkers(text: string, out: MarkerOccurrence[]): void {
  LOOSE_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LOOSE_MARKER_RE.exec(text))) {
    const raw = m[1];
    const start = m.index + m[0].indexOf(raw);
    const end = start + raw.length;
    if (overlapsExistingMarker(start, end, out)) continue;
    if (!looksLikeFlattenedSuperscriptCitation(text, start, end)) continue;
    const refNumbers = expandRange(raw);
    if (refNumbers.length === 0) continue;
    out.push({
      startIndex: start,
      endIndex: end,
      raw,
      refNumbers,
    });
  }
  LOOSE_MARKER_RE.lastIndex = 0;
}

function overlapsExistingMarker(start: number, end: number, out: MarkerOccurrence[]): boolean {
  return out.some((marker) => start < marker.endIndex && end > marker.startIndex);
}

function looksLikeFlattenedSuperscriptCitation(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start);
  const afterPunctuation = text[end] ?? '';
  const afterNext = text[end + 1] ?? '';
  const previousChar = previousNonSpace(before);
  if (!previousChar || !/[A-Za-zÇĞİÖŞÜçğıöşü\)]/.test(previousChar)) return false;
  if (afterPunctuation === '.' && /\d/.test(afterNext)) return false;

  const beforeWindow = before.slice(-32);
  if (LOOSE_REJECT_BEFORE_RE.test(beforeWindow)) return false;

  const numberText = text.slice(start, end).trim();
  if (/^\d+$/.test(numberText)) {
    const n = Number(numberText);
    if (!Number.isInteger(n) || n <= 0 || n > 300) return false;
  }
  return true;
}

function previousNonSpace(text: string): string {
  const match = text.match(/\S\s*$/);
  return match ? match[0].trim().slice(-1) : '';
}

export function expandRange(inner: string): number[] {
  const parts = inner.split(/[,\;]/g).map((p) => p.trim()).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const range = p.match(/^(\d+)\s*[–—\-]\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a < 200) {
        for (let i = a; i <= b; i++) out.push(i);
      }
    } else {
      const n = parseInt(p, 10);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return Array.from(new Set(out)).sort((x, y) => x - y);
}

export function replaceMarkers(
  text: string,
  replacer: (occ: MarkerOccurrence) => string,
): string {
  const occs = detectMarkers(text);
  if (occs.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const o of occs) {
    out += text.slice(cursor, o.startIndex);
    out += replacer(o);
    cursor = o.endIndex;
  }
  out += text.slice(cursor);
  return out;
}
