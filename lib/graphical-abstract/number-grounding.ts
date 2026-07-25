/**
 * Checks that every number a generated graphical abstract shows actually appears in the
 * manuscript it was generated from.
 *
 * This exists because the measured failure rate is high: across 253 randomised-trial
 * visual abstracts, the primary outcome's results were shown in only 30%, and 57% of the
 * ones reporting non-significant results contained spin. A model asked to summarise
 * results will happily produce a plausible number that is not in the paper.
 *
 * The asymmetry in the index is the substance of the check. Each source number is indexed
 * together with its roundings to 0-3 decimals, so:
 *   source 2.22 -> spec 2.2   passes  (dropping precision is legitimate)
 *   source 2.2  -> spec 2.22  fails   (adding precision is fabrication)
 *
 * Everything here is pure and offline. It never mutates or "corrects" a number: an
 * unexpected rounding convention is a question for the author, not something to silently
 * rewrite in a figure that will be submitted to a journal.
 */

export type NumberKind = 'plain' | 'percent' | 'pvalue';

export interface NumberToken {
  /** The number exactly as written, for quoting back to the author. */
  raw: string;
  /** The most likely reading — thousands over decimal for an ambiguous comma. */
  value: number;
  /**
   * Every reading the literal supports. "1,378" is 1378 in English and 1.378 in Turkish,
   * and ARTED is used in both. Both sides of the comparison stay permissive about this:
   * wrongly flagging a correctly copied number would train the author to ignore the
   * check, which costs more than missing an ambiguous one.
   */
  values: number[];
  kind: NumberKind;
  /** Only set for p-values: `p < 0.001` and `p = 0.001` are different claims. */
  cmp?: string;
  /** Character offset in the normalised text. */
  index: number;
}

/**
 * Unicode minus and dashes read as minus only when a digit follows, so "Drug A — Drug B"
 * is left alone; thin/non-breaking spaces between digits are thousands separators.
 */
export function normalizeNumericText(text: string): string {
  return text
    .replace(/[−–—](?=\s?\d)/g, '-')
    .replace(/(\d)[   ](\d{3})\b/g, '$1$2')
    .replace(/ /g, ' ');
}

/** Stable key for a numeric value, so 2.2 and 2.20 collapse to one entry. */
function keyOf(value: number): string {
  return String(Number(value.toFixed(6)));
}

/**
 * Values a numeric literal could denote. "1,378" is thousands; "1,38" is a Turkish
 * decimal; "1,3785" is neither convention cleanly, so both readings are offered and the
 * caller decides how permissive to be.
 */
export function interpretNumeric(raw: string): number[] {
  const s = raw.trim();
  // A single comma group is genuinely ambiguous: "1,378" is 1378 in English prose and
  // 1.378 in Turkish. Thousands comes first because it is the likelier reading, but both
  // are returned so neither side of the comparison rejects the other convention.
  if (/^-?\d{1,3},\d{3}$/.test(s)) return [Number(s.replace(',', '')), Number(s.replace(',', '.'))];
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return [Number(s.replace(/,/g, ''))];
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return [Number(s.replace(/\./g, '').replace(',', '.'))];
  if (/^-?\d+,\d+$/.test(s)) return [Number(s.replace(',', '.'))];
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? [n] : [];
}

const PVALUE_RE = /\bp\s*(<=|>=|<|>|=|≤|≥)\s*(\d*\.?\d+)/gi;
const NUMBER_RE = /(?<![A-Za-z0-9_])(-?)(\d+(?:[.,]\d+)*|\.\d+)\s*(%)?/g;
const LEADING_PERCENT_RE = /%\s*$/;

function normalizeCmp(cmp: string): string {
  if (cmp === '≤') return '<=';
  if (cmp === '≥') return '>=';
  return cmp;
}

/**
 * All numbers in a piece of text. p-values are extracted first and their spans excluded
 * from the general pass, so "p < 0.001" yields one p-value token rather than a stray 0.001.
 */
