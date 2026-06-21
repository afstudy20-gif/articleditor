import type { Editor } from '@tiptap/react';

export interface Abbreviation {
  acronym: string;
  definition: string;
  count: number;
}

export interface AbbrSuggestion {
  acronym: string;
  definition: string;
  textFound: string;
  index: number;
  from?: number;
  to?: number;
}

/** A single occurrence of an acronym in the document, as editor positions. */
export interface AbbrOccurrence {
  from: number;
  to: number;
}

export interface ScopedAbbreviation extends Abbreviation {
  occurrences: AbbrOccurrence[];
}

export type AbbrevScopeKind = 'abstract' | 'main' | 'table';

export interface AbbreviationScope {
  key: string; // 'abstract' | 'main' | 'table-1' …
  kind: AbbrevScopeKind;
  /** 1-based table number when kind === 'table'. */
  index?: number;
  abbreviations: ScopedAbbreviation[];
  suggestions: AbbrSuggestion[];
}

/** A run of text and the editor position where it starts. */
interface Piece {
  text: string;
  /** Editor (ProseMirror) position of the first character; -1 for separators. */
  pos: number;
}

/** A top-level document block, normalized for scope splitting. */
export interface DocBlock {
  isTable: boolean;
  isHeading: boolean;
  text: string;
  pieces: Piece[];
}

const SEPARATOR: Piece = { text: '\n', pos: -1 };

// Section-heading detection — drives the Abstract vs Main split.
const ABSTRACT_HEADING_RE = /^(abstract|öz|özet|summary|structured abstract)\b/i;
const REFERENCES_HEADING_RE = /^(references|bibliography|kaynaklar|kaynakça|referanslar|literatür)\b/i;
const SECTION_HEADING_RE =
  /^(introduction|background|methods?|materials?|patients?|results?|findings?|discussion|conclusions?|references?|bibliography|keywords?|acknowledg|funding|giri[şs]|y[öo]ntem|materyal|bulgular|tart[ıi][şs]ma|sonu[çc]|kaynak|anahtar)/i;

function blockRole(block: DocBlock): 'abstract' | 'break' | 'stop' | null {
  const text = block.text.trim();
  const looksHeading =
    block.isHeading || (text.length > 0 && text.length <= 60 && (ABSTRACT_HEADING_RE.test(text) || SECTION_HEADING_RE.test(text)));
  if (!looksHeading) return null;
  if (REFERENCES_HEADING_RE.test(text)) return 'stop';
  if (ABSTRACT_HEADING_RE.test(text)) return 'abstract';
  return 'break';
}

/**
 * Split document blocks into independent abbreviation scopes: the abstract is
 * tracked on its own, the main text on its own, and each table separately —
 * matching journal rules that abbreviations be (re)defined per section.
 */
export function splitScopes(blocks: DocBlock[]): {
  abstract: Piece[];
  main: Piece[];
  tables: Piece[][];
  sawAbstract: boolean;
} {
  const abstract: Piece[] = [];
  const main: Piece[] = [];
  const tables: Piece[][] = [];
  let scope: 'abstract' | 'main' | 'ignore' = 'main';
  let sawAbstract = false;

  for (const block of blocks) {
    if (scope === 'ignore') continue;
    if (block.isTable) {
      tables.push([...block.pieces, SEPARATOR]);
      continue;
    }
    const role = blockRole(block);
    if (role === 'abstract') {
      scope = 'abstract';
      sawAbstract = true;
    } else if (role === 'break') {
      scope = 'main';
    } else if (role === 'stop') {
      scope = 'ignore';
      continue;
    }
    const target = scope === 'abstract' ? abstract : main;
    for (const piece of block.pieces) target.push(piece);
    target.push(SEPARATOR);
  }

  return { abstract, main, tables, sawAbstract };
}

