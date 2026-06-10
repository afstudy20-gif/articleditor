import type { Ref } from '@/store/types';
import { vancouverAuthorList, firstAuthorFamily } from './normalize';
import {
  getCustomStyle,
  listCustomStyles,
  formatInTextSpec,
  formatBibEntrySpec,
  isNumericSpec,
  orderBySpec,
} from './style-spec';

// A style id is either a built-in name or a 'custom:<uuid>' id.
export type CitationStyle =
  | 'vancouver'
  | 'apa'
  | 'ama'
  | 'ieee'
  | 'mdpi-acs'
  | 'mdpi-chicago'
  | 'mdpi-apa';
export type StyleId = CitationStyle | string;

const BUILTIN_IDS: readonly CitationStyle[] = [
  'vancouver',
  'apa',
  'ama',
  'ieee',
  'mdpi-acs',
  'mdpi-chicago',
  'mdpi-apa',
];

export function isBuiltinStyle(id: string): id is CitationStyle {
  return (BUILTIN_IDS as readonly string[]).includes(id);
}

export const STYLE_LABELS: Record<CitationStyle, string> = {
  vancouver: 'Vancouver',
  apa: 'APA 7',
  ama: 'AMA',
  ieee: 'IEEE',
  'mdpi-acs': 'MDPI ACS',
  'mdpi-chicago': 'MDPI Chicago',
  'mdpi-apa': 'MDPI APA',
};

/** All selectable styles (built-ins + user custom styles) for the picker. */
export function listAllStyles(): Array<{ id: StyleId; label: string; custom: boolean }> {
  const builtins = BUILTIN_IDS.map((id) => ({ id, label: STYLE_LABELS[id], custom: false }));
  const customs = listCustomStyles().map((s) => ({ id: s.id, label: s.name, custom: true }));
  return [...builtins, ...customs];
}

/** Display label for any style id. */
export function styleLabel(id: StyleId): string {
  if (isBuiltinStyle(id)) return STYLE_LABELS[id];
  return getCustomStyle(id)?.name ?? id;
}

/**
 * Per-citation rendering options (page/locator, prefix/suffix text,
 * author suppression for narrative author-year citations).
 */
export type CiteOptions = {
  /** Page or other locator, e.g. "s. 12", "pp. 12-14", "Table 2". */
  locator?: string;
  /** Text before the citation content, e.g. "see", "bkz.". */
  prefix?: string;
  /** Free text after the citation content. */
  suffix?: string;
  /** Author-year styles: render "(2020)" — author named in running text. */
  suppressAuthor?: boolean;
};

function hasCiteOptions(opts?: CiteOptions): boolean {
  return Boolean(opts && (opts.locator || opts.prefix || opts.suffix || opts.suppressAuthor));
}

// In-text citation display. Numbers parameter = ref numbers in order of citation.
// refs parameter = the actual Ref objects for author-year styles.
export function formatInTextCitation(
  style: StyleId,
  refs: Ref[],
  numbers: number[],
  opts?: CiteOptions,
): string {
  if (!isBuiltinStyle(style)) {
    const spec = getCustomStyle(style);
    if (spec) {
      const base = formatInTextSpec(spec, refs, numbers);
      return hasCiteOptions(opts)
        ? decorateCitation(base, isNumericSpec(spec), opts!)
        : base;
    }
    return formatNumericWithOpts(numbers, opts);
  }
  switch (style) {
    case 'apa':
    case 'mdpi-apa':
      return formatApaInText(refs, opts);
    case 'mdpi-chicago':
      return formatChicagoInText(refs, opts);
    case 'mdpi-acs':
      return formatMdpiNumericWithOpts(numbers, opts);
    case 'vancouver':
    case 'ama':
    case 'ieee':
    default:
      return formatNumericWithOpts(numbers, opts);
  }
}

function formatMdpiNumericWithOpts(numbers: number[], opts?: CiteOptions): string {
  let out = formatNumeric(numbers, '[', ']', '–');
  if (!opts) return out;
  if (opts.locator) out = `${out} (${opts.locator})`;
  if (opts.prefix) out = `${opts.prefix} ${out}`;
  if (opts.suffix) out = `${out} ${opts.suffix}`;
  return out;
}

