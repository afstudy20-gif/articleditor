import type { Author, Ref } from '@/store/types';
import { initialsOf } from './normalize';

// A parametric citation-style description. Built-in styles (vancouver/apa/ama/
// ieee) keep their exact hand-written formatters for zero regression; this spec
// engine drives USER-DEFINED custom styles only. It is intentionally pragmatic
// — it covers the knobs authors actually tweak per journal (author count before
// et al., name order, initials, in-text bracket vs author-year, title/journal
// emphasis, locator layout, DOI) rather than full CSL generality.

export type StyleMode = 'numeric' | 'author-year';
export type BracketKind = 'square' | 'paren' | 'curly' | 'superscript';
export type NameOrder = 'family-initials' | 'family-comma-initials' | 'initials-family';
export type Emphasis = 'plain' | 'italic' | 'quoted';
export type LocatorLayout = 'vancouver' | 'apa' | 'ieee';
export type BibNumber = 'dot' | 'bracket' | 'none';

export interface StyleSpec {
  id: string; // 'custom:...' for user styles
  name: string;
  mode: StyleMode;
  inText: {
    bracket: BracketKind; // numeric mode
    authorYearOpen: string; // '(' for APA-like
    authorYearClose: string; // ')'
    authorYearSep: string; // ', ' between author and year
    etAlAfter: number; // in author-year, use et al. when authors > this
  };
  authors: {
    nameOrder: NameOrder;
    initialPeriods: boolean;
    initialSpaces: boolean;
    maxBeforeEtAl: number; // truncate when total > this
    showCount: number; // names shown before "et al." (usually == max)
    etAlText: string;
    delimiter: string; // between authors
    useAndBeforeLast: boolean;
    andText: string; // '&' or 'and'
  };
  title: { emphasis: Emphasis; suffix: string };
  journal: { emphasis: Emphasis; suffix: string };
  locator: LocatorLayout;
  year: { wrapParens: boolean };
  doi: { include: boolean; prefix: string };
  bib: { number: BibNumber; order: 'citation' | 'alphabetical' };
}

// ---------------------------------------------------------------------------
// Author rendering
// ---------------------------------------------------------------------------

function renderInitials(given: string | undefined, periods: boolean, spaces: boolean): string {
  const base = initialsOf(given); // e.g. "JA"
  if (!base) return '';
  const chars = base.split('');
  if (periods && spaces) return chars.map((c) => `${c}.`).join(' ');
  if (periods) return chars.map((c) => `${c}.`).join('');
  if (spaces) return chars.join(' ');
  return chars.join('');
}

function splitLiteral(literal: string): { family: string; given?: string } {
  const m = literal.match(/^([^,]+),\s*(.+)$/);
  if (m) return { family: m[1].trim(), given: m[2].trim() };
  return { family: literal };
}

function renderAuthor(a: Author, s: StyleSpec['authors']): string {
  let family = a.family ?? '';
  let given = a.given;
  if (!family && a.literal) {
    const parsed = splitLiteral(a.literal);
    family = parsed.family;
    given = given ?? parsed.given;
  }
  const inits = renderInitials(given, s.initialPeriods, s.initialSpaces);
  if (!family) return inits || a.literal || '';
  switch (s.nameOrder) {
    case 'family-comma-initials':
      return inits ? `${family}, ${inits}` : family;
    case 'initials-family':
      return inits ? `${inits} ${family}` : family;
    case 'family-initials':
    default:
      return inits ? `${family} ${inits}` : family;
  }
}

export function renderAuthorList(authors: Author[], s: StyleSpec['authors']): string {
  if (authors.length === 0) return '';
  const truncated = authors.length > s.maxBeforeEtAl;
  const shown = (truncated ? authors.slice(0, s.showCount) : authors).map((a) => renderAuthor(a, s));
  if (truncated) {
    return `${shown.join(s.delimiter)}${s.delimiter}${s.etAlText}`;
  }
  if (shown.length === 1) return shown[0];
  if (s.useAndBeforeLast) {
    const head = shown.slice(0, -1).join(s.delimiter);
    return `${head}${s.delimiter}${s.andText} ${shown[shown.length - 1]}`;
  }
  return shown.join(s.delimiter);
}

// ---------------------------------------------------------------------------
// In-text
// ---------------------------------------------------------------------------

function bracketWrap(kind: BracketKind, inner: string): string {
  switch (kind) {
    case 'paren':
      return `(${inner})`;
    case 'curly':
      return `{${inner}}`;
    case 'superscript':
      return inner; // rendered raised via CSS at the node level
    case 'square':
    default:
      return `[${inner}]`;
  }
}