function assembleSegment(pieces: Piece[]): { text: string; map: Array<{ start: number; len: number; pos: number }> } {
  let text = '';
  const map: Array<{ start: number; len: number; pos: number }> = [];
  for (const piece of pieces) {
    map.push({ start: text.length, len: piece.text.length, pos: piece.pos });
    text += piece.text;
  }
  return { text, map };
}

function offsetToPos(map: Array<{ start: number; len: number; pos: number }>, offset: number): number | null {
  for (const entry of map) {
    if (entry.pos >= 0 && offset >= entry.start && offset < entry.start + entry.len) {
      return entry.pos + (offset - entry.start);
    }
  }
  return null;
}

function findOccurrences(text: string, map: ReturnType<typeof assembleSegment>['map'], acronym: string): AbbrOccurrence[] {
  const occurrences: AbbrOccurrence[] = [];
  const regex = buildAcronymRegex(acronym);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const from = offsetToPos(map, match.index);
    if (from !== null) occurrences.push({ from, to: from + acronym.length });
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return occurrences;
}

function buildScope(key: string, kind: AbbrevScopeKind, index: number | undefined, pieces: Piece[]): AbbreviationScope {
  const { text, map } = assembleSegment(pieces);
  const abbreviations = extractAbbreviations(text).map((abbr): ScopedAbbreviation => {
    const occurrences = findOccurrences(text, map, abbr.acronym);
    return { ...abbr, count: occurrences.length, occurrences };
  });
  const suggestions = findSuggestions(text, abbreviations).map((suggestion): AbbrSuggestion => {
    const from = offsetToPos(map, suggestion.index);
    return from === null
      ? suggestion
      : { ...suggestion, from, to: from + suggestion.textFound.length };
  });
  return { key, kind, index, abbreviations, suggestions };
}

/** Normalize a TipTap doc into top-level blocks with absolute text positions. */
function docToBlocks(doc: any): DocBlock[] {
  const blocks: DocBlock[] = [];
  doc.forEach((node: any, offset: number) => {
    const pieces: Piece[] = [];
    if (node.isText && node.text) {
      pieces.push({ text: node.text, pos: offset });
    } else {
      node.descendants((child: any, rel: number) => {
        if (child.isText && child.text) pieces.push({ text: child.text, pos: offset + 1 + rel });
      });
    }
    blocks.push({
      isTable: node.type?.name === 'table',
      isHeading: node.type?.name === 'heading',
      text: node.textContent ?? '',
      pieces,
    });
  });
  return blocks;
}

/** Pure core: turn normalized blocks into scoped abbreviation results. */
export function analyzeBlocks(blocks: DocBlock[]): AbbreviationScope[] {
  const { abstract, main, tables, sawAbstract } = splitScopes(blocks);
  const scopes: AbbreviationScope[] = [];
  if (sawAbstract) scopes.push(buildScope('abstract', 'abstract', undefined, abstract));
  scopes.push(buildScope('main', 'main', undefined, main));
  tables.forEach((pieces, i) => {
    const scope = buildScope(`table-${i + 1}`, 'table', i + 1, pieces);
    if (scope.abbreviations.length > 0 || scope.suggestions.length > 0) scopes.push(scope);
  });
  return scopes;
}

/**
 * Analyze the editor and return abbreviations grouped by scope (Abstract,
 * Main Text, each Table). Each abbreviation carries the editor positions of
 * every occurrence so the UI can jump through them in order.
 */
export function analyzeAbbreviations(editor: Editor): AbbreviationScope[] {
  if (!editor || editor.isDestroyed) return [];
  return analyzeBlocks(docToBlocks(editor.state.doc));
}

/**
 * Lowercase a string for case-insensitive comparison while handling Turkish
 * dotted/dotless i (İ→i, I→ı) so that "İSS" and "iss" compare equal to the
 * initial letters of "ilaç salınımlı stent".
 */
function toLowerTurkish(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase();
}

/**
 * Normalize Turkish letters to their ASCII base letter so that acronym-to-word
 * matching works across scripts: "ÇMS" → "CMS", "çıplak" → "ciplak". This lets
 * the initial-letter heuristics treat "Ç" as the initial of "çıplak".
 */
