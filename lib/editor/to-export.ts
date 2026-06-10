import type { MarkerOccurrence, Ref } from '@/store/types';
import { formatInTextCitation, orderRefsForBib, type StyleId } from '@/lib/refs/styles';

type Json = any;

// Convert TipTap JSON + ordered refs into the (bodyText, markers, refs) tuple
// consumed by lib/docx/build.ts.
export function tiptapToBuildInput(
  json: Json,
  refsById: Map<string, Ref>,
  refOrder: Map<string, number>,
  style: StyleId = 'vancouver',
): { bodyText: string; markers: MarkerOccurrence[]; orderedRefs: Ref[] } {
  // Compute the FINAL bibliography order up front. Styles like APA re-sort
  // alphabetically; marker numbers must index into that final list, otherwise
  // the DOCX builder resolves citation-order numbers against the re-sorted
  // array and silently links the wrong reference.
  const citationOrdered = orderRefs(refsById, refOrder);
  const orderedRefs = orderRefsForBib(style, citationOrdered);
  const bibPos = new Map<string, number>();
  orderedRefs.forEach((r, i) => bibPos.set(r.id, i + 1));

  const out: string[] = [];
  const markers: MarkerOccurrence[] = [];
  let cursor = 0;

  const emit = (s: string) => {
    out.push(s);
    cursor += s.length;
  };

  const walk = (n: any) => {
    if (!n) return;
    if (n.type === 'text') {
      emit(n.text ?? '');
      return;
    }
    if (n.type === 'citation') {
      const ids: string[] = n.attrs?.refIds ?? [];
      const nums = ids.map((id) => bibPos.get(id) ?? 0).filter((x) => x > 0);
      const cited = ids.map((id) => refsById.get(id)).filter((r): r is Ref => Boolean(r));
      if (nums.length === 0 && cited.length === 0) return;
      const cite = {
        locator: n.attrs?.locator || undefined,
        prefix: n.attrs?.prefix || undefined,
        suffix: n.attrs?.suffix || undefined,
        suppressAuthor: n.attrs?.suppressAuthor || undefined,
      };
      const hasCite = Boolean(cite.locator || cite.prefix || cite.suffix || cite.suppressAuthor);
      const raw = formatInTextCitation(style, cited, nums, cite);
      const start = cursor;
      emit(raw);
      markers.push({
        startIndex: start,
        endIndex: cursor,
        raw,
        refNumbers: nums.sort((a, b) => a - b),
        ...(hasCite ? { cite } : {}),
      });
      return;
    }
    if (n.type === 'paragraph') {
      if (Array.isArray(n.content)) for (const c of n.content) walk(c);
      emit('\n');
      return;
    }
    if (n.type === 'heading') {
      if (Array.isArray(n.content)) for (const c of n.content) walk(c);
      emit('\n');
      return;
    }
    if (n.type === 'hardBreak') {
      emit('\n');
      return;
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(json);

  const bodyText = out.join('').replace(/\n+$/g, '');
  return { bodyText, markers, orderedRefs };
}

function orderRefs(refsById: Map<string, Ref>, refOrder: Map<string, number>): Ref[] {
  const entries: Array<{ id: string; n: number }> = [];
  refOrder.forEach((n, id) => entries.push({ id, n }));
  entries.sort((a, b) => a.n - b.n);
  const out: Ref[] = [];
  for (const e of entries) {
    const r = refsById.get(e.id);
    if (r) out.push(r);
  }
  return out;
}

function vancouver(nums: number[]): string {
  const sorted = [...nums].sort((a, b) => a - b);
  const groups: Array<[number, number]> = [];
  let s = sorted[0];
  let p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) {
      p = sorted[i];
    } else {
      groups.push([s, p]);
      s = sorted[i];
      p = sorted[i];
    }
  }
  groups.push([s, p]);
  return `[${groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',')}]`;
}
