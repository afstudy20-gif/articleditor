#!/usr/bin/env node
/**
 * Regenerates lib/graphical-abstract/figure-catalog.ts from a running AcademicFlow
 * render server.
 *
 * The catalog is checked in rather than fetched at request time for two reasons:
 * GET /v1/figures boots headless Chromium on a ~930 KB page, and the prompt builder
 * and the figure-id validator have to stay pure so they can be unit tested without a
 * network (see docs/SPEC.md F13).
 *
 * AcademicFlow's figure `name` fields are Turkish ("hi-heart" → "Kalp"), which an
 * English-prompted model cannot search. The English gloss is derived from the id
 * instead — the ids are already English words behind a two-letter category prefix
 * ("ev-forest-plot" → "forest plot"), so this needs no translation step and cannot
 * drift from the id the model must actually emit.
 *
 *   node server/index.js            # in the flow-app repo
 *   npm run sync:figures            # here
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.FLOW_SERVER_URL || 'http://127.0.0.1:8787';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'graphical-abstract', 'figure-catalog.ts');

/** Two-letter id prefixes AcademicFlow uses; stripped before glossing. */
const PREFIXES = new Set(['hi', 'fl', 'ph', 'sd', 'sf', 'dv', 'ev', 'pp', 'mt', 'gg', 'ga']);

function glossFromId(id) {
  const parts = id.split('-');
  const words = PREFIXES.has(parts[0]) && parts.length > 1 ? parts.slice(1) : parts;
  return words.join(' ');
}

async function main() {
  const res = await fetch(`${BASE}/v1/figures`, {
    headers: process.env.FLOW_API_KEY ? { 'X-API-Key': process.env.FLOW_API_KEY } : {},
  });
  if (!res.ok) throw new Error(`GET /v1/figures → ${res.status}. Is the flow-app render server running at ${BASE}?`);
  const { figures } = await res.json();
  if (!Array.isArray(figures) || figures.length === 0) throw new Error('No figures returned');

  const rows = figures
    .map((f) => ({ id: f.id, category: f.category, en: glossFromId(f.id), tr: f.name }))
    .sort((a, b) => (a.category === b.category ? a.id.localeCompare(b.id) : a.category.localeCompare(b.category)));

  const categories = [...new Set(rows.map((r) => r.category))].sort();

  const body = `/**
 * AcademicFlow's figure library, snapshotted so the prompt builder and the figure-id
 * validator stay pure and network-free. Regenerate with \`npm run sync:figures\` against
 * a running flow-app render server — do not hand-edit.
 *
 * \`en\` is derived from the id (the ids are English words behind a category prefix), so
 * it can never drift from the identifier the model has to emit. \`tr\` is AcademicFlow's
 * own display name.
 *
 * Generated from ${BASE}/v1/figures — ${rows.length} figures, ${categories.length} categories.
 */

export interface FlowFigure {
  id: string;
  category: string;
  /** English gloss derived from the id — what an English prompt searches on. */
  en: string;
  /** AcademicFlow's Turkish display name. */
  tr: string;
}

export const FLOW_FIGURE_CATEGORIES = [
${categories.map((c) => `  '${c}',`).join('\n')}
] as const;

export type FlowFigureCategory = (typeof FLOW_FIGURE_CATEGORIES)[number];

export const FLOW_FIGURES: readonly FlowFigure[] = [
${rows.map((r) => `  { id: '${r.id}', category: '${r.category}', en: ${JSON.stringify(r.en)}, tr: ${JSON.stringify(r.tr)} },`).join('\n')}
];

const BY_ID = new Map(FLOW_FIGURES.map((f) => [f.id, f]));

/**
 * Whether a figure id exists. AcademicFlow drops unknown ids silently while rendering,
 * so a spec full of invented icons comes back as text-only panels with no error — this
 * is the only place that catches it.
 */
export function hasFigure(id: string): boolean {
  return BY_ID.has(id);
}

export function getFigure(id: string): FlowFigure | undefined {
  return BY_ID.get(id);
}

/** Figures in the given categories, or all of them when no filter is given. */
export function figuresIn(categories?: readonly string[]): readonly FlowFigure[] {
  if (!categories || categories.length === 0) return FLOW_FIGURES;
  const wanted = new Set(categories);
  return FLOW_FIGURES.filter((f) => wanted.has(f.category));
}
`;

  await writeFile(OUT, body, 'utf8');
  process.stdout.write(`Wrote ${rows.length} figures in ${categories.length} categories to ${OUT}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