function formatNumericWithOpts(numbers: number[], opts?: CiteOptions): string {
  const base = formatNumeric(numbers, '[', ']');
  return hasCiteOptions(opts) ? decorateCitation(base, true, opts!) : base;
}

/**
 * Apply locator/prefix/suffix to an already-formatted citation.
 * Numeric: locator goes inside the bracket — "[3, s. 12]";
 * author-year/other: locator goes inside the closing paren when present.
 * Prefix/suffix wrap outside (numeric) or inside the parens (author-year).
 */
function decorateCitation(base: string, numeric: boolean, opts: CiteOptions): string {
  let out = base;
  if (numeric) {
    if (opts.locator && out.endsWith(']')) {
      out = `${out.slice(0, -1)}, ${opts.locator}]`;
    }
    if (opts.prefix) out = `${opts.prefix} ${out}`;
    if (opts.suffix) out = `${out} ${opts.suffix}`;
    return out;
  }
  // Author-year shape "(...)" — splice inside the parens.
  if (out.startsWith('(') && out.endsWith(')')) {
    let inner = out.slice(1, -1);
    if (opts.locator) inner = `${inner}, ${opts.locator}`;
    if (opts.prefix) inner = `${opts.prefix} ${inner}`;
    if (opts.suffix) inner = `${inner}, ${opts.suffix}`;
    return `(${inner})`;
  }
  if (opts.prefix) out = `${opts.prefix} ${out}`;
  if (opts.locator) out = `${out}, ${opts.locator}`;
  if (opts.suffix) out = `${out} ${opts.suffix}`;
  return out;
}

function formatApaInText(refs: Ref[], opts?: CiteOptions): string {
  if (refs.length === 0) return '';
  const parts = refs
    .map((r) => {
      const year = r.year ?? 'n.d.';
      if (opts?.suppressAuthor) return `${year}`;
      const author = firstAuthorFamily(r.authors);
      const co = r.authors.length === 2 && r.authors[1].family ? ` & ${r.authors[1].family}` : '';
      const etAl = r.authors.length > 2 ? ' et al.' : '';
      return `${author}${co}${etAl}, ${year}`;
    })
    .join('; ');
  const base = `(${parts})`;
  return hasCiteOptions(opts) ? decorateCitation(base, false, opts!) : base;
}

function formatChicagoInText(refs: Ref[], opts?: CiteOptions): string {
  if (refs.length === 0) return '';
  const parts = refs.map((r) => {
    const year = r.year ?? 'n.d.';
    if (opts?.suppressAuthor) return String(year);
    const author = firstAuthorFamily(r.authors);
    if (r.authors.length === 2) {
      const second = r.authors[1]?.family ?? r.authors[1]?.literal ?? '';
      return `${author} and ${second} ${year}`;
    }
    return r.authors.length > 2
      ? `${author} et al. ${year}`
      : `${author} ${year}`;
  });
  const base = `(${parts.join('; ')})`;
  return hasCiteOptions(opts) ? decorateCitation(base, false, opts!) : base;
}

function formatNumeric(
  numbers: number[],
  open: string,
  close: string,
  rangeSeparator = '-',
): string {
  if (numbers.length === 0) return '';
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups: Array<[number, number]> = [];
  let s = sorted[0];
  let p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) {
      p = sorted[i];
    } else {
      groups.push([s, p]);
      s = sorted[i];
      p = sorted[i];
    }
  }
  groups.push([s, p]);
  return `${open}${groups.map(([a, b]) => (a === b ? `${a}` : `${a}${rangeSeparator}${b}`)).join(',')}${close}`;
}

