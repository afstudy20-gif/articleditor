import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGaSpec, hasBlockingIssue, contrastRatio, OKABE_ITO } from './rules';
import type { RuleContext } from './rules';
import { checkArmConsistency, armFromLabel } from './arm-consistency';
import { buildSourceIndex } from './number-grounding';
import { collectSpecFields, collectDataFields, collectFigureRefs, collectFontSizes } from './spec-fields';
import { getTarget } from './targets';
import { OUTCOMES_STARTER } from './spec.fixtures';
import type { GaSpec } from './spec';

const generic = getTarget('generic-wide')!;
const cell = getTarget('cell')!;
const mdpi = getTarget('mdpi')!;

/** A minimal, valid visual abstract that trips no rules on the generic target. */
function baseVisual(): GaSpec {
  return {
    title: 'Drug A versus placebo in acute care',
    theme: { palette: ['#0072b2', '#56b4e9'] },
    panels: [
      {
        label: 'DESIGN',
        heading: 'Randomised controlled trial',
        body: '1,378 patients across 9 centres',
        figure: 'ev-prisma-clipboard',
      },
      {
        label: 'OUTCOME',
        figure: 'ev-forest-plot',
        rows: [{ label: 'Time to target', value: 'MD -6.27 minutes' }],
      },
    ],
  };
}

function codes(spec: GaSpec, ctx: RuleContext = { mode: 'visual', target: generic }): string[] {
  return validateGaSpec(spec, ctx).map((i) => i.code);
}

describe('validateGaSpec — structure', () => {
  it('passes a well-formed visual abstract', () => {
    assert.deepEqual(codes(baseVisual()), []);
  });

  it('rejects more panels than the publisher allows', () => {
    const spec = baseVisual();
    // Cell Press mandates a single panel.
    const issues = validateGaSpec(spec, { mode: 'graphical', target: cell });
    assert.ok(issues.some((i) => i.code === 'panel_count_exceeded' && i.severity === 'error'));
  });

  it('warns above three key results but does not block', () => {
    const spec = baseVisual();
    spec.panels![1].rows = Array.from({ length: 5 }, (_, i) => ({ label: `Outcome ${i}`, value: 'No difference' }));
    const issues = validateGaSpec(spec, { mode: 'visual', target: generic });
    const issue = issues.find((i) => i.code === 'too_many_key_results');
    assert.equal(issue?.severity, 'warning');
    assert.equal(issue?.params?.count, 5);
  });
});

describe('validateGaSpec — mode and data items', () => {
  it('blocks numbers in a graphical abstract', () => {
    // Cell Press: a graphical abstract must not include data items of any type.
    const spec = baseVisual();
    assert.ok(codes(spec, { mode: 'graphical', target: generic }).includes('graphical_mode_has_data'));
  });

  it('blocks a data-bearing figure on a publisher that forbids data', () => {
    const spec = baseVisual();
    const issues = validateGaSpec(spec, { mode: 'visual', target: cell });
    assert.ok(issues.some((i) => i.code === 'mode_not_allowed_for_target'));
    assert.ok(issues.some((i) => i.code === 'target_forbids_data'));
    assert.equal(hasBlockingIssue(issues), true);
  });

  it('accepts a mechanism figure with no numbers as a graphical abstract', () => {
    const spec: GaSpec = {
      title: 'Hypertension drives cardiac remodelling',
      theme: { palette: ['#0072b2'] },
      panels: [
        { label: 'RISK FACTOR', heading: 'Hypertension', body: 'Sustained pressure load', figure: 'dv-bp-monitor' },
      ],
    };
    assert.deepEqual(codes(spec, { mode: 'graphical', target: cell }), []);
  });

  it('rejects a panel field the mode does not allow', () => {
    const spec: GaSpec = {
      title: 'Mechanism',
      theme: { palette: ['#0072b2'] },
      panels: [{ label: 'A', figure: 'hi-heart', chart: { kind: 'bar', series: [{ values: [1] }] } }],
    };
    const issues = validateGaSpec(spec, { mode: 'graphical', target: cell });
    assert.ok(issues.some((i) => i.code === 'field_not_allowed_in_mode' && i.params?.field === 'chart'));
  });
});

describe('validateGaSpec — visual abstract completeness', () => {
  it('warns when the study design is missing', () => {
    // Study design is absent from 64% of published visual abstracts.
    const spec = baseVisual();
    spec.panels![0].heading = 'Patients';
    assert.ok(codes(spec).includes('visual_missing_study_design'));
  });

  it('warns when the sample size is missing', () => {
    const spec = baseVisual();
    spec.panels![0].body = 'Multiple centres';
    assert.ok(codes(spec).includes('visual_missing_sample_size'));
  });

  it('blocks a visual abstract with no outcome at all', () => {
    const spec = baseVisual();
    delete spec.panels![1].rows;
    assert.ok(codes(spec).includes('visual_missing_outcome'));
  });
});

