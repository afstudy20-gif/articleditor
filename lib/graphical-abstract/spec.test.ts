import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GaSpecSchema } from './spec';
import { PIPELINE_STARTER, OUTCOMES_STARTER, BMR_STARTER } from './spec.fixtures';
import {
  GA_TARGETS, canvasPxToPt, minCanvasPxForTarget, getTarget, isModeAllowed,
  exportSize, maxPanelsForTarget, textBudget,
} from './targets';
import { FLOW_FIGURES, hasFigure, figuresIn } from './figure-catalog';
import {
  gaArtifactBaseName, gaImageFilename, gaSpecFilename, isGaSpecAsset, nextGaBaseName, specNameForImage,
} from './artifact';

describe('GaSpecSchema', () => {
  // The starters come straight from the running engine, so they are the only real proof
  // that the mirror has not drifted from what flow-app actually accepts.
  for (const [name, starter] of Object.entries({ PIPELINE_STARTER, OUTCOMES_STARTER, BMR_STARTER })) {
    it(`accepts the ${name} verbatim`, () => {
      const parsed = GaSpecSchema.safeParse(starter);
      assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2));
    });
  }

  it('rejects an unknown layout', () => {
    assert.equal(GaSpecSchema.safeParse({ title: 'x', layout: 'triptych' }).success, false);
  });

  it('rejects an unknown chart kind', () => {
    const spec = { title: 'x', panels: [{ chart: { kind: 'sankey', series: [] } }] };
    assert.equal(GaSpecSchema.safeParse(spec).success, false);
  });

  it('rejects a key the engine would silently ignore', () => {
    // The engine drops unknown keys, so without strict parsing an invented field means a
    // figure quietly missing that content and no error to trace it back to.
    const spec = { title: 'x', panels: [{ heading: 'ok', caption: 'invented' }] };
    const parsed = GaSpecSchema.safeParse(spec);
    assert.equal(parsed.success, false);
    assert.match(JSON.stringify(parsed.success ? [] : parsed.error.issues), /caption/);
  });

  it('rejects a spec with no renderable content', () => {
    const parsed = GaSpecSchema.safeParse({ layout: 'outcomes', source: 'only a footnote' });
    assert.equal(parsed.success, false);
    assert.match(JSON.stringify(parsed.success ? [] : parsed.error.issues), /no content/);
  });

  it('rejects a malformed colour', () => {
    assert.equal(GaSpecSchema.safeParse({ title: 'x', theme: { accent: 'navy' } }).success, false);
    assert.equal(GaSpecSchema.safeParse({ title: 'x', theme: { accent: '#1e3a5f' } }).success, true);
  });
});

describe('GA_TARGETS', () => {
  // flow-app preset ids, copied from its PRESETS table. A target pointing at a preset that
  // does not exist renders at the wrong size with no error.
  const FLOW_PRESET_IDS = new Set([
    'custom', 'nature-1', 'nature-2', 'el-ga', 'el-1', 'ieee-1', 'ieee-2', 'prisma',
    'cell-ga', 'acs-toc', 'mdpi-ga', 'tf-ga', 'wiley-toc', 'wiley-banner', 'rsc-toc',
    'ga-wide', 'ga-square', 'ga-tall', 'ga-auto',
    'consort', 'strobe', 'algorithm', 'studydesign',
  ]);

  it('every target points at a preset flow-app actually has', () => {
    for (const t of GA_TARGETS) {
      assert.equal(FLOW_PRESET_IDS.has(t.presetId), true, `${t.id} → ${t.presetId}`);
    }
  });

  it('target ids are unique', () => {
    assert.equal(new Set(GA_TARGETS.map((t) => t.id)).size, GA_TARGETS.length);
  });

  it('encodes the publisher rules that differ from each other', () => {
    // Cell Press forbids data items outright; every visual-abstract guideline requires
    // numbers — the two conventions cannot be satisfied by one asset.
    assert.equal(getTarget('cell')?.allowsDataItems, false);
    assert.equal(getTarget('cell')?.maxPanels, 1);
    // Springer Nature bans AI imagery outright, unlike Elsevier's disclosure carve-out.
    assert.equal(getTarget('springer-nature')?.aiPolicy, 'prohibited');
    assert.equal(getTarget('elsevier')?.aiPolicy, 'permitted-with-disclosure');
    // Taylor & Francis is the only publisher that permits reusing an article figure.
    assert.equal(getTarget('taylor-francis')?.allowsFigureReuse, true);
    assert.equal(getTarget('mdpi')?.allowsFigureReuse, false);
  });

  it('leaves the font floor null where the publisher publishes no number', () => {
    // Inventing a limit and attributing it to a publisher is worse than enforcing none.
    assert.equal(getTarget('elsevier')?.minFontPt, null);
    assert.equal(getTarget('mdpi')?.minFontPt, null);
    assert.equal(getTarget('cell')?.minFontPt, 12);
    assert.equal(getTarget('acs')?.minFontPt, 6);
  });

  it('blocks a data-bearing mode on a target that forbids data', () => {
    const cell = getTarget('cell')!;
    assert.equal(isModeAllowed('visual', cell), false);
    assert.equal(isModeAllowed('graphical', cell), true);
    assert.equal(isModeAllowed('visual', getTarget('mdpi')!), true);
  });
});