// Bibliography entry formatting. n = ordinal (1-based) for numeric styles.
export function formatBibEntry(style: StyleId, r: Ref, n: number): string {
  if (!isBuiltinStyle(style)) {
    const spec = getCustomStyle(style);
    if (spec) return formatBibEntrySpec(spec, r, n);
    return formatVancouverEntry(r, n);
  }
  switch (style) {
    case 'apa':
    case 'mdpi-apa':
      return formatApaEntry(r);
    case 'mdpi-acs':
      return formatMdpiAcsEntry(r, n);
    case 'mdpi-chicago':
      return formatMdpiChicagoEntry(r);
    case 'vancouver':
    case 'ama':
      return formatVancouverEntry(r, n);
    case 'ieee':
      return formatIeeeEntry(r, n);
    default:
      return formatVancouverEntry(r, n);
  }
}

function formatMdpiAcsEntry(r: Ref, n: number): string {
  const parts: string[] = [`${n}.`];
  const authors = mdpiAcsAuthorList(r);
  if (authors) parts.push(authors.endsWith('.') ? authors : `${authors}.`);
  if (r.title) parts.push(`${stripPeriod(r.title)}.`);

  if (r.type === 'webpage') {
    if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)}.`);
    if (r.url) parts.push(`Available online: ${r.url}.`);
  } else if (r.type === 'book' || r.type === 'book-chapter') {
    if (r.containerTitle) parts.push(`In ${stripPeriod(r.containerTitle)};`);
    if (r.publisher) parts.push(`${stripPeriod(r.publisher)}:`);
    if (r.year) parts.push(`${r.year};`);
    if (r.pages) parts.push(`pp. ${r.pages}.`);
  } else {
    if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)}`);
    const details: string[] = [];
    if (r.year) details.push(String(r.year));
    if (r.volume) details.push(r.volume);
    if (r.pages) details.push(r.pages);
    if (details.length > 0) parts.push(`${details.join(', ')}.`);
  }

  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  else if (r.url && r.type !== 'webpage') parts.push(r.url);
  return parts.join(' ').replace(/\s+([.;,:])/g, '$1');
}

function mdpiAcsAuthorList(r: Ref): string {
  return r.authors
    .map((author) => {
      if (author.literal) return author.literal;
      const family = author.family ?? '';
      const initials = (author.given ?? '')
        .replace(/\./g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase() ?? ''}.`)
        .join('');
      return family && initials ? `${family}, ${initials}` : family || initials;
    })
    .filter(Boolean)
    .join('; ');
}

function formatMdpiChicagoEntry(r: Ref): string {
  const parts: string[] = [];
  const authors = chicagoAuthorList(r);
  if (authors) parts.push(`${authors}.`);
  if (r.year) parts.push(`${r.year}.`);
  if (r.title) parts.push(`${stripPeriod(r.title)}.`);

  if (r.type === 'webpage') {
    if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)}.`);
    if (r.url) parts.push(`Available online: ${r.url}.`);
  } else if (r.type === 'book' || r.type === 'book-chapter') {
    if (r.containerTitle) parts.push(`In ${stripPeriod(r.containerTitle)}.`);
    if (r.publisher) parts.push(`${stripPeriod(r.publisher)}.`);
    if (r.pages) parts.push(`pp. ${r.pages}.`);
  } else if (r.containerTitle) {
    let source = stripPeriod(r.containerTitle);
    if (r.volume) source += ` ${r.volume}`;
    if (r.pages) source += `: ${r.pages}`;
    parts.push(`${source}.`);
  }

  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  else if (r.url && r.type !== 'webpage') parts.push(r.url);
  return parts.join(' ');
}

