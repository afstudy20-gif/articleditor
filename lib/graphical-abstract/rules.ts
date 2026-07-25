/**
 * Editorial and accessibility rules for a generated graphical abstract.
 *
 * Issues carry a stable `code` and typed `params` and never a human sentence — the panel
 * is bilingual, so the wording lives in the i18n dictionary and this file stays testable
 * without asserting on prose.
 *
 * The rules come from publisher guidelines and from the measured failure rates in
 * `flow-app/docs/GRAPHICAL_ABSTRACT_PRINCIPLES.md`: study design absent in 64% of
 * published visual abstracts, misleading icons in 51%, sample size absent in 31%.
 */

import type { GaSpec } from './spec';
import { MODE_PANEL_FIELDS } from './spec';
import type { GaMode, GaTarget } from './targets';
import { canvasPxToPt, isModeAllowed } from './targets';
import { hasFigure } from './figure-catalog';
import { collectSpecFields, collectDataFields, collectFigureRefs, collectFontSizes } from './spec-fields';

export type IssueSeverity = 'error' | 'warning';

export interface GaIssue {
  code: GaIssueCode;
  severity: IssueSeverity;
  /** Dotted path into the spec when the issue is local to one field. */
  path?: string;
  params?: Record<string, string | number>;
}

export type GaIssueCode =
  | 'panel_count_exceeded'
  | 'too_many_key_results'
  | 'graphical_mode_has_data'
  | 'target_forbids_data'
  | 'mode_not_allowed_for_target'
  | 'visual_missing_study_design'
  | 'visual_missing_sample_size'
  | 'visual_missing_outcome'
  | 'title_contains_heading'
  | 'unknown_figure_id'
  | 'no_figures'
  | 'field_not_allowed_in_mode'
  | 'font_below_publisher_floor'
  | 'palette_outside_okabe_ito'
  | 'red_green_pair'
  | 'low_contrast'
  | 'ai_policy_prohibited'
  | 'ai_policy_restricted'
  | 'duplicates_existing_figure';

/**
 * Okabe-Ito, the palette verified under protanopia, deuteranopia and tritanopia
 * (Wong B, Nature Methods 2011;8:441). Categorical only — it has no meaningful order.
 */
export const OKABE_ITO = [
  '#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7',
] as const;

const OKABE_ITO_SET = new Set<string>(OKABE_ITO);

/** Editorial ceiling on key results, from the Ibrahim primer and EJSO ("no more than 3"). */
const MAX_KEY_RESULTS = 3;

function expandHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length === 4) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
}

