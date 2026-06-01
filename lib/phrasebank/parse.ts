import { newId } from '@/lib/id';
import type { Phrase, PhraseCategory } from '@/store/types';

type CategoryRule = {
  name: string;
  patterns: RegExp[];
  tags: string[];
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    name: 'Introducing Work',
    patterns: [/introduc/i, /background/i, /rationale/i, /aims?/i, /objectives?/i, /purpose/i],
    tags: ['introduction'],
  },
  {
    name: 'Being Cautious',
    patterns: [/cautious/i, /hedg/i, /tentative/i, /limitations?/i, /uncertain/i],
    tags: ['caution', 'discussion'],
  },
  {
    name: 'Describing Methods',
    patterns: [/methods?/i, /materials?/i, /procedures?/i, /participants?/i, /sampling/i, /analysis/i],
    tags: ['methods'],
  },
  {
    name: 'Reporting Results',
    patterns: [/results?/i, /findings?/i, /observations?/i, /outcomes?/i],
    tags: ['results'],
  },
  {
    name: 'Discussing Findings',
    patterns: [/discussion/i, /interpret/i, /implications?/i, /explain/i, /significance/i],
    tags: ['discussion'],
  },
  {
    name: 'Signalling Transition',
    patterns: [/transition/i, /sequence/i, /contrast/i, /addition/i, /linking/i, /signpost/i],
    tags: ['transition'],
  },
  {
    name: 'Comparing and Contrasting',
    patterns: [/compar/i, /contrast/i, /similar/i, /different/i],
    tags: ['comparison'],
  },
  {
    name: 'Concluding',
    patterns: [/conclu/i, /summar/i, /recommend/i, /future/i],
    tags: ['conclusion'],
  },
];

const MAJOR_SECTIONS = [
  'Introducing Work',
  'Referring to Sources',
  'Describing Methods',
  'Reporting Results',
  'Discussing Findings',
  'Writing Conclusions',
  'Being Critical',
  'Being Cautious',
  'Classifying and Listing',
  'Compare and Contrast',
  'Comparing and Contrasting',
  'Defining Terms',
  'Describing Trends',
  'Describing Quantities',
  'Explaining Causality',
  'Giving Examples',
  'Signalling Transition',
  'Writing about the Past',
];

const FUNCTIONAL_HEADING_START = /^(Establishing|Outlining|Identifying|Stating|Giving|Explaining|Defining|Indicating|Reporting|Describing|Comparing|Contrasting|Summarising|Summarizing|Highlighting|Being|Referring|Showing|Presenting|Commenting|Drawing|Making|Moving|Providing|Introducing|Listing|Expressing|Specifying|Evaluating|Reviewing|Offering|Acknowledging|Using|Noting)\b/;
const SHORT_NON_HEADINGS = new Set([
  'and',
  'as',
  'but',
  'however',
  'or',
  'then',
  'therefore',
  'while',
  'yet',
]);

const STARTER_TAGS: Array<[RegExp, string]> = [
  [/\b(this paper|this study|the aim|the purpose|we report|we present)\b/i, 'introduction'],
  [/\b(method|sample|participants|data were|analysis was|measured|performed)\b/i, 'methods'],
  [/\b(results|findings|showed|revealed|observed|increased|decreased)\b/i, 'results'],
  [/\b(suggest|indicat|may|might|could|possible|likely|appears?)\b/i, 'caution'],
  [/\b(however|therefore|moreover|in contrast|nevertheless|furthermore)\b/i, 'transition'],
  [/\b(in conclusion|overall|taken together|future research)\b/i, 'conclusion'],
];

function cleanLine(line: string): string {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[\s•·*‣◦-]+/, '')
    .replace(/^\(?[0-9ivxlcdmIVXLCDM]+[.)]\s+/, '')
    .trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
    .replace(/\b(and|or|of|for|to|in|the|a|an)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (ch) => ch.toUpperCase());
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function isPageNoise(line: string): boolean {
  return (
    /^[0-9]+$/.test(line) ||
    /^[0-9]+\s*\|\s*P\s*a\s*g\s*e$/i.test(line) ||
    /^page\s+[0-9]+/i.test(line) ||
    /^https?:\/\//i.test(line) ||
    /^www\./i.test(line) ||
    /academic phrasebank/i.test(line) ||
    /copyright|all rights reserved/i.test(line)
  );
}

