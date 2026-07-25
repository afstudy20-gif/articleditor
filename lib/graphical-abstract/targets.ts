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
  /**
   * The preset's canvas size in flow-app — what the GA engine lays out on, and what
   * decides how much text fits. NOT the exported pixel size: flow-app exports at
   * `canvas x exportDpi / 96`, so these two differ by 2x or more. Storing the canvas is
   * what keeps the layout budgets honest; use `exportSize()` for the publisher check.
   */
  canvasW: number;
  canvasH: number;
  /** flow-app preset dpi: the export multiplier, not the print resolution. */
  exportDpi: number;
  /**
   * The publisher's stated pixel requirement, and whether it is a floor or a ceiling.
   * These genuinely differ in kind: MDPI's 1100x560 is a minimum, ACS's 3.25x1.75 in is a
   * maximum, and treating either as the other produces a non-compliant figure.
   */
  requiredPx?: { w: number; h: number; kind: 'min' | 'max' };
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
    canvasW: 664,
    canvasH: 266,
    requiredPx: { w: 1328, h: 531 , kind: 'min' },
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
    canvasW: 825,
    canvasH: 825,
    requiredPx: { w: 1650, h: 1650 , kind: 'min' },
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
    canvasW: 487,
    canvasH: 262,
    requiredPx: { w: 974, h: 524 , kind: 'max' },
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
    canvasW: 550,
    canvasH: 280,
    requiredPx: { w: 1100, h: 560 , kind: 'min' },
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
    canvasW: 600,
    canvasH: 300,
    requiredPx: { w: 1200, h: 600 , kind: 'min' },
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
    canvasW: 325,
    canvasH: 296,
    requiredPx: { w: 650, h: 592 , kind: 'min' },
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
    canvasW: 650,
    canvasH: 118,
    requiredPx: { w: 1300, h: 236 , kind: 'min' },
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
    canvasW: 1000,
    canvasH: 1000,
    requiredPx: { w: 1200, h: 1200 , kind: 'min' },
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
    canvasW: 473,
    canvasH: 236,
    requiredPx: { w: 1892, h: 944 , kind: 'max' },
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
    canvasW: 1200,
    canvasH: 750,
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

// AcademicFlow layout constants (flow-app index.html: GA_PAD, default margin and panelGap).
const GA_PAD = 13;
const GA_MARGIN = 26;
const GA_PANEL_GAP = 16;
/** Below this, a text panel wraps every second word and the columns collide. */
const MIN_PANEL_INNER_PX = 104;
/** Arial averages a little over half the font size per character. */
const CHAR_WIDTH_RATIO = 0.53;

/**
 * Exported pixel size, which is what the publisher's requirement is stated in.
 * flow-app rasterises at `canvas x dpi / 96` (index.html renderPNGBlob).
 */
export function exportSize(target: GaTarget): { w: number; h: number } {
  const scale = target.exportDpi / 96;
  return { w: Math.round(target.canvasW * scale), h: Math.round(target.canvasH * scale) };
}

/** Canvas width of the target, i.e. what the GA engine lays out on. */
export function canvasWidth(target: GaTarget): number {
  return target.canvasW;
}

/** Usable width inside one panel card, given how many share the row. */
export function panelInnerWidth(target: GaTarget, panelCount: number): number {
  const w = canvasWidth(target);
  const row = w - 2 * GA_MARGIN - Math.max(0, panelCount - 1) * GA_PANEL_GAP;
  return Math.floor(row / Math.max(1, panelCount)) - 2 * GA_PAD;
}

/**
 * How many panels this target can actually carry.
 *
 * The publisher's own ceiling is only half the story: MDPI permits a PICO layout, but its
 * 1100x560 canvas is 550 px wide, and four panels there leave ~86 px of usable width each —
 * narrow enough that headers clip and the label/value columns overlap. Layout has to
 * constrain the count too, not just editorial convention.
 */
export function maxPanelsForTarget(target: GaTarget): number {
  const w = canvasWidth(target);
  const fits = Math.floor((w - 2 * GA_MARGIN + GA_PANEL_GAP) / (MIN_PANEL_INNER_PX + 2 * GA_PAD + GA_PANEL_GAP));
  return Math.max(1, Math.min(target.maxPanels, fits));
}

export interface TextBudget {
  /** Characters per line in a panel header band or chip. */
  label: number;
  /** Characters per line for heading / body / note text. */
  body: number;
  /** Row label column — the engine gives it 56% of the panel. */
  rowLabel: number;
  /** Row value column — 42% of the panel. */
  rowValue: number;
}

/**
 * Characters that fit on one line, per panel region. These go into the prompt as concrete
 * limits: a model told "keep it short" writes a 39-character header, and the engine has no
 * ellipsis — overlong text overlaps its neighbour instead of being cut.
 */
export function textBudget(target: GaTarget, panelCount: number): TextBudget {
  const inner = panelInnerWidth(target, panelCount);
  const chars = (width: number, fontPx: number): number =>
    Math.max(6, Math.floor(width / (fontPx * CHAR_WIDTH_RATIO)));
  return {
    label: chars(inner, 11.5),
    body: chars(inner, 11),
    rowLabel: chars(inner * 0.56, 11),
    rowValue: chars(inner * 0.42, 11),
  };
}
