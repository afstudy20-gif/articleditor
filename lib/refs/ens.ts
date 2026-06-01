// EndNote style (.ens) reader. The format is a proprietary GLS binary
// ("RSFTSTYL") with UTF-16BE text records and the citation/bibliography
// templates encoded as binary field tokens — so an exact template reconstruction
// isn't feasible. What IS reliably recoverable: the style name, the journal
// abbreviation, the human-readable description, and the author-list connector
// tokens (" et al.", " and ", "&"). We extract those, derive a best-effort
// partial StyleSpec, and hand the readable text back so the Style Editor can
// offer a one-click AI refinement.

import type { StyleSpec } from './style-spec';

export interface EnsResult {
  name: string;
  description: string;
  /** Joined readable text — useful as AI "journal rules" input. */
  rawText: string;
  /** Best-effort knobs detected from the binary (merged onto a base preset). */
  spec: Partial<StyleSpec>;
}

/** True when bytes look like an EndNote style file. */
export function looksLikeEns(bytes: Uint8Array): boolean {
  // "RSFTSTYL" appears near the start of every .ens file.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 64));
  return head.includes('RSFTSTYL');
}

function decodeUtf16be(bytes: Uint8Array): string {
  // Node/browsers ship utf-16le; swap byte pairs then decode as le.
  const swapped = new Uint8Array(bytes.length);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

function extractRuns(text: string, min = 3): string[] {
  // Printable runs (incl. Latin-1 supplement / common punctuation), trimmed.
  const out: string[] = [];
  const re = /[\x20-\x7e\xa0-ɏ]{3,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].replace(/ /g, ' ').trim();
    if (s.length >= min) out.push(s);
  }
  return out;
}

function cleanName(raw: string): string {
  // The name record is often prefixed with a stray control char (e.g. ':').
  return raw.replace(/^[^A-Za-z0-9(]+/, '').trim();
}

export function parseEns(bytes: Uint8Array): EnsResult {
  const text = decodeUtf16be(bytes);
  const runs = extractRuns(text);

  // First substantial alphabetic run after the header is the style name.
  const name = cleanName(runs.find((r) => /[A-Za-z]{3,}/.test(r)) ?? 'EndNote Style');

  // Longest sentence-like run is the description.
  const description =
    runs
      .filter((r) => r.length > 30 && /\s/.test(r) && !r.startsWith('http'))
      .sort((a, b) => b.length - a.length)[0] ?? '';

  const joined = runs.join(' ');

  // Heuristics from connector tokens.
  const hasEtAl = /\bet al\.?/i.test(joined);
  const usesAnd = /\s+and\s+/i.test(joined);
  const usesAmp = /\s&\s/.test(joined);

  const spec: Partial<StyleSpec> = {
    name,
    authors: {
      // Sensible Vancouver-ish defaults; AI/user can refine.
      nameOrder: 'family-initials',
      initialPeriods: false,
      initialSpaces: false,
      maxBeforeEtAl: 6,
      showCount: 6,
      etAlText: hasEtAl ? 'et al.' : 'et al',
      delimiter: ', ',
      useAndBeforeLast: usesAnd || usesAmp,
      andText: usesAmp ? '&' : 'and',
    } as StyleSpec['authors'],
  };

  return { name, description, rawText: joined.slice(0, 6000), spec };
}