function majorSectionName(line: string): string | null {
  const normalized = line.replace(/[:—-]+$/g, '').replace(/\s+/g, ' ').trim();
  const match = MAJOR_SECTIONS.find((name) => name.toLowerCase() === normalized.toLowerCase());
  return match ?? null;
}

function knownCategory(line: string): CategoryRule | null {
  const normalized = line.replace(/[:—-]+$/g, '').trim();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((rx) => rx.test(normalized))) return rule;
  }
  return null;
}

function looksLikeHeading(line: string): boolean {
  const words = wordCount(line);
  if (words === 0 || words > 9 || line.length > 80) return false;
  if (SHORT_NON_HEADINGS.has(line.toLowerCase())) return false;
  if (words < 2 && !majorSectionName(line)) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/[,;]$/.test(line)) return false;
  if (majorSectionName(line)) return true;
  if (words >= 3 && FUNCTIONAL_HEADING_START.test(line)) return true;
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  const uppercase = letters.replace(/[^A-Z]/g, '').length / letters.length;
  const titleish = line
    .split(/\s+/)
    .filter((w) => /^[A-Z][A-Za-z-]+/.test(w)).length;
  return uppercase > 0.65 || titleish >= Math.max(1, Math.ceil(words * 0.6));
}

function categoryTags(name: string): string[] {
  const rule = CATEGORY_RULES.find((r) => r.name === name);
  return rule?.tags ?? [];
}

function phraseTags(text: string, category: string): string[] {
  const tags = new Set(categoryTags(category));
  for (const [rx, tag] of STARTER_TAGS) {
    if (rx.test(text)) tags.add(tag);
  }
  return Array.from(tags);
}

function splitPhraseLine(line: string): string[] {
  if (line.length <= 220) return [line];
  return line
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPhraseCandidate(text: string): boolean {
  if (text.length < 12 || text.length > 360) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (isPageNoise(text)) return false;
  if (looksLikeHeading(text)) return false;
  if (/^(there are many ways|most academic writers|examples of phrases|note that|the following pages|a number of analysts|one of the best known|this model|establishing the territory|occupying the niche)/i.test(text)) {
    return false;
  }
  return wordCount(text) >= 3;
}

export function parsePhrasebankText(text: string): PhraseCategory[] {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0 && !isPageNoise(line));

  const byCategory = new Map<string, Phrase[]>();
  let currentCategory = 'General';
  let majorSection: string | null = null;
  let acceptingPhrases = true;

  function ensureCategory(name: string): Phrase[] {
    const cleanName = name.trim() || 'General';
    const existing = byCategory.get(cleanName);
    if (existing) return existing;
    const list: Phrase[] = [];
    byCategory.set(cleanName, list);
    return list;
  }

  for (const line of lines) {
    const major = majorSectionName(line);
    if (major) {
      majorSection = major;
      currentCategory = major;
      acceptingPhrases = false;
      continue;
    }
    if (looksLikeHeading(line)) {
      const heading = titleCase(line.replace(/[:—-]+$/g, ''));
      currentCategory = majorSection ? `${majorSection}: ${heading}` : heading;
      ensureCategory(currentCategory);
      acceptingPhrases = true;
      continue;
    }
    if (!acceptingPhrases) continue;

    for (const phraseText of splitPhraseLine(line)) {
      if (!isPhraseCandidate(phraseText)) continue;
      const list = ensureCategory(currentCategory);
      const duplicate = list.some((p) => p.text.toLowerCase() === phraseText.toLowerCase());
      if (duplicate) continue;
      list.push({
        id: newId('phrase'),
        text: phraseText,
        category: currentCategory,
        tags: phraseTags(phraseText, currentCategory),
      });
    }
  }

  return Array.from(byCategory.entries())
    .map(([name, phrases]) => ({
      id: newId('pcat'),
      name,
      phrases,
    }))
    .filter((cat) => cat.phrases.length > 0);
}

export function countPhrases(categories: PhraseCategory[]): number {
  return categories.reduce((sum, cat) => sum + cat.phrases.length, 0);
}