function normalizeTurkish(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C');
}

/**
 * Word-boundary fragments that treat Turkish letters as word characters.
 * Plain `\b` does not recognize Ç/İ/Ş/ü etc. as word chars in JS, so a
 * lookaround against this set is used instead.
 */
const WORD_BOUNDARY_LOOKAROUND = {
  before: '(?<![A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9])',
  after: '(?![A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9])',
};

/**
 * Build a regex that matches the acronym with Unicode-aware word boundaries so
 * Turkish letters (Ç, İ, Ş, …) and typographic apostrophes ('') don't defeat
 * detection of occurrences like "ÇMS'ye" or "İSS'nin".
 */
function buildAcronymRegex(acronym: string, flags = 'g'): RegExp {
  const esc = escapeRegExp(acronym);
  return new RegExp(`${WORD_BOUNDARY_LOOKAROUND.before}${esc}${WORD_BOUNDARY_LOOKAROUND.after}`, flags);
}

/**
 * Escapes characters for safe regular expression matching
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if the acronym matches the definition using several academic heuristics:
 * 1. Initial letters of words.
 * 2. Initial letters of words ignoring stopwords.
 * 3. In-order letter mapping inside a single word (syllables match).
 */
export function isAcronymMatch(acronym: string, definition: string): boolean {
  const cleanAcronym = toLowerTurkish(normalizeTurkish(acronym.replace(/[^A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9]/g, '')));
  if (!cleanAcronym) return false;

  // Split definition into words
  const words = definition
    .split(/[\s,-]+/)
    .map((w) => toLowerTurkish(normalizeTurkish(w.replace(/[^A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9]/g, ''))))
    .filter(Boolean);

  if (words.length === 0) return false;

  // Heuristic 1: First letters of words (e.g. "Deep Neural Network" -> "dnn")
  const firstLetters = words.map((w) => w[0]).join('');
  if (firstLetters.includes(cleanAcronym)) {
    return true;
  }

  // Heuristic 2: First letters of words ignoring stopwords
  const stopwords = new Set(['of', 'the', 'and', 'a', 'in', 'for', 'on', 'with', 'by', 'to', 'at', 'from', 'as']);
  const filteredWords = words.filter((w) => !stopwords.has(w));
  const filteredFirstLetters = filteredWords.map((w) => w[0]).join('');
  if (filteredFirstLetters === cleanAcronym || filteredFirstLetters.includes(cleanAcronym)) {
    return true;
  }

  // Heuristic 3: Check if acronym letters appear in order inside words (e.g. "electroencephalogram" -> "eeg")
  if (words.length === 1 && words[0].startsWith(cleanAcronym[0])) {
    let strIdx = 0;
    const word = words[0];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === cleanAcronym[strIdx]) {
        strIdx++;
        if (strIdx === cleanAcronym.length) {
          return true;
        }
      }
    }
  }

  // Heuristic 4: Sequence mapping across multiple words (in-order letter matching)
  let wordIdx = 0;
  let charIdx = 0;
  while (wordIdx < words.length && charIdx < cleanAcronym.length) {
    const word = words[wordIdx];
    const char = cleanAcronym[charIdx];
    if (word.startsWith(char)) {
      charIdx++;
    }
    wordIdx++;
  }
  if (charIdx === cleanAcronym.length) return true;

  return false;
}

/**
 * Finds the exact matching words for the acronym definition in the preceding text by walking backwards.
 */
