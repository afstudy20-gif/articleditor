import type { Ref } from '@/store/types';

export function normalizeDoi(doi?: string): string {
  return (doi ?? '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)\]\s]+$/g, '')
    .toLowerCase();
}

export function normalizePmid(pmid?: string): string {
  return (pmid ?? '')
    .trim()
    .replace(/^pmid:\s*/i, '')
    .replace(/\D+/g, '');
}

export function normalizeRefTitle(title?: string): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[“”"'.:;,\-–—()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findMatchingRef(refs: readonly Ref[], candidate: Ref): Ref | undefined {
  const doi = normalizeDoi(candidate.doi);
  if (doi) {
    const match = refs.find((ref) => normalizeDoi(ref.doi) === doi);
    if (match) return match;
  }

  const pmid = normalizePmid(candidate.pmid);
  if (pmid) {
    const match = refs.find((ref) => normalizePmid(ref.pmid) === pmid);
    if (match) return match;
  }

  const title = normalizeRefTitle(candidate.title);
  if (title.length >= 20) {
    const match = refs.find((ref) =>
      normalizeRefTitle(ref.title) === title && yearsCompatible(ref.year, candidate.year),
    );
    if (match) return match;
  }

  return undefined;
}

export function appendUniqueRefs(
  refs: readonly Ref[],
  incoming: readonly Ref[],
): { refs: Ref[]; added: Ref[]; duplicates: Array<{ incoming: Ref; existing: Ref }> } {
  const out = [...refs];
  const added: Ref[] = [];
  const duplicates: Array<{ incoming: Ref; existing: Ref }> = [];

  for (const ref of incoming) {
    const existing = findMatchingRef(out, ref);
    if (existing) {
      duplicates.push({ incoming: ref, existing });
      continue;
    }
    out.push(ref);
    added.push(ref);
  }

  return { refs: out, added, duplicates };
}

function yearsCompatible(a?: number, b?: number): boolean {
  return a === undefined || b === undefined || a === b;
}
