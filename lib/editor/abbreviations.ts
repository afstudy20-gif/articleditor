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
  const cleanAcronym = acronym.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (!cleanAcronym) return false;

  // Split definition into words
  const words = definition
    .split(/[\s,-]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').toLowerCase())
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
  const cleanAcronym = acronym.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (!cleanAcronym) return null;

  const rawWords = precedingText.trim().split(/\s+/);
  if (rawWords.length > 0) {
    const lastWord = rawWords[rawWords.length - 1];
    const cleanLastWord = lastWord.replace(/[^A-Za-z0-9-]/g, '');
    if (isAcronymMatch(acronym, cleanLastWord)) {
      return cleanLastWord;
    }
  }

  const cleanWords = rawWords.map((w) => w.replace(/[^A-Za-z0-9]/g, '').toLowerCase());

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

  // Look for preceding text + (ACRONYM)
  const definitionRegex = /([A-Za-z0-9\s,-]{2,100})\s+\(([A-Za-z0-9-]{2,10})\)/g;
  let match;

  while ((match = definitionRegex.exec(text)) !== null) {
    const preceding = match[1];
    const acronym = match[2];

    // Filter out values without uppercase letters or starting with symbols
    if (!/[A-Z]/.test(acronym) || !/^[A-Za-z0-9]/.test(acronym)) {
      continue;
    }

    const definition = findExactDefinition(acronym, preceding);
    if (definition && !seenAcronyms.has(acronym.toUpperCase())) {
      seenAcronyms.add(acronym.toUpperCase());
      list.push({
        acronym,
        definition,
        count: 0
      });
    }
  }

  // Count acronym occurrences in text (case-sensitive)
  for (const item of list) {
    const escAcronym = escapeRegExp(item.acronym);
    const regex = new RegExp(`\\b${escAcronym}\\b`, 'g');
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
