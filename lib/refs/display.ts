/** Small, UI-facing display formatters shared by citation popovers/hover cards. */

import type { Ref } from '@/store/types';

/** "Family, Given; Family2, Given2" — falls back to literal names, then "—". */
export function authorList(r: Pick<Ref, 'authors'>, fallback = '—'): string {
  const names = (r.authors ?? [])
    .map((a) => a.literal || [a.family, a.given].filter(Boolean).join(', '))
    .filter(Boolean);
  return names.length > 0 ? names.join('; ') : fallback;
}

/** "Journal Name, 12(3), 45-67" — falls back to "—" when nothing is known. */
export function journalLine(r: Pick<Ref, 'containerTitle' | 'volume' | 'issue' | 'pages'>, fallback = '—'): string {
  const volumeIssue = [r.volume, r.issue ? `(${r.issue})` : ''].filter(Boolean).join('');
  const parts = [r.containerTitle, volumeIssue, r.pages].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : fallback;
}
