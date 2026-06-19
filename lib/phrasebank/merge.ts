import type { Phrase, PhraseCategory } from '@/store/types';
import { newId } from '@/lib/id';

/**
 * Normalize a category name for matching: lowercase, collapse whitespace,
 * trim. Two categories that differ only in case or spacing are treated as the
 * same category when merging (e.g. "Introducing Work" vs "introducing  work").
 */
export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Smart-merge two phrasebank category lists into one.
 *
 * Categories with matching names (case/space-insensitive) are combined: their
 * phrases are concatenated and de-duplicated by text (case-insensitive), with
 * the base list's phrases kept first. Categories unique to either side are
 * appended in their original order — base categories first, then incoming ones.
 *
 * Pure and total: never mutates its inputs, tolerates empty/undefined.
 */
export function mergeCategories(
  base: readonly PhraseCategory[] | undefined,
  incoming: readonly PhraseCategory[] | undefined,
): PhraseCategory[] {
  const safeBase = base ?? [];
  const safeIncoming = incoming ?? [];

  const byKey = new Map<string, PhraseCategory>();
  const order: string[] = [];

  const keyOf = (name: string): string => normalizeCategoryName(name);

  const ingest = (category: PhraseCategory, atFront: boolean): void => {
    const key = keyOf(category.name);
    const existing = byKey.get(key);
    if (existing) {
      existing.phrases = mergePhrases(existing.phrases, category.phrases);
      return;
    }
    // Clone so callers' objects are never mutated.
    const clone: PhraseCategory = {
      id: category.id || newId('pcat'),
      name: category.name,
      phrases: category.phrases.map((p) => ({ ...p })),
    };
    byKey.set(key, clone);
    if (atFront) order.unshift(key);
    else order.push(key);
  };

  // Base categories first (kept in order), then incoming ones merged on top.
  for (const category of safeBase) ingest(category, false);
  for (const category of safeIncoming) ingest(category, false);

  return order.map((key) => byKey.get(key)!);
}

/**
 * Concatenate two phrase lists, dropping duplicate text (case-insensitive).
 * Order is preserved: base phrases first, then incoming phrases that are not
 * already present. Tags from the base phrase are kept when a collision happens.
 */
export function mergePhrases(
  base: readonly Phrase[] | undefined,
  incoming: readonly Phrase[] | undefined,
): Phrase[] {
  const out: Phrase[] = [];
  const seen = new Set<string>();
  const push = (phrase: Phrase): void => {
    const key = phrase.text.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...phrase });
  };
  for (const phrase of base ?? []) push(phrase);
  for (const phrase of incoming ?? []) push(phrase);
  return out;
}