describe('validateGaSpec — text, figures, typography', () => {
  it('rejects the words "graphical abstract" inside the image', () => {
    // Explicitly forbidden by MDPI and Elsevier.
    const spec = baseVisual();
    spec.title = 'Graphical Abstract — Drug A versus placebo';
    assert.ok(codes(spec).includes('title_contains_heading'));
  });

  it('rejects an invented figure id', () => {
    // The engine drops unknown ids silently, so this is the only place it surfaces.
    const spec = baseVisual();
    spec.panels![0].figure = 'ev-totally-made-up';
    const issues = validateGaSpec(spec, { mode: 'visual', target: generic });
    const issue = issues.find((i) => i.code === 'unknown_figure_id');
    assert.equal(issue?.severity, 'error');
    assert.equal(issue?.params?.id, 'ev-totally-made-up');
    assert.equal(issue?.path, 'panels[0].figure');
  });

  it('warns when a font falls below the publisher floor, in points not pixels', () => {
    const spec: GaSpec = {
      title: 'Mechanism',
      theme: { palette: ['#0072b2'] },
      panels: [{ label: 'A', figure: 'hi-heart', heading: 'Hypertension', headingSize: 15 }],
    };
    // 15 canvas px at Cell's 2x export, read at 300 dpi, is 7.2 pt — under its 12 pt floor.
    const issue = validateGaSpec(spec, { mode: 'graphical', target: cell })
      .find((i) => i.code === 'font_below_publisher_floor');
    assert.equal(issue?.params?.pt, 7.2);
    assert.equal(issue?.params?.min, 12);
  });

  it('enforces no font floor where the publisher publishes none', () => {
    const spec: GaSpec = {
      title: 'Mechanism',
      theme: { palette: ['#0072b2'] },
      panels: [{ label: 'A', figure: 'hi-heart', heading: 'x', headingSize: 4 }],
    };
    // MDPI states no minimum; inventing one and attributing it to MDPI would be wrong.
    assert.equal(mdpi.minFontPt, null);
    assert.ok(!codes(spec, { mode: 'graphical', target: mdpi }).includes('font_below_publisher_floor'));
  });
});

describe('validateGaSpec — colour', () => {
  it('blocks a red/green pairing', () => {
    // Unreadable under deuteranopia.
    const spec = baseVisual();
    spec.theme = { palette: ['#d62728', '#2ca02c'] };
    const issues = validateGaSpec(spec, { mode: 'visual', target: generic });
    assert.ok(issues.some((i) => i.code === 'red_green_pair' && i.severity === 'error'));
  });

  it('warns about colours outside the colourblind-safe palette', () => {
    const spec = baseVisual();
    spec.theme = { palette: ['#123456'] };
    assert.ok(codes(spec).includes('palette_outside_okabe_ito'));
  });

  it('accepts the Okabe-Ito palette silently', () => {
    const spec = baseVisual();
    spec.theme = { palette: [OKABE_ITO[5], OKABE_ITO[2]] };
    assert.ok(!codes(spec).includes('palette_outside_okabe_ito'));
  });

  it('warns on text that fails WCAG AA against its panel fill', () => {
    const spec = baseVisual();
    spec.theme = { palette: ['#0072b2'], text: '#9aa4b2' };
    spec.panels![0].fill = '#c8cdd4';
    const issue = validateGaSpec(spec, { mode: 'visual', target: generic })
      .find((i) => i.code === 'low_contrast');
    assert.equal(issue?.severity, 'warning');
  });

  it('computes WCAG contrast correctly at the extremes', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
    assert.equal(contrastRatio('#123456', '#123456'), 1);
  });
});

describe('validateGaSpec — publisher AI policy', () => {
  it('warns for a publisher that bans AI imagery outright', () => {
    // Springer Nature's ban is blanket; the author decides, the tool must not decide silently.
    const issues = validateGaSpec(baseVisual(), { mode: 'graphical', target: getTarget('springer-nature')! });
    assert.ok(issues.some((i) => i.code === 'ai_policy_prohibited'));
  });

  it('warns for a publisher with a narrower ban that may still reach this workflow', () => {
    const issues = validateGaSpec(baseVisual(), { mode: 'graphical', target: getTarget('acs')! });
    assert.ok(issues.some((i) => i.code === 'ai_policy_restricted'));
  });

  it('stays silent for a publisher that permits disclosed AI-assisted diagrams', () => {
    const issues = validateGaSpec(baseVisual(), { mode: 'graphical', target: getTarget('elsevier')! });
    assert.ok(!issues.some((i) => i.code.startsWith('ai_policy')));
  });
});