function numericRange(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      groups.push([start, prev]);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  groups.push([start, prev]);
  return groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
}

function firstFamily(a: Author | undefined): string {
  if (!a) return 'Anon';
  return a.family || a.literal || a.given || 'Anon';
}

export function formatInTextSpec(spec: StyleSpec, refs: Ref[], numbers: number[]): string {
  if (spec.mode === 'numeric') {
    if (numbers.length === 0) return '';
    return bracketWrap(spec.inText.bracket, numericRange(numbers));
  }
  // author-year
  const parts = refs.map((r) => {
    const n = r.authors.length;
    const year = r.year ?? 'n.d.';
    let authorPart: string;
    if (n === 0) authorPart = 'Anon';
    else if (n === 1) authorPart = firstFamily(r.authors[0]);
    else if (n <= spec.inText.etAlAfter) {
      authorPart = r.authors
        .slice(0, spec.inText.etAlAfter)
        .map((a) => firstFamily(a))
        .join(` ${spec.authors.andText} `);
    } else {
      authorPart = `${firstFamily(r.authors[0])} ${spec.authors.etAlText}`;
    }
    return `${authorPart}${spec.inText.authorYearSep}${year}`;
  });
  return `${spec.inText.authorYearOpen}${parts.join('; ')}${spec.inText.authorYearClose}`;
}

// ---------------------------------------------------------------------------
// Bibliography
// ---------------------------------------------------------------------------

function emphasize(text: string, e: Emphasis): string {
  switch (e) {
    case 'italic':
      return `*${text}*`;
    case 'quoted':
      return `"${text}"`;
    case 'plain':
    default:
      return text;
  }
}

function stripPeriod(s: string): string {
  return s.replace(/\.+\s*$/, '');
}

function buildLocator(spec: StyleSpec, r: Ref): string {
  const year = r.year ? String(r.year) : '';
  switch (spec.locator) {
    case 'ieee': {
      const bits: string[] = [];
      if (r.volume) bits.push(`vol. ${r.volume},`);
      if (r.issue) bits.push(`no. ${r.issue},`);
      if (r.pages) bits.push(`pp. ${r.pages},`);
      if (year) bits.push(`${year}.`);
      return bits.join(' ');
    }
    case 'apa': {
      let cite = '';
      if (r.volume) cite += r.volume;
      if (r.issue) cite += `(${r.issue})`;
      if (r.pages) cite += cite ? `, ${r.pages}` : r.pages;
      return cite ? `${cite}.` : '';
    }
    case 'vancouver':
    default: {
      const v: string[] = [];
      if (year) v.push(year);
      if (r.volume) v.push(`;${r.volume}`);
      if (r.issue) v.push(`(${r.issue})`);
      if (r.pages) v.push(`:${r.pages}`);
      return v.length ? `${v.join('')}.` : '';
    }
  }
}

function endWith(s: string, ch: string): string {
  return s.endsWith(ch) ? s : `${s}${ch}`;
}