export function findExactDefinition(acronym: string, precedingText: string): string | null {
  const cleanAcronym = toLowerTurkish(normalizeTurkish(acronym.replace(/[^A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9]/g, '')));
  if (!cleanAcronym) return null;

  const rawWords = precedingText.trim().split(/\s+/);
  if (rawWords.length > 0) {
    const lastWord = rawWords[rawWords.length - 1];
    const cleanLastWord = lastWord.replace(/[^A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9-]/g, '');
    if (isAcronymMatch(acronym, cleanLastWord)) {
      return cleanLastWord;
    }
  }

  const cleanWords = rawWords.map((w) => toLowerTurkish(normalizeTurkish(w.replace(/[^A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9]/g, ''))));

  let acronymIdx = cleanAcronym.length - 1;
  let wordIdx = cleanWords.length - 1;
  const stopwords = new Set(['of', 'the', 'and', 'a', 'in', 'for', 'on', 'with', 'by', 'to', 'at', 'from', 'as']);

  const definitionWords: string[] = [];

  while (wordIdx >= 0 && acronymIdx >= 0) {
    const word = cleanWords[wordIdx];
    const rawWord = rawWords[wordIdx];
    if (word === '') {
      wordIdx--;
      continue;
    }

    if (stopwords.has(word) && definitionWords.length > 0) {
      definitionWords.unshift(rawWord);
      wordIdx--;
      continue;
    }

    const firstLetter = word[0];
    if (firstLetter === cleanAcronym[acronymIdx]) {
      definitionWords.unshift(rawWord);
      acronymIdx--;
    } else {
      if (definitionWords.length === 0) {
        // Skip leading words
      } else {
        break; // Mismatch inside definition
      }
    }
    wordIdx--;
  }

  if (acronymIdx < 0 && definitionWords.length > 0) {
    return definitionWords.join(' ');
  }

  // Fallback: Check last L words directly
  if (rawWords.length >= cleanAcronym.length) {
    const fallbackWords = rawWords.slice(-cleanAcronym.length);
    const fallbackDef = fallbackWords.join(' ');
    if (isAcronymMatch(acronym, fallbackDef)) {
      return fallbackDef;
    }
  }

  return null;
}

/**
 * Scans document text, extracts defined abbreviations, and counts their occurrences.
 */
