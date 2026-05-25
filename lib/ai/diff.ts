// Word-level diff for AI rewrite previews.
// Returns an array of segments where each segment is unchanged, added, or removed.

import { diffWordsWithSpace, type Change } from 'diff';

export type DiffSegment = {
  type: 'same' | 'add' | 'remove';
  value: string;
};

export function diffWords(before: string, after: string): DiffSegment[] {
  const changes: Change[] = diffWordsWithSpace(before, after);
  return changes.map((c) => ({
    type: c.added ? 'add' : c.removed ? 'remove' : 'same',
    value: c.value,
  }));
}

// Cheap heuristic: returns 0..1 indicating how different two strings are.
// 1 = wholly different, 0 = identical.
export function diffRatio(before: string, after: string): number {
  if (before === after) return 0;
  const segs = diffWords(before, after);
  const changed = segs.filter((s) => s.type !== 'same').reduce((n, s) => n + s.value.length, 0);
  const total = before.length + after.length;
  return total === 0 ? 0 : Math.min(1, changed / total);
}
