import type { Author, Ref } from '@/store/types';

export function refsToOrderedDoiList(refs: Ref[]): string {
  return refs
    .map((ref) => cleanDoi(ref.doi))
    .filter((doi): doi is string => Boolean(doi))
    .join('\n');
}

export function refsToFullAuthorJournalList(refs: Ref[]): string {
  return refs
    .map(formatFullAuthorJournalRef)
    .filter(Boolean)
    .join('\n');
}

export function formatFullAuthorJournalRef(ref: Ref): string {
  const parts: string[] = [];
  const authors = ref.authors.map(formatAuthor).filter(Boolean).join('; ');
  if (authors) parts.push(ensureTrailingPeriod(authors));
  if (ref.year) parts.push(`${ref.year}.`);

  const citationParts: string[] = [];
  if (ref.title) citationParts.push(`"${stripPeriod(ref.title)}"`);
  if (ref.containerTitle) citationParts.push(stripPeriod(ref.containerTitle));
  const volumeIssue = formatVolumeIssue(ref);
  if (volumeIssue) citationParts.push(volumeIssue);
  if (ref.pages) citationParts.push(stripPeriod(ref.pages));
  if (citationParts.length > 0) parts.push(`${citationParts.join(', ')}.`);

  const doi = cleanDoi(ref.doi);
  if (doi) parts.push(`doi:${doi}`);

  return parts.join(' ').replace(/\s+([,.;:])/g, '$1').trim();
}

function formatAuthor(author: Author): string {
  if (author.literal) return author.literal;
  const family = author.family?.trim() ?? '';
  const initials = initialsWithPeriods(author.given);
  if (family && initials) return `${family}, ${initials}`;
  return family || initials;
}

function initialsWithPeriods(given: string | undefined): string {
  if (!given) return '';
  return given
    .replace(/\./g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase())
    .filter(Boolean)
    .map((initial) => `${initial}.`)
    .join(' ');
}

function formatVolumeIssue(ref: Ref): string {
  if (!ref.volume && !ref.issue) return '';
  if (ref.volume && ref.issue) return `${ref.volume}(${ref.issue})`;
  return ref.volume ?? `(${ref.issue})`;
}

function cleanDoi(doi: string | undefined): string | undefined {
  const cleaned = doi
    ?.trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '');
  return cleaned || undefined;
}

function stripPeriod(value: string): string {
  return value.replace(/\.+$/, '').trim();
}

function ensureTrailingPeriod(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
