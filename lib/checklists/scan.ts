/**
 * Heuristic checklist scanner. For each guideline item it tells whether the
 * manuscript text *appears* to address it, based purely on keyword presence.
 * This is a hint to speed up self-assessment — it never asserts compliance and
 * the author confirms each item manually in the panel.
 */

import type { Guideline, ChecklistItem } from './guidelines';

export type AutoStatus = 'likely' | 'missing';

export interface ScanResult {
  /** itemId -> heuristic status. */
  status: Record<string, AutoStatus>;
  likelyCount: number;
  total: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/i̇/g, 'i') // dotted-İ lowercase artifact
    .normalize('NFC');
}

function itemLikely(item: ChecklistItem, haystack: string): boolean {
  return item.keywords.some((kw) => kw.length > 0 && haystack.includes(normalize(kw)));
}

export function scanChecklist(plainText: string, guideline: Guideline): ScanResult {
  const haystack = normalize(plainText ?? '');
  const status: Record<string, AutoStatus> = {};
  let likelyCount = 0;
  for (const item of guideline.items) {
    const likely = haystack.length > 0 && itemLikely(item, haystack);
    status[item.id] = likely ? 'likely' : 'missing';
    if (likely) likelyCount++;
  }
  return { status, likelyCount, total: guideline.items.length };
}

export type ItemDecision = 'addressed' | 'na' | 'pending';

export interface ChecklistState {
  /** itemId -> author decision. */
  decisions: Record<string, ItemDecision>;
  /** itemId -> page / section locator note. */
  locations: Record<string, string>;
}

export interface ExportOptions {
  lang: 'tr' | 'en';
  manuscriptTitle?: string;
}

/** Render the completed checklist as a plain-text table for submission. */
export function checklistToText(
  guideline: Guideline,
  state: ChecklistState,
  options: ExportOptions,
): string {
  const tr = options.lang === 'tr';
  const decisionLabel: Record<ItemDecision, string> = tr
    ? { addressed: 'Evet', na: 'Uygulanamaz', pending: '—' }
    : { addressed: 'Yes', na: 'N/A', pending: '—' };

  const lines: string[] = [];
  lines.push(`${guideline.name} — ${tr ? 'Raporlama Kontrol Listesi' : 'Reporting Checklist'}`);
  if (options.manuscriptTitle?.trim()) {
    lines.push(`${tr ? 'Makale' : 'Manuscript'}: ${options.manuscriptTitle.trim()}`);
  }
  lines.push('');

  const sectionLabel = (key: string): string => {
    const s = guideline.sections.find((sec) => sec.key === key);
    return s ? (tr ? s.tr : s.en) : key;
  };

  let lastSection = '';
  for (const item of guideline.items) {
    if (item.section !== lastSection) {
      lines.push(`## ${sectionLabel(item.section)}`);
      lastSection = item.section;
    }
    const decision = state.decisions[item.id] ?? 'pending';
    const loc = (state.locations[item.id] ?? '').trim();
    const text = tr ? item.tr : item.en;
    const locPart = loc ? ` · ${tr ? 'Yer' : 'Loc'}: ${loc}` : '';
    lines.push(`${item.id}\t[${decisionLabel[decision]}]${locPart}\t${text}`);
  }
  return lines.join('\n');
}