export function formatBibEntrySpec(spec: StyleSpec, r: Ref, n: number): string {
  const parts: string[] = [];

  // Number prefix.
  if (spec.bib.number === 'dot') parts.push(`${n}.`);
  else if (spec.bib.number === 'bracket') parts.push(`[${n}]`);

  // Authors. Avoid a double period when the last initial already ends in '.'.
  const authors = renderAuthorList(r.authors, spec.authors);
  if (authors) parts.push(endWith(authors, '.'));

  // Author-year places the year right after the authors.
  if (spec.mode === 'author-year' && r.year) {
    parts.push(spec.year.wrapParens ? `(${r.year}).` : `${r.year}.`);
  }

  // Title. Quoted styles (IEEE) put trailing punctuation inside the quotes.
  if (r.title) {
    const tt = stripPeriod(r.title);
    if (spec.title.emphasis === 'quoted') parts.push(`"${tt}${spec.title.suffix}"`);
    else parts.push(`${emphasize(tt, spec.title.emphasis)}${spec.title.suffix}`);
  }

  // Journal + locator.
  if (spec.locator === 'apa') {
    // APA folds vol/issue/pages into the italic journal group.
    if (r.containerTitle) {
      let grp = emphasize(stripPeriod(r.containerTitle), spec.journal.emphasis);
      const loc = buildLocator(spec, r).replace(/\.$/, '');
      if (loc) grp += `, ${loc}`;
      parts.push(`${grp}.`);
    }
  } else {
    if (r.containerTitle) {
      parts.push(`${emphasize(stripPeriod(r.containerTitle), spec.journal.emphasis)}${spec.journal.suffix}`);
    }
    const loc = buildLocator(spec, r);
    if (loc) parts.push(loc);
  }

  // DOI.
  if (spec.doi.include && r.doi) parts.push(`${spec.doi.prefix}${r.doi}`);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function isNumericSpec(spec: StyleSpec): boolean {
  return spec.mode === 'numeric';
}

export function orderBySpec<T extends Ref>(spec: StyleSpec, refs: T[]): T[] {
  if (spec.bib.order !== 'alphabetical') return refs;
  return [...refs].sort((a, b) => {
    const fa = (a.authors[0]?.family ?? a.authors[0]?.literal ?? '').toLowerCase();
    const fb = (b.authors[0]?.family ?? b.authors[0]?.literal ?? '').toLowerCase();
    return fa.localeCompare(fb);
  });
}

// ---------------------------------------------------------------------------
// Presets (seed the editor from a familiar layout) + a blank default
// ---------------------------------------------------------------------------

export function presetSpec(base: 'vancouver' | 'apa' | 'ama' | 'ieee'): StyleSpec {
  const common = {
    inText: { bracket: 'square' as BracketKind, authorYearOpen: '(', authorYearClose: ')', authorYearSep: ', ', etAlAfter: 2 },
    year: { wrapParens: false },
  };
  if (base === 'apa') {
    return {
      id: '',
      name: '',
      mode: 'author-year',
      inText: { ...common.inText, etAlAfter: 2 },
      authors: {
        nameOrder: 'family-comma-initials',
        initialPeriods: true,
        initialSpaces: true,
        maxBeforeEtAl: 20,
        showCount: 20,
        etAlText: 'et al.',
        delimiter: ', ',
        useAndBeforeLast: true,
        andText: '&',
      },
      title: { emphasis: 'plain', suffix: '.' },
      journal: { emphasis: 'italic', suffix: '.' },
      locator: 'apa',
      year: { wrapParens: true },
      doi: { include: true, prefix: 'https://doi.org/' },
      bib: { number: 'none', order: 'alphabetical' },
    };
  }
  if (base === 'ieee') {
    return {
      id: '',
      name: '',
      mode: 'numeric',
      inText: { ...common.inText, bracket: 'square' },
      authors: {
        nameOrder: 'family-initials',
        initialPeriods: false,
        initialSpaces: false,
        maxBeforeEtAl: 6,
        showCount: 6,
        etAlText: 'et al.',
        delimiter: ', ',
        useAndBeforeLast: false,
        andText: 'and',
      },
      title: { emphasis: 'quoted', suffix: ',' },
      journal: { emphasis: 'plain', suffix: ',' },
      locator: 'ieee',
      year: { wrapParens: false },
      doi: { include: true, prefix: 'doi: ' },
      bib: { number: 'bracket', order: 'citation' },
    };
  }
  // vancouver / ama
  return {
    id: '',
    name: '',
    mode: 'numeric',
    inText: { ...common.inText, bracket: 'square' },
    authors: {
      nameOrder: 'family-initials',
      initialPeriods: false,
      initialSpaces: false,
      maxBeforeEtAl: 6,
      showCount: 6,
      etAlText: 'et al',
      delimiter: ', ',
      useAndBeforeLast: false,
      andText: 'and',
    },
    title: { emphasis: 'plain', suffix: '.' },
    journal: { emphasis: 'plain', suffix: '.' },
    locator: 'vancouver',
    year: { wrapParens: false },
    doi: { include: true, prefix: 'doi:' },
    bib: { number: 'dot', order: 'citation' },
  };
}

// ---------------------------------------------------------------------------
// Custom-style registry (persisted per browser in localStorage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'enr-custom-styles';
let registry: Record<string, StyleSpec> | null = null;

function load(): Record<string, StyleSpec> {
  if (registry) return registry;
  registry = {};
  if (typeof window === 'undefined') return registry;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StyleSpec[];
      for (const s of parsed) registry[s.id] = s;
    }
  } catch {
    // ignore corrupt storage
  }
  return registry;
}

function persist(): void {
  if (typeof window === 'undefined' || !registry) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(registry)));
  } catch {
    // ignore quota errors
  }
}

export function listCustomStyles(): StyleSpec[] {
  return Object.values(load()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getCustomStyle(id: string): StyleSpec | undefined {
  return load()[id];
}

export function saveCustomStyle(spec: StyleSpec): void {
  load()[spec.id] = spec;
  persist();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('enr-styles-updated'));
}

export function deleteCustomStyle(id: string): void {
  const r = load();
  delete r[id];
  persist();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('enr-styles-updated'));
}
