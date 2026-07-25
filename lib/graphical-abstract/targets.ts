/**
 * Publisher targets for graphical / visual abstracts.
 *
 * Every field is taken from the publisher's own author guidelines — see
 * `flow-app/docs/GRAPHICAL_ABSTRACT_PRINCIPLES.md` for the sources and for the rules that
 * could NOT be verified. Where a publisher states no number (font size, mostly) the field
 * is null rather than a guess: enforcing an invented limit and attributing it to a
 * publisher is worse than enforcing nothing.
 *
 * The aspect ratios genuinely differ (1:1, 1.86:1, 1.96:1, 2:1, 5.5:1), so one asset
 * cannot satisfy several targets — each needs its own layout, which is why the spec is
 * authored per target rather than rendered once and rescaled.
 */

/** What the publisher says about AI involvement in this artwork. */
export type AiPolicy =
  /** AI-assisted schematics/diagrams are allowed when disclosed (Elsevier, Cell Press). */
  | 'permitted-with-disclosure'
  /** A narrower ban that arguably reaches this workflow — warn and let the author decide. */
  | 'restricted'
  /** A blanket ban on AI imagery (Springer Nature). */
  | 'prohibited'
  /** No image-specific rule found; general disclosure duties still apply. */
  | 'unstated';

/**
 * `graphical` = mechanism/pipeline, no data items (Cell Press rule).
 * `visual` = clinical summary: study design, sample size, numeric primary outcome.
 * The two are incompatible on that axis, so a target declares which it expects.
 */
export type GaMode = 'graphical' | 'visual';

export interface GaTarget {
  id: string;
  publisher: string;
  /** AcademicFlow preset id — must exist in flow-app's PRESETS. */
  presetId: string;
  /** Export size in pixels, i.e. canvas x (dpi / 96) in flow-app. */
  widthPx: number;
  heightPx: number;
  /** flow-app preset dpi: the export multiplier, not the print resolution. */
  exportDpi: number;
  /** Print resolution the publisher requires — converts export pixels to points. */
  printDpi: number;
  /** Smallest legible font the publisher states, in points. null = no number published. */
  minFontPt: number | null;
  /** Hard ceiling on panels. Cell Press mandates a single panel. */
  maxPanels: number;
  defaultMode: GaMode;
  /** Cell Press and ACS forbid showing results/data in the graphic at all. */
  allowsDataItems: boolean;
  /** Only Taylor & Francis explicitly permits reusing a figure from the article. */
  allowsFigureReuse: boolean;
  aiPolicy: AiPolicy;
  /** Notes worth surfacing verbatim; keep short, they are shown in the panel. */
  note?: string;
}

