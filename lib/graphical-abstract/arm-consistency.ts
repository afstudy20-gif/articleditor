/**
 * Catches a value attributed to the wrong study arm.
 *
 * Number grounding cannot see this failure: in a swapped figure both numbers are real and
 * both appear in the paper, so every token checks out while the figure says the opposite
 * of the trial. It is not hypothetical — JAMA Network Open published a formal "Error in
 * Visual Abstract" correction after the placebo and treatment labels were transposed.
 *
 * The check is deliberately a warning that quotes the source sentence, never a hard
 * failure. It only fires when the arm can be named from a lexicon, so trials whose arms
 * are "Drug A" and "Drug B" are invisible to it — which is exactly why the UI also asks
 * the author to confirm the arms before the figure goes into the manuscript.
 */

import type { SourceIndex } from './number-grounding';
import { extractNumbers } from './number-grounding';
import type { SpecField } from './spec-fields';

export type ArmSide = 'treatment' | 'control';

// "drug" and "ilaç" are deliberately absent: a two-arm trial of "Drug A" versus "Drug B"
// must come out undecidable, not silently classified as treatment-versus-something.
const ARM_LEXICON: Record<ArmSide, readonly RegExp[]> = {
  treatment: [
    /\b(treatment|treated|intervention|active|experimental|study\s+(?:arm|group))\b/i,
    /\b(tedavi|müdahale|aktif|deney|çalışma\s+grubu)\b/i,
  ],
  control: [
    /\b(control|placebo|sham|comparator|standard\s+care|usual\s+care|untreated)\b/i,
    /\b(kontrol|plasebo|karşılaştırma|standart\s+bakım|tedavisiz)\b/i,
  ],
};

const OTHER: Record<ArmSide, ArmSide> = { treatment: 'control', control: 'treatment' };

/** Which arm a label names, or null when it names neither (e.g. "Drug A"). */
export function armFromLabel(label: string): ArmSide | null {
  const treatment = ARM_LEXICON.treatment.some((re) => re.test(label));
  const control = ARM_LEXICON.control.some((re) => re.test(label));
  // "treatment vs placebo" names both and identifies neither side on its own.
  if (treatment === control) return null;
  return treatment ? 'treatment' : 'control';
}

/** How far from a number an arm word still counts as describing it. */
const WINDOW = 120;

function nearestArm(text: string, at: number): ArmSide | null {
  const from = Math.max(0, at - WINDOW);
  const window = text.slice(from, at + WINDOW);
  let best: { side: ArmSide; distance: number } | null = null;

  for (const side of ['treatment', 'control'] as const) {
    for (const re of ARM_LEXICON[side]) {
      const global = new RegExp(re.source, `${re.flags.replace(/g/g, '')}g`);
      for (let m = global.exec(window); m; m = global.exec(window)) {
        const distance = Math.abs(from + m.index - at);
        if (!best || distance < best.distance) best = { side, distance };
      }
    }
  }
  return best?.side ?? null;
}

/**
 * A full stop only ends a sentence when it is not a decimal point — quoting
 * "Mortality was 18." back at the author would be worse than quoting nothing.
 */
const SENTENCE_END = /(?<!\d)[.!?](?=\s|$)/g;

function sentenceAround(text: string, at: number): string {
  let start = 0;
  let end = text.length;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
    if (m.index < at) start = m.index + 1;
    else {
      end = m.index + 1;
      break;
    }
  }
  return text.slice(start, end).trim();
}

export interface ArmWarning {
  path: string;
  label: string;
  raw: string;
  value: number;
  /** The arm the figure attributes this value to. */
  claimedArm: ArmSide;
  /** The arm the manuscript appears to attribute it to. */
  sourceArm: ArmSide;
  /** Quoted verbatim so a human can adjudicate rather than trust the heuristic. */
  sentence: string;
}

/**
 * Pairs each value field with the label that introduces it. Derived from the paths rather
 * than re-walking the spec, so it stays in step with `collectSpecFields`.
 */
function labelFor(path: string, byPath: Map<string, string>): string | undefined {
  if (path.endsWith('.value') && path.includes('.rows[')) {
    return byPath.get(path.replace(/\.value$/, '.label'));
  }
  if (path.endsWith('.text') && path.includes('.items[')) {
    return byPath.get(path.replace(/\.text$/, '.title'));
  }
  if (path.endsWith('.stat.value')) {
    const panel = path.replace(/\.stat\.value$/, '');
    return byPath.get(`${panel}.label`) ?? byPath.get(`${panel}.heading`);
  }
  return undefined;
}

/**
 * Values whose label names one arm while the manuscript puts that number next to the
 * other. Empty when the arms cannot be named or the source is ambiguous.
 */
export function checkArmConsistency(
  fields: readonly SpecField[],
  index: SourceIndex,
): ArmWarning[] {
  const byPath = new Map(fields.map((f) => [f.path, f.text]));
  const out: ArmWarning[] = [];

  for (const field of fields) {
    if (!field.data) continue;
    const label = labelFor(field.path, byPath);
    if (!label) continue;
    const claimedArm = armFromLabel(label);
    if (!claimedArm) continue;

    for (const token of extractNumbers(field.text)) {
      if (token.kind === 'pvalue') continue;
      const occurrences = index.tokens.filter((t) => t.value === token.value && t.kind !== 'pvalue');
      if (occurrences.length === 0) continue;

      const sides = occurrences.map((o) => nearestArm(index.text, o.index)).filter(Boolean) as ArmSide[];
      if (sides.length === 0) continue;
      // Only flag when EVERY occurrence in the paper sits with the other arm. One
      // ambiguous mention is normal prose; a consistent mismatch is a transposition.
      if (!sides.every((s) => s === OTHER[claimedArm])) continue;

      const first = occurrences.find((o) => nearestArm(index.text, o.index) === OTHER[claimedArm])!;
      out.push({
        path: field.path,
        label,
        raw: token.raw,
        value: token.value,
        claimedArm,
        sourceArm: OTHER[claimedArm],
        sentence: sentenceAround(index.text, first.index),
      });
    }
  }

  return out;
}