function rgb(hex: string): [number, number, number] {
  const h = expandHex(hex);
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio; AA body text needs at least 4.5. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

function saturation(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

const isRedish = (hex: string): boolean => saturation(hex) > 0.35 && (hue(hex) <= 20 || hue(hex) >= 340);
const isGreenish = (hex: string): boolean => saturation(hex) > 0.35 && hue(hex) >= 80 && hue(hex) <= 160;

/** Every colour the spec uses to distinguish one thing from another. */
function categoricalColors(spec: GaSpec): string[] {
  const out: string[] = [];
  if (spec.theme?.palette) out.push(...spec.theme.palette);
  for (const p of [...(spec.panels ?? []), ...(spec.boxes ?? [])]) {
    if (p.color) out.push(p.color);
    p.rows?.forEach((r) => r.valueColor && out.push(r.valueColor));
    p.items?.forEach((i) => i.color && out.push(i.color));
    p.chart?.series?.forEach((s) => {
      if (s.color) out.push(s.color);
      if (s.colors) out.push(...s.colors);
    });
  }
  return out.map(expandHex);
}

const STUDY_DESIGN_RE =
  /\b(randomi[sz]ed|randomi[sz]ation|RCT|cohort|case[- ]control|cross[- ]sectional|retrospective|prospective|systematic review|meta[- ]analys|registry|trial|survey|observational)\b|\b(randomize|kohort|olgu[- ]kontrol|kesitsel|retrospektif|prospektif|sistematik derleme|meta[- ]analiz|çalışma deseni)\b/i;

const SAMPLE_SIZE_RE = /\b(n\s*=\s*\d|\d[\d.,]*\s*(patients|participants|subjects|cases|hasta|katılımcı|olgu|denek))/i;

const GA_HEADING_RE = /\b(graphical abstract|visual abstract|grafiksel özet|görsel özet)\b/i;

export interface RuleContext {
  mode: GaMode;
  target: GaTarget;
  /** Captions of figures already in the manuscript, for the reuse check. */
  existingFigureCaptions?: readonly string[];
}

/**
 * All rule violations for a spec. Ordered errors-first so the caller can slice off the
 * blocking set without re-sorting.
 */
export function validateGaSpec(spec: GaSpec, ctx: RuleContext): GaIssue[] {
  const { mode, target } = ctx;
  const issues: GaIssue[] = [];
  const panels = spec.panels ?? [];
  const dataFields = collectDataFields(spec);
  const allFields = collectSpecFields(spec);
  const allText = allFields.map((f) => f.text).join(' \n');

  // ── structure ────────────────────────────────────────────────────────────
  if (panels.length > target.maxPanels) {
    issues.push({
      code: 'panel_count_exceeded',
      severity: 'error',
      params: { count: panels.length, max: target.maxPanels, publisher: target.publisher },
    });
  }

  panels.forEach((p, i) => {
    const results = (p.rows?.length ?? 0) + (p.items?.length ?? 0);
    if (results > MAX_KEY_RESULTS) {
      issues.push({
        code: 'too_many_key_results',
        severity: 'warning',
        path: `panels[${i}]`,
        params: { count: results, max: MAX_KEY_RESULTS },
      });
    }
  });

  // ── mode vs target ───────────────────────────────────────────────────────
  if (!isModeAllowed(mode, target)) {
    issues.push({
      code: 'mode_not_allowed_for_target',
      severity: 'error',
      params: { mode, publisher: target.publisher },
    });
  }

  if (dataFields.length > 0) {
    if (mode === 'graphical') {
      // Cell Press: a graphical abstract must "not include data items of any type".
      issues.push({
        code: 'graphical_mode_has_data',
        severity: 'error',
        path: dataFields[0].path,
        params: { count: dataFields.length, example: dataFields[0].text.slice(0, 60) },
      });
    } else if (!target.allowsDataItems) {
      issues.push({
        code: 'target_forbids_data',
        severity: 'error',
        path: dataFields[0].path,
        params: { publisher: target.publisher, example: dataFields[0].text.slice(0, 60) },
      });
    }
  }

  // ── completeness of a visual abstract ────────────────────────────────────
  if (mode === 'visual') {
    if (!STUDY_DESIGN_RE.test(allText)) {
      issues.push({ code: 'visual_missing_study_design', severity: 'warning' });
    }
    if (!SAMPLE_SIZE_RE.test(allText)) {
      issues.push({ code: 'visual_missing_sample_size', severity: 'warning' });
    }
    if (dataFields.length === 0) {
      issues.push({ code: 'visual_missing_outcome', severity: 'error' });
    }
  }

  // ── field subsets ────────────────────────────────────────────────────────
  const allowed = new Set(MODE_PANEL_FIELDS[mode]);
  [...panels, ...(spec.boxes ?? [])].forEach((p, i) => {
    for (const key of Object.keys(p)) {
      if (allowed.has(key)) continue;
      // Purely cosmetic keys are never a mode violation.
      if (/^(fill|border|borderWidth|radius|chipH|chipColor|tint|ruleColor|.*Size|.*Color|figureH|chartH|chartTitle|chartFill)$/.test(key)) continue;
      issues.push({
        code: 'field_not_allowed_in_mode',
        severity: 'error',
        path: `panels[${i}].${key}`,
        params: { field: key, mode },
      });
    }
  });

  // ── text ─────────────────────────────────────────────────────────────────
  if (spec.title && GA_HEADING_RE.test(spec.title)) {
    // MDPI and Elsevier both forbid the words inside the image.
    issues.push({ code: 'title_contains_heading', severity: 'error', path: 'title' });
  }

  // ── figures ──────────────────────────────────────────────────────────────
  const figureRefs = collectFigureRefs(spec);
  for (const ref of figureRefs) {
    if (!hasFigure(ref.id)) {
      // AcademicFlow drops unknown ids while rendering, so an invented icon becomes a
      // text-only panel with no error anywhere. This is the only place that catches it.
      issues.push({
        code: 'unknown_figure_id',
        severity: 'error',
        path: ref.path,
        params: { id: ref.id },
      });
    }
  }
  if (figureRefs.length === 0) {
    issues.push({ code: 'no_figures', severity: 'warning' });
  }

  // ── typography ───────────────────────────────────────────────────────────
  if (target.minFontPt != null) {
    for (const { path, px } of collectFontSizes(spec)) {
      const pt = canvasPxToPt(px, target);
      if (pt < target.minFontPt) {
        issues.push({
          code: 'font_below_publisher_floor',
          severity: 'warning',
          path,
          params: { pt: Number(pt.toFixed(1)), min: target.minFontPt, publisher: target.publisher },
        });
      }
    }
  }

  // ── colour ───────────────────────────────────────────────────────────────
  const colors = categoricalColors(spec);
  const outside = [...new Set(colors)].filter((c) => !OKABE_ITO_SET.has(c));
  if (outside.length > 0) {
    issues.push({
      code: 'palette_outside_okabe_ito',
      severity: 'warning',
      params: { count: outside.length, example: outside[0] },
    });
  }
  const red = colors.find(isRedish);
  const green = colors.find(isGreenish);
  if (red && green) {
    // Unreadable under deuteranopia; Frontiers states it as a rule.
    issues.push({ code: 'red_green_pair', severity: 'error', params: { red, green } });
  }

  const textColor = expandHex(spec.theme?.text ?? '#1f2937');
  for (const [i, p] of [...panels, ...(spec.boxes ?? [])].entries()) {
    const bg = p.fill ?? p.tint;
    if (!bg) continue;
    const ratio = contrastRatio(textColor, expandHex(bg));
    if (ratio < 4.5) {
      issues.push({
        code: 'low_contrast',
        severity: 'warning',
        path: `panels[${i}]`,
        params: { ratio: Number(ratio.toFixed(2)), min: 4.5 },
      });
    }
  }

  // ── publisher AI policy ──────────────────────────────────────────────────
  if (target.aiPolicy === 'prohibited') {
    issues.push({ code: 'ai_policy_prohibited', severity: 'warning', params: { publisher: target.publisher } });
  } else if (target.aiPolicy === 'restricted') {
    issues.push({ code: 'ai_policy_restricted', severity: 'warning', params: { publisher: target.publisher } });
  }

  // ── reuse of an existing figure ──────────────────────────────────────────
  if (!target.allowsFigureReuse && ctx.existingFigureCaptions?.length && spec.title) {
    const title = spec.title.toLowerCase();
    const clash = ctx.existingFigureCaptions.find(
      (c) => c.trim().length > 12 && title.includes(c.trim().toLowerCase()),
    );
    if (clash) {
      issues.push({
        code: 'duplicates_existing_figure',
        severity: 'warning',
        params: { publisher: target.publisher, caption: clash.slice(0, 80) },
      });
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/** Whether any issue must stop the figure reaching the manuscript unreviewed. */
export function hasBlockingIssue(issues: readonly GaIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