export function extractNumbers(text: string): NumberToken[] {
  const src = normalizeNumericText(text);
  const tokens: NumberToken[] = [];
  const consumed: Array<[number, number]> = [];

  PVALUE_RE.lastIndex = 0;
  for (let m = PVALUE_RE.exec(src); m; m = PVALUE_RE.exec(src)) {
    // AMA style drops the leading zero: "P = .03" means 0.03.
    const value = Number(m[2].startsWith('.') ? `0${m[2]}` : m[2]);
    if (Number.isFinite(value)) {
      tokens.push({ raw: m[0], value, values: [value], kind: 'pvalue', cmp: normalizeCmp(m[1]), index: m.index });
    }
    consumed.push([m.index, m.index + m[0].length]);
  }

  NUMBER_RE.lastIndex = 0;
  for (let m = NUMBER_RE.exec(src); m; m = NUMBER_RE.exec(src)) {
    const start = m.index;
    if (consumed.some(([a, b]) => start >= a && start < b)) continue;
    const body = m[2];
    const negative = m[1] === '-';
    const values = interpretNumeric(body);
    if (values.length === 0) continue;
    // Turkish writes the sign before the number ("%12"); English after ("12%").
    const percent = Boolean(m[3]) || LEADING_PERCENT_RE.test(src.slice(Math.max(0, start - 2), start));
    const signed = values.map((v) => (negative ? -v : v));
    tokens.push({
      raw: m[0].trim(),
      value: signed[0],
      values: signed,
      kind: percent ? 'percent' : 'plain',
      index: start,
    });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

export interface SourceIndex {
  plain: Set<string>;
  percent: Set<string>;
  pvalues: Set<string>;
  /** Kept for the derived-percentage fallback and for arm-consistency lookups. */
  tokens: NumberToken[];
  text: string;
}

/**
 * Indexes a manuscript. Each value is stored together with its roundings to 0-3 decimals,
 * which is what lets a figure legitimately show 2.2 for a source 2.22 while still catching
 * a figure that shows 2.22 for a source 2.2.
 */
export function buildSourceIndex(text: string): SourceIndex {
  const tokens = extractNumbers(text);
  const plain = new Set<string>();
  const percent = new Set<string>();
  const pvalues = new Set<string>();

  for (const t of tokens) {
    if (t.kind === 'pvalue') {
      pvalues.add(`${t.cmp}:${keyOf(t.value)}`);
      continue;
    }
    const target = t.kind === 'percent' ? percent : plain;
    for (const v of t.values) {
      for (const k of [0, 1, 2, 3]) target.add(keyOf(Number(v.toFixed(k))));
      target.add(keyOf(v));
      // A percentage in the source also grounds the bare number, because papers write
      // "37 (12.4%)" and a figure may quote either form.
      if (t.kind === 'percent') {
        for (const k of [0, 1, 2, 3]) plain.add(keyOf(Number(v.toFixed(k))));
        plain.add(keyOf(v));
      }
    }
  }

  return { plain, percent, pvalues, tokens, text: normalizeNumericText(text) };
}

/** Confidence levels are conventions, not findings: "95% CI" needs no source. */
const CONVENTIONAL_PERCENTS = new Set(['90', '95', '99']);

function isConventionalConfidence(token: NumberToken, context: string): boolean {
  if (!token.values.some((v) => CONVENTIONAL_PERCENTS.has(keyOf(v)))) return false;
  return /\b(CI|confidence|güven\s*aral)/i.test(context);
}

export interface GroundingOptions {
  /**
   * Accept a percentage the figure computed from two source counts (n/N x 100). Off by
   * default: it makes almost any percentage matchable and is the main source of false
   * "grounded" verdicts.
   */
  allowDerivedPercent?: boolean;
}

export interface UngroundedNumber {
  /** Dotted path into the spec, e.g. `panels[3].rows[0].value`. */
  path: string;
  raw: string;
  value: number;
  kind: NumberKind;
  cmp?: string;
  /** The whole field value, so the author can see the claim in context. */
  context: string;
}

function derivedPercents(index: SourceIndex): Set<string> {
  const counts = index.tokens.filter((t) => t.kind === 'plain' && t.value > 0).map((t) => t.value);
  const out = new Set<string>();
  for (const n of counts) {
    for (const total of counts) {
      if (total <= n) continue;
      out.add(keyOf(Number(((n / total) * 100).toFixed(1))));
      out.add(keyOf(Math.round((n / total) * 100)));
    }
  }
  return out;
}

/**
 * Numbers in `fields` that the manuscript does not support. Fields come from
 * `collectSpecNumbers`, which knows which parts of a spec carry data and which are layout.
 */
export function checkGrounding(
  fields: readonly { path: string; text: string }[],
  index: SourceIndex,
  opts: GroundingOptions = {},
): UngroundedNumber[] {
  const derived = opts.allowDerivedPercent ? derivedPercents(index) : null;
  const out: UngroundedNumber[] = [];

  for (const field of fields) {
    for (const token of extractNumbers(field.text)) {
      const keys = token.values.map(keyOf);
      if (token.kind === 'pvalue') {
        // "p < 0.001" and "p = 0.001" are different claims; a figure must not upgrade one
        // to the other, so the comparator is part of the match.
        if (keys.some((k) => index.pvalues.has(`${token.cmp}:${k}`))) continue;
      } else if (token.kind === 'percent') {
        if (isConventionalConfidence(token, field.text)) continue;
        if (keys.some((k) => index.percent.has(k) || index.plain.has(k))) continue;
        if (derived && keys.some((k) => derived.has(k))) continue;
      } else {
        if (isConventionalConfidence(token, field.text)) continue;
        if (keys.some((k) => index.plain.has(k))) continue;
      }
      out.push({
        path: field.path,
        raw: token.raw,
        value: token.value,
        kind: token.kind,
        cmp: token.cmp,
        context: field.text.slice(0, 200),
      });
    }
  }

  // The same fabricated number repeated across panels is one problem, not several.
  const seen = new Set<string>();
  return out.filter((u) => {
    const k = `${u.path}|${u.raw}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
