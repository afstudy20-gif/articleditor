import type { Author } from '@/store/types';

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function parseAuthors(raw: string): Author[] {
  const cleaned = raw
    .replace(/\bet\s+al\.?$/i, '')
    .replace(/\.\s*$/, '')
    .trim();
  if (!cleaned) return [];

  const tokens = splitAuthors(cleaned);
  return tokens.map((t) => parseSingleAuthor(t)).filter((a) => a.family || a.given || a.literal);
}

function splitAuthors(s: string): string[] {
  if (/;/.test(s)) {
    return s
      .split(/\s*;\s*/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (/\sand\s/i.test(s)) {
    return s
      .split(/\s*(?:,|and)\s+/gi)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  // Heuristic: "Smith J, Jones K, Brown L" — comma between authors
  const parts = s.split(/\s*,\s*/g);
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (looksLikeInitials(p) && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}, ${p}`;
    } else {
      merged.push(p);
    }
  }
  return merged.filter(Boolean);
}

function looksLikeInitials(s: string): boolean {
  return /^[A-ZÇĞİÖŞÜ](\.?[A-ZÇĞİÖŞÜ])*\.?$/.test(s.trim());
}

function parseSingleAuthor(s: string): Author {
  const t = s.trim();
  if (!t) return {};
  // "Smith J" or "Smith JA"
  const m1 = t.match(/^([A-ZÇĞİÖŞÜ][\w'\-]+(?:\s+[A-ZÇĞİÖŞÜ][\w'\-]+)?)\s+([A-ZÇĞİÖŞÜ]{1,4})$/);
  if (m1) return { family: m1[1], given: m1[2] };
  // "Smith, J." or "Smith, John"
  const m2 = t.match(/^([^,]+),\s*(.+)$/);
  if (m2) return { family: m2[1].trim(), given: m2[2].trim().replace(/\./g, '') };
  // "John Smith"
  const parts = t.split(/\s+/);
  if (parts.length >= 2) {
    return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
  }
  return { literal: t };
}

export function firstAuthorFamily(authors: Author[]): string {
  const a = authors[0];
  if (!a) return 'Anonymous';
  return a.family || a.literal || a.given || 'Anonymous';
}

export function authorsToCsl(authors: Author[]): { family?: string; given?: string; literal?: string }[] {
  return authors.map((a) => ({ ...a }));
}

// "Vanessa S." -> "VS"; "Kyung Hoon" -> "KH"; "J-P" -> "JP"; "J. P." -> "JP"
export function initialsOf(given: string | undefined): string {
  if (!given) return '';
  const cleaned = given.replace(/\./g, ' ');
  const tokens = cleaned.split(/[\s\-]+/).filter(Boolean);
  let out = '';
  for (const t of tokens) {
    const ch = t[0];
    if (!ch) continue;
    if (/[A-ZÇĞİÖŞÜ]/.test(ch)) {
      out += ch;
    } else if (/[a-zçğıöşü]/.test(ch)) {
      out += ch.toUpperCase();
    }
  }
  return out;
}

// Vancouver-style author rendering: "Family II" (e.g. "Smith AB").
export function vancouverAuthor(a: Author): string {
  if (a.literal) {
    // Try to parse literal "Family Given" if possible.
    const m = a.literal.match(/^([^,]+),\s*(.+)$/);
    if (m) return `${m[1].trim()} ${initialsOf(m[2])}`.trim();
    return a.literal;
  }
  const family = a.family ?? '';
  const inits = initialsOf(a.given);
  if (family && inits) return `${family} ${inits}`;
  return family || inits || '';
}

// Limit to first N authors then append "et al."
export function vancouverAuthorList(authors: Author[], maxAuthors = 6): string {
  if (authors.length === 0) return '';
  const shown = authors.slice(0, maxAuthors).map(vancouverAuthor).filter(Boolean);
  if (authors.length > maxAuthors) {
    return shown.join(', ') + ', et al';
  }
  return shown.join(', ');
}