function chicagoAuthorList(r: Ref): string {
  const names = r.authors.map((author, index) => {
    if (author.literal) return author.literal;
    const family = author.family ?? '';
    const given = author.given ?? '';
    if (index === 0) return family && given ? `${family}, ${given}` : family || given;
    return given && family ? `${given} ${family}` : family || given;
  }).filter(Boolean);

  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]}, and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function formatVancouverEntry(r: Ref, n: number): string {
  const parts: string[] = [`${n}.`];
  const authors = vancouverAuthorList(r.authors, 6);
  if (authors) parts.push(`${authors}.`);
  if (r.title) parts.push(`${stripPeriod(r.title)}.`);
  if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)}.`);
  const yvi: string[] = [];
  if (r.year) yvi.push(`${r.year}`);
  if (r.volume) yvi.push(`;${r.volume}`);
  if (r.issue) yvi.push(`(${r.issue})`);
  if (r.pages) yvi.push(`:${r.pages}`);
  if (yvi.length) parts.push(`${yvi.join('')}.`);
  if (r.doi) parts.push(`doi:${r.doi}`);
  return parts.join(' ');
}

function formatIeeeEntry(r: Ref, n: number): string {
  const parts: string[] = [`[${n}]`];
  const authors = vancouverAuthorList(r.authors, 6).replace(/, et al$/, ', et al.');
  if (authors) parts.push(`${authors},`);
  if (r.title) parts.push(`"${stripPeriod(r.title)},"`);
  if (r.containerTitle) parts.push(`${stripPeriod(r.containerTitle)},`);
  if (r.volume) parts.push(`vol. ${r.volume},`);
  if (r.issue) parts.push(`no. ${r.issue},`);
  if (r.pages) parts.push(`pp. ${r.pages},`);
  if (r.year) parts.push(`${r.year}.`);
  if (r.doi) parts.push(`doi: ${r.doi}`);
  return parts.join(' ');
}

function formatApaEntry(r: Ref): string {
  const parts: string[] = [];
  const authors = apaAuthorList(r);
  if (authors) parts.push(`${authors}`);
  if (r.year) parts.push(`(${r.year}).`);
  if (r.title) parts.push(`${stripPeriod(r.title)}.`);
  if (r.containerTitle) {
    let cite = `*${stripPeriod(r.containerTitle)}*`;
    if (r.volume) cite += `, ${r.volume}`;
    if (r.issue) cite += `(${r.issue})`;
    if (r.pages) cite += `, ${r.pages}`;
    parts.push(`${cite}.`);
  }
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  return parts.join(' ');
}

function apaAuthorList(r: Ref): string {
  const authors = r.authors;
  if (authors.length === 0) return '';
  const formatOne = (a: typeof authors[number]): string => {
    if (a.literal) return a.literal;
    const fam = a.family ?? '';
    const giv = a.given ?? '';
    const inits = giv
      .replace(/\./g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `${t[0].toUpperCase()}.`)
      .join(' ');
    return fam && inits ? `${fam}, ${inits}` : fam || inits;
  };
  if (authors.length === 1) return formatOne(authors[0]);
  if (authors.length === 2) return `${formatOne(authors[0])}, & ${formatOne(authors[1])}`;
  if (authors.length <= 20) {
    const list = authors.slice(0, -1).map(formatOne).join(', ');
    return `${list}, & ${formatOne(authors[authors.length - 1])}`;
  }
  // 21+: APA 7 first 19 ... last
  const first19 = authors.slice(0, 19).map(formatOne).join(', ');
  return `${first19}, ... ${formatOne(authors[authors.length - 1])}`;
}

function stripPeriod(s: string): string {
  return s.replace(/\.+\s*$/, '');
}

// Sort author-year bibliographies alphabetically; numeric styles preserve
// citation order supplied by the caller.
export function orderRefsForBib<T extends Ref>(style: StyleId, refs: T[]): T[] {
  if (!isBuiltinStyle(style)) {
    const spec = getCustomStyle(style);
    return spec ? orderBySpec(spec, refs) : refs;
  }
  if (style !== 'apa' && style !== 'mdpi-apa' && style !== 'mdpi-chicago') return refs;
  return [...refs].sort((a, b) => {
    const fa = (a.authors[0]?.family ?? a.authors[0]?.literal ?? '').toLowerCase();
    const fb = (b.authors[0]?.family ?? b.authors[0]?.literal ?? '').toLowerCase();
    return fa.localeCompare(fb);
  });
}

export function isNumericStyle(style: StyleId): boolean {
  if (!isBuiltinStyle(style)) {
    const spec = getCustomStyle(style);
    return spec ? isNumericSpec(spec) : true;
  }
  return style === 'vancouver'
    || style === 'ama'
    || style === 'ieee'
    || style === 'mdpi-acs';
}
