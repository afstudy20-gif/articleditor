/**
 * Walks a graphical-abstract spec and yields only the fields a reader actually reads.
 *
 * The distinction matters: a spec is full of numbers that are geometry, not claims —
 * `figureH: 150`, `flex: 1.3`, `titleSize: 22`, `#1e3a5f`. Stringifying the whole spec and
 * grounding every number in it would flag every layout constant and drown the real
 * finding. Only the fields listed here carry meaning that has to trace back to the paper.
 */

import type { GaSpec, GaPanel } from './spec';

export interface SpecField {
  /** Dotted path, e.g. `panels[3].rows[0].value` — shown to the author verbatim. */
  path: string;
  text: string;
  /** Data-bearing fields are the ones a `graphical` abstract may not contain at all. */
  data: boolean;
}

function push(out: SpecField[], path: string, value: unknown, data = false): void {
  if (typeof value === 'number') {
    out.push({ path, text: String(value), data });
    return;
  }
  if (typeof value !== 'string') return;
  const text = value.trim();
  if (text) out.push({ path, text, data });
}

function panelFields(out: SpecField[], panel: GaPanel, base: string): void {
  push(out, `${base}.label`, panel.label);
  push(out, `${base}.heading`, panel.heading);
  push(out, `${base}.body`, panel.body);
  push(out, `${base}.note`, panel.note);
  push(out, `${base}.chartTitle`, panel.chartTitle);
  panel.bullets?.forEach((b, i) => push(out, `${base}.bullets[${i}]`, b));

  if (panel.stat) {
    push(out, `${base}.stat.value`, panel.stat.value, true);
    push(out, `${base}.stat.label`, panel.stat.label);
  }

  panel.items?.forEach((item, i) => {
    push(out, `${base}.items[${i}].title`, item.title);
    push(out, `${base}.items[${i}].text`, item.text);
  });

  panel.rows?.forEach((row, i) => {
    push(out, `${base}.rows[${i}].label`, row.label);
    push(out, `${base}.rows[${i}].value`, row.value, true);
  });

  if (panel.chart) {
    const c = panel.chart;
    push(out, `${base}.chart.yLabel`, c.yLabel);
    push(out, `${base}.chart.xLabel`, c.xLabel);
    c.labels?.forEach((l, i) => push(out, `${base}.chart.labels[${i}]`, l, true));
    c.annotations?.forEach((a, i) => push(out, `${base}.chart.annotations[${i}].text`, a.text, true));
    c.series?.forEach((s, i) => {
      push(out, `${base}.chart.series[${i}].name`, s.name);
      s.values.forEach((v, j) => push(out, `${base}.chart.series[${i}].values[${j}]`, v, true));
    });
  }
}

/** Every readable field in the spec, in reading order. */
export function collectSpecFields(spec: GaSpec): SpecField[] {
  const out: SpecField[] = [];

  push(out, 'title', spec.title);
  push(out, 'subtitle', spec.subtitle);

  spec.panels?.forEach((p, i) => panelFields(out, p, `panels[${i}]`));
  spec.boxes?.forEach((b, i) => panelFields(out, b, `boxes[${i}]`));

  spec.strip?.figures.forEach((f, i) => {
    if (typeof f !== 'string') push(out, `strip.figures[${i}].caption`, f.caption);
  });

  spec.footer?.items.forEach((item, i) => {
    push(out, `footer.items[${i}]`, typeof item === 'string' ? item : item.text);
  });
  if (spec.footer?.result !== undefined) {
    const r = spec.footer.result;
    push(out, 'footer.result', typeof r === 'string' ? r : r.text);
  }

  push(out, 'conclusion.label', spec.conclusion?.label);
  push(out, 'conclusion.text', spec.conclusion?.text);

  // The source line is where abbreviations and data provenance live. It is prose, but it
  // routinely carries a study period ("1999-2023") that should still trace to the paper.
  push(out, 'source', spec.source);

  return out;
}

/** Fields whose content is a result rather than framing — what `graphical` mode forbids. */
export function collectDataFields(spec: GaSpec): SpecField[] {
  return collectSpecFields(spec).filter((f) => f.data);
}

/** Every figure id the spec references, with the path that referenced it. */
export function collectFigureRefs(spec: GaSpec): Array<{ path: string; id: string }> {
  const out: Array<{ path: string; id: string }> = [];
  const add = (path: string, id?: string): void => {
    if (id) out.push({ path, id });
  };

  const fromPanel = (panel: GaPanel, base: string): void => {
    add(`${base}.figure`, panel.figure);
    panel.items?.forEach((it, i) => add(`${base}.items[${i}].figure`, it.figure));
    panel.rows?.forEach((r, i) => add(`${base}.rows[${i}].figure`, r.figure));
  };

  spec.panels?.forEach((p, i) => fromPanel(p, `panels[${i}]`));
  spec.boxes?.forEach((b, i) => fromPanel(b, `boxes[${i}]`));
  spec.strip?.figures.forEach((f, i) =>
    add(`strip.figures[${i}]`, typeof f === 'string' ? f : f.figure),
  );
  spec.footer?.items.forEach((item, i) => {
    if (typeof item !== 'string') add(`footer.items[${i}].figure`, item.figure);
  });
  if (spec.footer?.result && typeof spec.footer.result !== 'string') {
    add('footer.result.figure', spec.footer.result.figure);
  }
  add('conclusion.figure', spec.conclusion?.figure);

  return out;
}

/** Every explicit font size in the spec, in canvas pixels, with its path. */
export function collectFontSizes(spec: GaSpec): Array<{ path: string; px: number }> {
  const out: Array<{ path: string; px: number }> = [];
  const add = (path: string, px?: number): void => {
    if (typeof px === 'number') out.push({ path, px });
  };

  add('titleSize', spec.titleSize);
  add('subtitleSize', spec.subtitleSize);
  add('sourceSize', spec.sourceSize);
  add('conclusion.size', spec.conclusion?.size);

  const fromPanel = (panel: GaPanel, base: string): void => {
    add(`${base}.chipSize`, panel.chipSize);
    add(`${base}.headingSize`, panel.headingSize);
    add(`${base}.bodySize`, panel.bodySize);
    add(`${base}.noteSize`, panel.noteSize);
    add(`${base}.chartFontSize`, panel.chartFontSize);
    add(`${base}.stat.size`, panel.stat?.size);
    add(`${base}.stat.labelSize`, panel.stat?.labelSize);
    panel.items?.forEach((it, i) => {
      add(`${base}.items[${i}].titleSize`, it.titleSize);
      add(`${base}.items[${i}].textSize`, it.textSize);
    });
    panel.rows?.forEach((r, i) => {
      add(`${base}.rows[${i}].labelSize`, r.labelSize);
      add(`${base}.rows[${i}].valueSize`, r.valueSize);
    });
  };

  spec.panels?.forEach((p, i) => fromPanel(p, `panels[${i}]`));
  spec.boxes?.forEach((b, i) => fromPanel(b, `boxes[${i}]`));

  return out;
}
