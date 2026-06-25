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
    out.push({
      startIndex: start,
      endIndex: end,
      raw: text.slice(start, end),
      refNumbers,
    });
  }
  RANGE_RE.lastIndex = 0;
  return out;
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
