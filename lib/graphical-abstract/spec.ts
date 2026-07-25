/**
 * Zod mirror of AcademicFlow's graphical-abstract spec (flow-app `buildGraphicalAbstract`).
 *
 * Every object is `.strict()`. That is deliberate and it is the point of this file: the
 * engine ignores keys it does not know, so a model that invents `panels[].caption` gets a
 * figure silently missing that text and no error anywhere. Strict parsing turns that into
 * a diagnosable failure. The three starters in ./spec.fixtures.ts are the proof that the
 * mirror still matches the engine — if one stops parsing, regenerate the mirror rather
 * than loosening it.
 *
 * Panel content blocks render in a FIXED order regardless of key order:
 *   chip(label) -> heading -> stat -> body -> bullets -> figure -> chart -> items -> rows -> note
 * so the spec cannot express "caption below the figure". Callers pick a field subset per
 * mode instead; see ./rules.ts.
 */

import { z } from 'zod';

/** Only sets the default of `stretch` in the engine, but it also names the intent. */
export const GA_LAYOUTS = ['pipeline', 'outcomes', 'bmr'] as const;
export const GA_CHART_KINDS = ['line', 'area', 'bar', 'hbar', 'scatter', 'pie', 'donut'] as const;
export const GA_ALIGNMENTS = ['start', 'middle', 'end'] as const;

/** flow-app's `AF.specVersion`. Compared against GET /v1/info so drift is visible. */
export const SPEC_VERSION = 1;

/**
 * A generous ceiling, not the editorial rule. The canonical PICO visual abstract uses
 * four panels (design / population / intervention / outcomes) and flow-app's own starters
 * do too. The real per-publisher limit lives in ./targets.ts.
 */
const MAX_PANELS = 8;

const Hex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'expected a hex colour');
const Size = z.number().positive().max(400);

const ThemeSchema = z
  .object({
    accent: Hex.optional(),
    accentText: Hex.optional(),
    panelBorder: Hex.optional(),
    font: z.string().max(60).optional(),
    text: Hex.optional(),
    muted: Hex.optional(),
    sourceFill: Hex.optional(),
    palette: z.array(Hex).max(12).optional(),
    tints: z.array(Hex).max(12).optional(),
  })
  .strict();

const StatSchema = z
  .object({
    value: z.string().max(120),
    size: Size.optional(),
    color: Hex.optional(),
    label: z.string().max(200).optional(),
    labelSize: Size.optional(),
  })
  .strict();

const ItemSchema = z
  .object({
    figure: z.string().max(60).optional(),
    title: z.string().max(160).optional(),
    titleSize: Size.optional(),
    text: z.string().max(300).optional(),
    textSize: Size.optional(),
    color: Hex.optional(),
  })
  .strict();

const RowSchema = z
  .object({
    figure: z.string().max(60).optional(),
    label: z.string().max(200).optional(),
    labelSize: Size.optional(),
    value: z.string().max(200).optional(),
    valueSize: Size.optional(),
    valueColor: Hex.optional(),
    bold: z.boolean().optional(),
  })
  .strict();

const SeriesSchema = z
  .object({
    name: z.string().max(80).optional(),
    color: Hex.optional(),
    values: z.array(z.union([z.number(), z.string()])).max(60),
    dashed: z.boolean().optional(),
    /** Per-slice colours for pie/donut. */
    colors: z.array(Hex).max(60).optional(),
  })
  .strict();

const AnnotationSchema = z
  .object({
    x: z.union([z.string().max(60), z.number()]),
    text: z.string().max(160),
    color: Hex.optional(),
    dy: z.number().optional(),
  })
  .strict();

const ChartSchema = z
  .object({
    kind: z.enum(GA_CHART_KINDS),
    labels: z.array(z.string().max(60)).max(60).optional(),
    series: z.array(SeriesSchema).max(8).optional(),
    showGrid: z.boolean().optional(),
    showAxis: z.boolean().optional(),
    showLegend: z.boolean().optional(),
    showValues: z.boolean().optional(),
    markers: z.boolean().optional(),
    annotations: z.array(AnnotationSchema).max(10).optional(),
    yMin: z.number().optional(),
    yMax: z.number().optional(),
    yTicks: z.number().int().min(2).max(12).optional(),
    yLabel: z.string().max(80).optional(),
    xLabel: z.string().max(80).optional(),
    /** Donut hole ratio. */
    innerRatio: z.number().min(0).max(0.95).optional(),
    centerText: z.string().max(60).optional(),
    centerColor: Hex.optional(),
  })
  .strict();

const PanelSchema = z
  .object({
    label: z.string().max(80).optional(),
    /** Render `label` as a filled header band instead of a pill chip. */
    headerBand: z.boolean().optional(),
    chipH: Size.optional(),
    chipSize: Size.optional(),
    chipColor: Hex.optional(),
    color: Hex.optional(),
    tint: Hex.optional(),
    fill: Hex.optional(),
    border: Hex.optional(),
    borderWidth: z.number().min(0).max(12).optional(),
    radius: z.number().min(0).max(60).optional(),
    /** Relative column width; weights are normalised across the row. */
    flex: z.number().positive().max(6).optional(),
    align: z.enum(GA_ALIGNMENTS).optional(),
    heading: z.string().max(200).optional(),
    headingSize: Size.optional(),
    headingColor: Hex.optional(),
    stat: StatSchema.optional(),
    body: z.string().max(600).optional(),
    bodySize: Size.optional(),
    bodyColor: Hex.optional(),
    bullets: z.array(z.string().max(200)).max(10).optional(),
    figure: z.string().max(60).optional(),
    figureH: Size.optional(),
    chart: ChartSchema.optional(),
    chartH: Size.optional(),
    chartTitle: z.string().max(120).optional(),
    chartFill: Hex.optional(),
    chartFontSize: Size.optional(),
    items: z.array(ItemSchema).max(10).optional(),
    rows: z.array(RowSchema).max(10).optional(),
    note: z.string().max(400).optional(),
    noteSize: Size.optional(),
    ruleColor: Hex.optional(),
  })
  .strict();

