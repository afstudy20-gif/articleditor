/**
 * Selects the part of a manuscript a graphical abstract is actually built from.
 *
 * A full paper does not fit in a prompt, and most of it is not useful here: the model
 * needs the claim, the design, the numbers and the conclusion, not the literature review.
 * Sections are taken in priority order so that truncation drops the least useful material
 * first rather than whatever happens to come last.
 *
 * The one hard invariant is that the excerpt never ends inside a number. The excerpt is
 * also the source of truth for number grounding, so a "1,3" left behind by a naive slice
 * would make the figure's correct "1,378" look fabricated.
 */

export interface ManuscriptInput {
  title?: string;
  abstractText?: string;
  keywords?: readonly string[];
  bodyText?: string;
  /** Captions of tables and figures already in the paper — dense in results. */
  captions?: readonly string[];
}

export interface ManuscriptExcerpt {
  text: string;
  /** Section labels included, in order, for showing the author what was used. */
  included: string[];
  truncated: boolean;
}

export const DEFAULT_EXCERPT_CHARS = 12_000;

/** Section headings worth pulling out of the body, most useful first. */
const SECTION_PRIORITY: Array<{ label: string; re: RegExp }> = [
  { label: 'Results', re: /^\s*(?:\d+[.)]\s*)?(results?|bulgular|sonuçlar)\s*$/i },
  { label: 'Conclusion', re: /^\s*(?:\d+[.)]\s*)?(conclusions?|sonuç|tartışma sonucu)\s*$/i },
  { label: 'Methods', re: /^\s*(?:\d+[.)]\s*)?(methods?|materials? and methods?|yöntem|gereç ve yöntem|materyal ve metot)\s*$/i },
  { label: 'Discussion', re: /^\s*(?:\d+[.)]\s*)?(discussion|tartışma)\s*$/i },
];

/** Any line that looks like a section heading, used to find where a section ends. */
const ANY_HEADING = /^\s*(?:\d+(?:\.\d+)*[.)]?\s*)?[A-ZÇĞİÖŞÜ][^.!?]{2,60}\s*$/;

/**
 * Text under a heading, up to the next heading. Returns null when the section is absent
 * rather than guessing — a wrong section is worse than a missing one.
 */
export function extractSection(body: string, heading: RegExp): string | null {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (out.length > 0 && ANY_HEADING.test(line) && line.trim().length > 0) break;
    out.push(line);
  }
  const text = out.join('\n').trim();
  return text.length > 0 ? text : null;
}

/**
 * Truncates without ever cutting a number in half. Falls back to the raw limit only when
 * the whole tail is one long run of digits, which cannot happen in prose.
 */
export function truncateAtSafeBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let cut = limit;
  // Walk back out of a number (digits, separators, and a trailing % or unit letter).
  while (cut > 0 && /[\d.,%]/.test(text[cut])) cut -= 1;
  // Then back to the last sentence or line break so the tail stays readable.
  const boundary = Math.max(text.lastIndexOf('\n', cut), text.lastIndexOf('. ', cut));
  if (boundary > limit * 0.5) cut = boundary;
  return text.slice(0, cut).trimEnd();
}

/**
 * The prompt's manuscript block. Title, abstract and keywords always survive: they are
 * small and they carry the claim the whole figure is about.
 */
export function selectManuscriptExcerpt(
  input: ManuscriptInput,
  maxChars: number = DEFAULT_EXCERPT_CHARS,
): ManuscriptExcerpt {
  const parts: Array<{ label: string; text: string }> = [];

  if (input.title?.trim()) parts.push({ label: 'Title', text: input.title.trim() });
  if (input.abstractText?.trim()) parts.push({ label: 'Abstract', text: input.abstractText.trim() });
  if (input.keywords?.length) parts.push({ label: 'Keywords', text: input.keywords.join(', ') });

  const body = input.bodyText ?? '';
  for (const section of SECTION_PRIORITY) {
    const text = body ? extractSection(body, section.re) : null;
    if (text) parts.push({ label: section.label, text });
  }

  if (input.captions?.length) {
    parts.push({ label: 'Figure and table captions', text: input.captions.join('\n') });
  }

  // No recognisable sections: fall back to the body itself rather than sending nothing.
  if (parts.length <= 3 && body.trim()) {
    parts.push({ label: 'Manuscript', text: body.trim() });
  }

  const included: string[] = [];
  const chunks: string[] = [];
  let used = 0;
  let truncated = false;

  for (const part of parts) {
    const header = `## ${part.label}\n`;
    const remaining = maxChars - used - header.length;
    if (remaining <= 200) {
      truncated = true;
      break;
    }
    const text = truncateAtSafeBoundary(part.text, remaining);
    if (text.length < part.text.length) truncated = true;
    chunks.push(header + text);
    included.push(part.label);
    used += header.length + text.length + 2;
  }

  return { text: chunks.join('\n\n'), included, truncated };
}