describe('exportSize', () => {
  it('matches what each publisher requires', () => {
    // flow-app rasterises at canvas x dpi/96, so the canvas alone does not tell you
    // whether the export meets the publisher's pixel requirement.
    for (const t of GA_TARGETS) {
      if (!t.requiredPx) continue;
      const got = exportSize(t);
      if (t.requiredPx.kind === 'min') {
        assert.ok(got.w >= t.requiredPx.w, `${t.id} width ${got.w} < min ${t.requiredPx.w}`);
        assert.ok(got.h >= t.requiredPx.h, `${t.id} height ${got.h} < min ${t.requiredPx.h}`);
      } else {
        assert.ok(got.w <= t.requiredPx.w, `${t.id} width ${got.w} > max ${t.requiredPx.w}`);
        assert.ok(got.h <= t.requiredPx.h, `${t.id} height ${got.h} > max ${t.requiredPx.h}`);
      }
    }
  });
});

describe('panel budgets', () => {
  it('caps panels by what the canvas can carry, not only by the publisher rule', () => {
    // MDPI permits four panels, but four on its 550 px canvas leaves each too narrow to
    // hold a header without overlapping its neighbour.
    const mdpi = getTarget('mdpi')!;
    assert.equal(mdpi.maxPanels, 4);
    assert.ok(maxPanelsForTarget(mdpi) < 4);
    // Cell's single-panel rule is stricter than its wide canvas would allow.
    assert.equal(maxPanelsForTarget(getTarget('cell')!), 1);
    // Never zero, however narrow the target.
    for (const t of GA_TARGETS) assert.ok(maxPanelsForTarget(t) >= 1, t.id);
  });

  it('gives a wider text budget when fewer panels share the row', () => {
    const mdpi = getTarget('mdpi')!;
    assert.ok(textBudget(mdpi, 2).label > textBudget(mdpi, 4).label);
    // Row values get the narrowest column, so they are the tightest budget.
    const b = textBudget(mdpi, 3);
    assert.ok(b.rowValue < b.rowLabel && b.rowLabel < b.label);
  });
});

describe('canvasPxToPt', () => {
  it('gives different point sizes for the same canvas size across targets', () => {
    // el-ga exports at 192 dpi while ga-wide exports at 300 — the same canvas font is a
    // different physical size per target, which is exactly the trap this closes.
    const elsevier = getTarget('elsevier')!;
    const generic = getTarget('generic-wide')!;
    assert.notEqual(canvasPxToPt(12, elsevier).toFixed(3), canvasPxToPt(12, generic).toFixed(3));
    // Cell: 192/96 = 2x export, read at 300 dpi → 12 px canvas = 5.76 pt, under its 12 pt floor.
    assert.equal(Number(canvasPxToPt(12, getTarget('cell')!).toFixed(2)), 5.76);
  });

  it('round-trips against minCanvasPxForTarget', () => {
    for (const t of GA_TARGETS) {
      const min = minCanvasPxForTarget(t);
      if (min == null) {
        assert.equal(t.minFontPt, null);
        continue;
      }
      assert.equal(Number(canvasPxToPt(min, t).toFixed(6)), t.minFontPt);
    }
  });
});

describe('figure catalog', () => {
  it('holds the whole library with unique, well-formed ids', () => {
    assert.equal(FLOW_FIGURES.length, 205);
    assert.equal(new Set(FLOW_FIGURES.map((f) => f.id)).size, FLOW_FIGURES.length);
    for (const f of FLOW_FIGURES) {
      assert.match(f.id, /^[a-z0-9-]+$/, f.id);
      assert.ok(f.en.length > 0, `${f.id} has no English gloss`);
      assert.ok(f.category.length > 0, `${f.id} has no category`);
    }
  });

  it('glosses in English even where flow-app names the figure in Turkish', () => {
    // The model prompts in English and cannot search "Kalp"; the gloss comes off the id.
    const heart = FLOW_FIGURES.find((f) => f.id === 'hi-heart');
    assert.equal(heart?.en, 'heart');
    assert.equal(FLOW_FIGURES.find((f) => f.id === 'ev-forest-plot')?.en, 'forest plot');
  });

  it('recognises real ids and rejects invented ones', () => {
    // Unknown ids are dropped silently by the engine, so this is the only guard.
    assert.equal(hasFigure('ev-forest-plot'), true);
    assert.equal(hasFigure('a-plausible-but-invented-icon'), false);
  });

  it('filters by category', () => {
    const evidence = figuresIn(['Evidence']);
    assert.ok(evidence.length > 0);
    assert.equal(evidence.every((f) => f.category === 'Evidence'), true);
    assert.equal(figuresIn().length, FLOW_FIGURES.length);
  });
});

describe('artifact naming', () => {
  it('pairs an image with its spec sidecar', () => {
    const base = gaArtifactBaseName(2);
    assert.equal(gaImageFilename(base), 'graphical-abstract-2.png');
    assert.equal(gaSpecFilename(base), 'graphical-abstract-2.spec.json');
    assert.equal(specNameForImage('graphical-abstract-2.png'), 'graphical-abstract-2.spec.json');
    assert.equal(specNameForImage('some-photo.png'), null);
    assert.equal(isGaSpecAsset('graphical-abstract-2.spec.json'), true);
    assert.equal(isGaSpecAsset('graphical-abstract-2.png'), false);
  });

  it('never reuses a base name already in the project', () => {
    // Regenerating must not overwrite an abstract the author may still want.
    assert.equal(nextGaBaseName([]), 'graphical-abstract-1');
    assert.equal(nextGaBaseName(['graphical-abstract-1.png']), 'graphical-abstract-2');
    // A leftover sidecar with no image still reserves its slot.
    assert.equal(nextGaBaseName(['graphical-abstract-1.spec.json']), 'graphical-abstract-2');
  });
});
