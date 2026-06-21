import nspell from 'nspell';
import type { Editor } from '@tiptap/react';

export type SpellLang = 'en' | 'tr';

export type SpellIssueCode = 'misspelling';

export interface SpellIssue {
  code: SpellIssueCode;
  severity: 'low' | 'med' | 'high';
  quote: string;
  start: number;
  end: number;
  message: { tr: string; en: string };
  suggestions: string[];
}

export interface Token {
  word: string;
  start: number;
  end: number;
}

/** Map logical language to the bundled dictionary file names in /public/dictionaries. */
const DICT_FILES: Record<SpellLang, { aff: string; dic: string }> = {
  en: { aff: '/dictionaries/en-US.aff', dic: '/dictionaries/en-US.dic' },
  tr: { aff: '/dictionaries/tr.aff', dic: '/dictionaries/tr.dic' },
};

/**
 * Extract words with their character offsets. Letters of all scripts (including
 * Turkish Ç/İ/Ş/ü…) form words; everything else is a separator. Pure-number
 * runs, standalone punctuation, URLs and emails are skipped.
 *
 * Token offsets are absolute into the input text, mirroring how
 * scanMedicalStatistics reports `start`/`end`.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // Letter runs of any script: Latin-1 supplement covers most accented letters;
  // the explicit Turkish set + \u0300-\u036f (combining marks) is a belt-and-braces
  // guarantee for dotted/dotless i and combining diacritics.
  const re = /[\p{L}\u0300-\u036f]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    // Skip pure acronyms-with-dots handled elsewhere and single letters that are
    // almost always initials (keep 2+ letter runs to reduce noise).
    if (word.length < 2) continue;
    tokens.push({ word, start: m.index, end: m.index + word.length });
  }
  return tokens;
}

/** Skip tokens that look like numbers, URLs, emails or file paths when checked
 *  in isolation — nspell handles pure-letter words, so this is mostly a guard. */
function isLikelyNoise(word: string): boolean {
  // Single character or empty
  if (word.length < 2) return true;
  // All-caps run of 2-4 letters is almost always an acronym (USA, MRI, NSTEMI);
  // flagging these as misspelled creates excessive false positives.
  if (/^[A-ZÇĞİÖŞÜ]{2,4}$/.test(word)) return true;
  return false;
}

/**
 * Thin wrapper around an nspell instance for a single language. Provides
 * `check(text)` returning issues and `suggest(word)` for replacements.
 */
export class SpellChecker {
  private readonly spell: ReturnType<typeof nspell>;
  private readonly ignored: Set<string> = new Set();

  constructor(spell: ReturnType<typeof nspell>) {
    this.spell = spell;
  }

  /** Mark a word as correct for the lifetime of this checker (user "Ignore"). */
  ignore(word: string): void {
    this.ignored.add(word);
    this.spell.add(word);
  }

  suggest(word: string): string[] {
    return this.spell.suggest(word);
  }

  /** True if the word is spelled correctly or has been ignored by the user. */
  isCorrect(word: string): boolean {
    const lower = word.toLowerCase();
    return this.spell.correct(word) || this.spell.correct(lower);
  }

  /** True if the word has been ignored by the user. */
  isKnown(word: string): boolean {
    return this.ignored.has(word);
  }

  /** Scan text and return one issue per misspelled token. */
  check(text: string): SpellIssue[] {
    const tokens = tokenize(text);
    const issues: SpellIssue[] = [];
    for (const { word, start, end } of tokens) {
      if (isLikelyNoise(word) || this.ignored.has(word)) continue;
      if (this.isCorrect(word)) continue;
      const suggestions = this.spell.suggest(word);
      issues.push({
        code: 'misspelling',
        severity: 'low',
        quote: word,
        start,
        end,
        message: {
          tr: `"${word}" sözlükte bulunamadı.`,
          en: `"${word}" was not found in the dictionary.`,
        },
        suggestions,
      });
    }
    return issues;
  }
}

/**
 * Scan a TipTap/ProseMirror editor directly, emitting issues whose `start`/`end`
 * are ProseMirror document positions (not flat-text offsets) so the UI can
 * select/replace via editor.chain().setTextSelection({from, to}).
 *
 * Walks `editor.state.doc` text nodes, accumulating the running position and
 * reusing the same per-word logic as `check()`. Skips code blocks, image alts
 * and other non-prose content.
 */
export function checkEditor(checker: SpellChecker, editor: Editor): SpellIssue[] {
  const issues: SpellIssue[] = [];
  const wordRe = /[\p{L}\u0300-\u036f]+/gu;
  let m: RegExpExecArray | null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    // Skip text inside code/citation nodes (e.g. inline code, bibliography).
    const marks = node.marks ?? [];
    if (marks.some((mk) => mk.type.name === 'code' || mk.type.name === 'citation')) return false;
    const text = node.text ?? '';
    wordRe.lastIndex = 0;
    while ((m = wordRe.exec(text)) !== null) {
      const word = m[0];
      if (word.length < 2) continue;
      const from = pos + m.index;
      const to = from + word.length;
      if (isLikelyNoise(word) || checker.isKnown(word)) continue;
      if (checker.isCorrect(word)) continue;
      issues.push({
        code: 'misspelling',
        severity: 'low',
        quote: word,
        start: from,
        end: to,
        message: {
          tr: `"${word}" sözlükte bulunamadı.`,
          en: `"${word}" was not found in the dictionary.`,
        },
        suggestions: checker.suggest(word),
      });
    }
    return true;
  });

  return issues;
}

// Module-level cache: a checker per language, created once and reused.
const cache = new Map<SpellLang, Promise<SpellChecker>>();

/**
 * Load (and cache) a SpellChecker for the given language by fetching the
 * bundled Hunspell `.aff`/`.dic` files from /public/dictionaries. The first
 * call for a language pays the fetch cost; subsequent calls return the cached
 * promise. Follows the same pattern as the phrasebank asset load.
 */
export function loadDictionary(lang: SpellLang): Promise<SpellChecker> {
  const existing = cache.get(lang);
  if (existing) return existing;
  const promise = (async (): Promise<SpellChecker> => {
    const { aff, dic } = DICT_FILES[lang];
    const [affRes, dicRes] = await Promise.all([fetch(aff), fetch(dic)]);
    if (!affRes.ok || !dicRes.ok) {
      throw new Error(`Failed to load ${lang} dictionary (aff=${affRes.status}, dic=${dicRes.status})`);
    }
    const [affText, dicText] = await Promise.all([affRes.text(), dicRes.text()]);
    const spell = nspell({ aff: affText, dic: dicText });
    return new SpellChecker(spell);
  })();
  cache.set(lang, promise);
  return promise;
}

/** Test helper: build a checker from in-memory aff/dic strings (no fetch). */
export function createCheckerFromBuffers(aff: string, dic: string): SpellChecker {
  return new SpellChecker(nspell({ aff, dic }));
}