export function extractAbbreviations(text: string): Abbreviation[] {
  const list: Abbreviation[] = [];
  const seenAcronyms = new Set<string>();

  // Look for preceding text + (ACRONYM). The character classes include Turkish
  // letters (çğıöşüÇĞİÖŞÜ) so definitions like "çıplak metal stent (ÇMS)" and
  // acronyms like "ÇMS"/"İSS"/"ÖBS" are captured, not just ASCII.
  const definitionRegex = /([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9\s,-]{2,100})\s+\(([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9-]{2,10})\)/g;
  let match;

  while ((match = definitionRegex.exec(text)) !== null) {
    const preceding = match[1];
    const acronym = match[2];

    // Filter out values without uppercase letters or starting with symbols
    if (!/[A-ZÇĞİÖŞÜ]/.test(acronym) || !/^[A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9]/.test(acronym)) {
      continue;
    }

    let definition = findExactDefinition(acronym, preceding);

    // Fallback: if no exact definition could be matched (common when the
    // acronym is English but the surrounding text is another language — e.g.
    // "kararsız anjina pektoris (USAP)"), trust the parenthetical signal: the
    // user wrote the acronym in parentheses right after its definition, so take
    // the last N content words preceding it (N = acronym letter count) as the
    // definition. This avoids dropping the abbreviation entirely.
    if (!definition) {
      const cleanLen = acronym.replace(/[^A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü0-9]/g, '').length;
      // Strip earlier parenthetical tokens and list punctuation so a run of
      // "X (A), Y (B), Z (C)" yields "Z" only as the fallback definition window.
      const window = preceding
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[;,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const words = window.split(' ').filter(Boolean);
      if (cleanLen >= 2 && cleanLen <= 6 && words.length >= 2) {
        // Take up to cleanLen words, but never more than are available. Composite
        // acronyms like NSTEMI (Non-ST-Elevation MI) often map to fewer words
        // than letters, so clamp rather than reject.
        const take = Math.min(cleanLen, words.length);
        definition = words.slice(-take).join(' ');
      }
    }

    if (definition && !seenAcronyms.has(acronym.toUpperCase())) {
      seenAcronyms.add(acronym.toUpperCase());
      list.push({
        acronym,
        definition,
        count: 0
      });
    }
  }

  // Count acronym occurrences in text (case-sensitive), with Unicode-aware
  // word boundaries so Turkish letters and typographic apostrophes are handled.
  for (const item of list) {
    const regex = buildAcronymRegex(item.acronym);
    const matches = text.match(regex);
    item.count = matches ? matches.length : 0;
  }

  return list;
}

/**
 * Identifies instances where the full definition is used instead of its acronym.
 * It ignores definitions followed by the acronym in parentheses (the first definition).
 */
export function findSuggestions(text: string, abbreviations: Abbreviation[]): AbbrSuggestion[] {
  const suggestions: AbbrSuggestion[] = [];

  for (const abbr of abbreviations) {
    const escDef = escapeRegExp(abbr.definition);
    // Find definition matches
    const regex = new RegExp(`\\b${escDef}\\b`, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const textAfter = text.substring(matchIndex + match[0].length);

      // Check if followed by "(ACRONYM)"
      const followedByAcronym = new RegExp(`^\\s*\\(\\s*${escapeRegExp(abbr.acronym)}\\s*\\)`, 'i');
      if (followedByAcronym.test(textAfter)) {
        continue; // This is the definition itself
      }

      suggestions.push({
        acronym: abbr.acronym,
        definition: abbr.definition,
        textFound: match[0],
        index: matchIndex
      });
    }
  }

  return suggestions;
}

/**
 * Checks whether a match position in the document is the defining occurrence,
 * i.e. the full term is immediately followed by "(ACRONYM)".
 */
function isDefiningOccurrence(doc: any, matchTo: number, acronym: string): boolean {
  // Collect up to 30 characters after the match to check for "(ACRONYM)"
  let textAfter = '';
  const maxScan = matchTo + acronym.length + 10; // enough for " (ACRONYM)"
  doc.nodesBetween(matchTo, Math.min(doc.content.size, maxScan), (node: any, pos: number) => {
    if (node.isText && node.text) {
      const start = Math.max(0, matchTo - pos);
      textAfter += node.text.slice(start);
    }
  });
  const pattern = new RegExp(`^\\s*\\(\\s*${escapeRegExp(acronym)}\\s*\\)`, 'i');
  return pattern.test(textAfter);
}

/**
 * Replaces full definition occurrences with the acronym inside the TipTap editor.
 * Skips the defining occurrence (where the full term is followed by "(ACRONYM)").
 * Replaces all non-defining occurrences when replaceAll is true.
 */
export function replaceTextInEditor(
  editor: Editor,
  searchText: string,
  replaceText: string,
  replaceAll = false
): void {
  if (!editor || editor.isDestroyed) return;

  const allMatches: Array<{ from: number; to: number }> = [];

  // Traverse document to find matching text nodes
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const nodeText = node.text;
      let index = nodeText.toLowerCase().indexOf(searchText.toLowerCase());
      while (index !== -1) {
        allMatches.push({
          from: pos + index,
          to: pos + index + searchText.length
        });
        index = nodeText.toLowerCase().indexOf(searchText.toLowerCase(), index + 1);
      }
    }
  });

  if (allMatches.length === 0) return;

  // Filter out the defining occurrence (full term followed by "(ACRONYM)")
  const matches = allMatches.filter(
    (m) => !isDefiningOccurrence(editor.state.doc, m.to, replaceText)
  );

  if (matches.length === 0) return;

  if (replaceAll) {
    // Sort backwards to prevent indices shifting during execution
    const sorted = [...matches].sort((a, b) => b.from - a.from);
    editor
      .chain()
      .focus()
      .command(({ tr }: any) => {
        for (const m of sorted) {
          tr.replaceWith(m.from, m.to, editor.schema.text(replaceText));
        }
        return true;
      })
      .run();
  } else {
    // Replace the first non-defining match
    const m = matches[0];
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).insertContent(replaceText).run();
  }
}