export const GA_TARGETS: readonly GaTarget[] = [
  {
    id: 'elsevier',
    publisher: 'Elsevier',
    presetId: 'el-ga',
    widthPx: 1328,
    heightPx: 531,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: null,
    maxPanels: 3,
    defaultMode: 'graphical',
    allowsDataItems: true,
    allowsFigureReuse: false,
    aiPolicy: 'permitted-with-disclosure',
    note: 'Rendered into a 200 px high window on ScienceDirect — everything must survive that.',
  },
  {
    id: 'cell',
    publisher: 'Cell Press',
    presetId: 'cell-ga',
    widthPx: 1650,
    heightPx: 1650,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: 12,
    maxPanels: 1,
    defaultMode: 'graphical',
    allowsDataItems: false,
    allowsFigureReuse: false,
    aiPolicy: 'permitted-with-disclosure',
    note: 'One single panel, no data items of any type, and it must show biological context.',
  },
  {
    id: 'acs',
    publisher: 'ACS',
    presetId: 'acs-toc',
    widthPx: 974,
    heightPx: 524,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: 6,
    maxPanels: 2,
    defaultMode: 'graphical',
    allowsDataItems: false,
    allowsFigureReuse: false,
    aiPolicy: 'restricted',
    note: 'Must convey the essence without specific results. No people, logos, stamps or currency.',
  },
  {
    id: 'mdpi',
    publisher: 'MDPI',
    presetId: 'mdpi-ga',
    widthPx: 1100,
    heightPx: 560,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: null,
    maxPanels: 4,
    defaultMode: 'visual',
    allowsDataItems: true,
    allowsFigureReuse: false,
    aiPolicy: 'unstated',
    note: 'Stated size is a minimum. No blank margins, and never the words "Graphical Abstract" inside the image.',
  },
  {
    id: 'taylor-francis',
    publisher: 'Taylor & Francis',
    presetId: 'tf-ga',
    widthPx: 1200,
    heightPx: 600,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: null,
    maxPanels: 4,
    defaultMode: 'visual',
    allowsDataItems: true,
    allowsFigureReuse: true,
    aiPolicy: 'unstated',
    note: 'Displayed at 525 px wide — check legibility there. Reusing an article figure is allowed here.',
  },
  {
    id: 'wiley',
    publisher: 'Wiley',
    presetId: 'wiley-toc',
    widthPx: 650,
    heightPx: 592,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: 10,
    maxPanels: 2,
    defaultMode: 'visual',
    allowsDataItems: true,
    allowsFigureReuse: true,
    aiPolicy: 'unstated',
    note: '55x50 mm. Wiley also accepts a 110x20 mm banner — a different layout, not a rescale.',
  },
  {
    id: 'wiley-banner',
    publisher: 'Wiley',
    presetId: 'wiley-banner',
    widthPx: 1300,
    heightPx: 236,
    exportDpi: 192,
    printDpi: 300,
    minFontPt: 10,
    maxPanels: 3,
    defaultMode: 'graphical',
    allowsDataItems: false,
    allowsFigureReuse: true,
    aiPolicy: 'unstated',
    note: '110x20 mm banner at 5.5:1 — room for a single strip of icons and a few words.',
  },
  {
    id: 'springer-nature',
    publisher: 'Springer Nature',
    presetId: 'ga-square',
    widthPx: 1200,
    heightPx: 1200,
    exportDpi: 300,
    printDpi: 300,
    minFontPt: 8,
    maxPanels: 1,
    defaultMode: 'graphical',
    allowsDataItems: false,
    allowsFigureReuse: false,
    aiPolicy: 'prohibited',
    note: 'Springer Nature does not allow AI-generated images in its publications. No house-wide GA spec exists — check the journal.',
  },
  {
    id: 'rsc',
    publisher: 'Royal Society of Chemistry',
    presetId: 'rsc-toc',
    widthPx: 1892,
    heightPx: 944,
    exportDpi: 384,
    printDpi: 600,
    minFontPt: null,
    maxPanels: 2,
    defaultMode: 'graphical',
    allowsDataItems: false,
    allowsFigureReuse: false,
    aiPolicy: 'unstated',
    note: '8x4 cm at 600 DPI.',
  },
  {
    id: 'generic-wide',
    publisher: 'Generic',
    presetId: 'ga-wide',
    widthPx: 1200,
    heightPx: 750,
    exportDpi: 300,
    printDpi: 300,
    minFontPt: 8,
    maxPanels: 4,
    defaultMode: 'visual',
    allowsDataItems: true,
    allowsFigureReuse: true,
    aiPolicy: 'unstated',
    note: 'No specific journal — use when the target is unknown, then re-render once it is.',
  },
];

const BY_ID = new Map(GA_TARGETS.map((t) => [t.id, t]));

export function getTarget(id: string): GaTarget | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_TARGET_ID = 'generic-wide';

/**
 * Font size in points at the publisher's print resolution.
 *
 * Spec font sizes are canvas pixels. Export multiplies them by `exportDpi / 96`, and the
 * publisher reads the result at `printDpi` pixels per inch — so the same canvas size is a
 * different point size per target. `el-ga` exports at 192 while `ga-wide` exports at 300,
 * which is exactly the trap this exists to close.
 */
export function canvasPxToPt(px: number, target: GaTarget): number {
  return (px * (target.exportDpi / 96) * 72) / target.printDpi;
}

/** Smallest canvas font size that still meets the target's stated floor. */
export function minCanvasPxForTarget(target: GaTarget): number | null {
  if (target.minFontPt == null) return null;
  return (target.minFontPt * target.printDpi) / ((target.exportDpi / 96) * 72);
}

/**
 * Whether a mode can be produced for a target at all. A clinical trial submitted to Cell
 * Press cannot show its numbers, so the UI must steer rather than let the pair through.
 */
export function isModeAllowed(mode: GaMode, target: GaTarget): boolean {
  return mode === 'graphical' || target.allowsDataItems;
}