describe('validateGaSpec — figure reuse', () => {
  it('warns when the abstract restates a figure already in the paper', () => {
    const spec = baseVisual();
    spec.title = 'Primary outcome by treatment group over time';
    const issues = validateGaSpec(spec, {
      mode: 'visual',
      target: mdpi,
      existingFigureCaptions: ['Primary outcome by treatment group'],
    });
    assert.ok(issues.some((i) => i.code === 'duplicates_existing_figure'));
  });

  it('stays silent for Taylor & Francis, which permits reuse', () => {
    const spec = baseVisual();
    spec.title = 'Primary outcome by treatment group over time';
    const issues = validateGaSpec(spec, {
      mode: 'visual',
      target: getTarget('taylor-francis')!,
      existingFigureCaptions: ['Primary outcome by treatment group'],
    });
    assert.ok(!issues.some((i) => i.code === 'duplicates_existing_figure'));
  });
});

describe('spec field collection', () => {
  it('reads content fields and ignores geometry', () => {
    const fields = collectSpecFields(OUTCOMES_STARTER);
    const paths = fields.map((f) => f.path);
    assert.ok(paths.includes('title'));
    assert.ok(paths.some((p) => /^panels\[\d\]\.rows\[\d\]\.value$/.test(p)));
    // Sizes, colours and canvas numbers are layout, not claims — flagging them would
    // bury the real findings under every constant in the file.
    assert.ok(!paths.some((p) => /Size$|Color$|^canvas|^margin/.test(p)));
  });

  it('marks only result-bearing fields as data', () => {
    const data = collectDataFields(OUTCOMES_STARTER).map((f) => f.path);
    assert.ok(data.every((p) => /\.(value)$|chart\./.test(p)));
    assert.ok(data.length > 0);
  });

  it('finds every figure reference and every explicit font size', () => {
    const refs = collectFigureRefs(OUTCOMES_STARTER);
    assert.ok(refs.length > 5);
    assert.ok(refs.every((r) => r.id.length > 0));
    const sizes = collectFontSizes(OUTCOMES_STARTER);
    assert.ok(sizes.every((s) => Number.isFinite(s.px)));
  });
});

describe('armFromLabel', () => {
  it('names an arm from either language', () => {
    assert.equal(armFromLabel('Treatment group'), 'treatment');
    assert.equal(armFromLabel('Plasebo kolu'), 'control');
    assert.equal(armFromLabel('Standard care'), 'control');
  });

  it('declines when the label names both arms or neither', () => {
    assert.equal(armFromLabel('Treatment vs placebo'), null);
    assert.equal(armFromLabel('Drug A'), null);
  });
});

describe('checkArmConsistency', () => {
  const source =
    'Mortality was 12.4 in the treatment group. Mortality was 18.9 in the placebo group. Follow-up was complete.';

  it('flags a value attributed to the opposite arm', () => {
    // Number grounding cannot see this: both numbers are real and both are in the paper.
    const fields = [
      { path: 'panels[0].rows[0].label', text: 'Treatment group', data: false },
      { path: 'panels[0].rows[0].value', text: '18.9% mortality', data: true },
    ];
    const warnings = checkArmConsistency(fields, buildSourceIndex(source));
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].claimedArm, 'treatment');
    assert.equal(warnings[0].sourceArm, 'control');
    assert.match(warnings[0].sentence, /placebo/);
  });

  it('stays silent when the arms are the right way round', () => {
    const fields = [
      { path: 'panels[0].rows[0].label', text: 'Treatment group', data: false },
      { path: 'panels[0].rows[0].value', text: '12.4% mortality', data: true },
      { path: 'panels[0].rows[1].label', text: 'Placebo group', data: false },
      { path: 'panels[0].rows[1].value', text: '18.9% mortality', data: true },
    ];
    assert.deepEqual(checkArmConsistency(fields, buildSourceIndex(source)), []);
  });

  it('stays silent when the arms cannot be named', () => {
    // "Drug A" / "Drug B" trials are invisible to the heuristic by design — which is why
    // the UI still asks the author to confirm the arms.
    const fields = [
      { path: 'panels[0].rows[0].label', text: 'Drug A', data: false },
      { path: 'panels[0].rows[0].value', text: '18.9% mortality', data: true },
    ];
    assert.deepEqual(checkArmConsistency(fields, buildSourceIndex(source)), []);
  });
});