/** A strip entry is either a bare figure id or a figure with a caption. */
const StripFigureSchema = z.union([
  z.string().max(60),
  z.object({ figure: z.string().max(60), caption: z.string().max(120).optional() }).strict(),
]);

const StripSchema = z
  .object({
    figures: z.array(StripFigureSchema).max(8),
    height: Size.optional(),
    gap: z.number().min(0).max(80).optional(),
    arrows: z.boolean().optional(),
  })
  .strict();

const FooterItemSchema = z.union([
  z.string().max(200),
  z
    .object({
      figure: z.string().max(60).optional(),
      text: z.string().max(200).optional(),
      size: Size.optional(),
      bold: z.boolean().optional(),
      color: Hex.optional(),
    })
    .strict(),
]);

const FooterSchema = z
  .object({
    items: z.array(FooterItemSchema).max(6),
    result: FooterItemSchema.optional(),
    operator: z.string().max(4).optional(),
    operatorSize: Size.optional(),
    operatorColor: Hex.optional(),
    resultColor: Hex.optional(),
    height: Size.optional(),
    fill: Hex.optional(),
    border: Hex.optional(),
  })
  .strict();

const ConclusionSchema = z
  .object({
    label: z.string().max(80).optional(),
    labelFill: Hex.optional(),
    figure: z.string().max(60).optional(),
    text: z.string().max(700).optional(),
    size: Size.optional(),
    color: Hex.optional(),
    align: z.enum(GA_ALIGNMENTS).optional(),
    height: Size.optional(),
    fill: Hex.optional(),
    border: Hex.optional(),
  })
  .strict();

export const GaSpecSchema = z
  .object({
    version: z.number().int().optional(),
    type: z.literal('graphical-abstract').optional(),
    layout: z.enum(GA_LAYOUTS).optional(),
    preset: z.string().max(40).optional(),
    canvas: z.object({ w: z.number().positive(), h: z.number().positive() }).strict().optional(),
    margin: z.number().min(0).max(120).optional(),
    titleGap: z.number().min(0).max(120).optional(),
    panelGap: z.number().min(0).max(120).optional(),
    stretch: z.boolean().optional(),
    arrows: z.boolean().optional(),
    minHeight: z.number().min(0).optional(),
    theme: ThemeSchema.optional(),
    title: z.string().max(300).optional(),
    subtitle: z.string().max(300).optional(),
    titleStyle: z.literal('plain').optional(),
    titleSize: Size.optional(),
    subtitleSize: Size.optional(),
    titleHeight: z.number().min(0).max(300).optional(),
    titleRadius: z.number().min(0).max(60).optional(),
    titleFill: Hex.optional(),
    titleColor: Hex.optional(),
    panels: z.array(PanelSchema).max(MAX_PANELS).optional(),
    strip: StripSchema.optional(),
    boxes: z.array(PanelSchema).max(6).optional(),
    boxesHeight: Size.optional(),
    footer: FooterSchema.optional(),
    conclusion: ConclusionSchema.optional(),
    source: z.string().max(400).optional(),
    sourceHeight: Size.optional(),
    sourceSize: Size.optional(),
  })
  .strict()
  // Mirrors the engine's own "spec has no content" guard, which otherwise surfaces as the
  // misleading 'Spec produced no nodes' only after a render round-trip.
  .refine(
    (s) => Boolean(s.panels?.length || s.title || s.conclusion || s.strip),
    { message: 'spec has no content (needs at least a title or one panel)' },
  );

export type GaSpec = z.infer<typeof GaSpecSchema>;
export type GaPanel = z.infer<typeof PanelSchema>;
export type GaChart = z.infer<typeof ChartSchema>;
export type GaRow = z.infer<typeof RowSchema>;
export type GaItem = z.infer<typeof ItemSchema>;

/**
 * Every panel field that can carry a figure id, so the id validator and the prompt agree
 * on where icons are allowed to appear.
 */
export const PANEL_FIGURE_FIELDS = ['figure'] as const;

/** Panel content fields in the order the engine renders them. Used by the prompt. */
export const PANEL_BLOCK_ORDER = [
  'label',
  'heading',
  'stat',
  'body',
  'bullets',
  'figure',
  'chart',
  'items',
  'rows',
  'note',
] as const;

/**
 * Fields each mode may use. `graphical` omits every data-bearing block because Cell Press
 * forbids data items in a graphical abstract; `visual` needs them because every
 * visual-abstract guideline requires the numbers.
 */
export const MODE_PANEL_FIELDS: Record<'graphical' | 'visual', readonly string[]> = {
  graphical: ['label', 'headerBand', 'color', 'tint', 'flex', 'align', 'heading', 'body', 'bullets', 'figure', 'figureH', 'items', 'note'],
  visual: [
    'label', 'headerBand', 'color', 'tint', 'flex', 'align', 'heading', 'headingSize',
    'stat', 'body', 'bullets', 'figure', 'figureH', 'chart', 'chartH', 'items', 'rows', 'note',
  ],
};
