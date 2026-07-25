import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNumbers,
  buildSourceIndex,
  checkGrounding,
  interpretNumeric,
  normalizeNumericText,
} from './number-grounding';

/** Convenience: ground a single string against a source and return the offending raws. */
function ungrounded(specText: string, source: string, opts = {}): string[] {
  const index = buildSourceIndex(source);
  return checkGrounding([{ path: 'x', text: specText }], index, opts).map((u) => u.raw);
}

describe('normalizeNumericText', () => {
  it('reads unicode minus and dashes as minus only before a digit', () => {
    assert.equal(normalizeNumericText('MD −6.27'), 'MD -6.27');
    assert.equal(normalizeNumericText('−16.96 to 4.42'), '-16.96 to 4.42');
    // An em dash separating words is punctuation, not a sign.
    assert.equal(normalizeNumericText('Drug A — Drug B'), 'Drug A — Drug B');
  });

  it('drops thin and non-breaking spaces used as thousands separators', () => {
    assert.equal(normalizeNumericText('1 378 patients'), '1378 patients');
    assert.equal(normalizeNumericText('1 378'), '1378');
  });
});

describe('interpretNumeric', () => {
  it('reads grouped digits as thousands', () => {
    assert.deepEqual(interpretNumeric('1,378'), [1378, 1.378]);
    assert.deepEqual(interpretNumeric('153,563'), [153563, 153.563]);
    assert.deepEqual(interpretNumeric('1,234,567'), [1234567]);
  });

  it('reads a short comma group as a decimal', () => {
    assert.deepEqual(interpretNumeric('2,22'), [2.22]);
  });

  it('reads the European convention', () => {
    assert.deepEqual(interpretNumeric('1.378,5'), [1378.5]);
  });
});

describe('extractNumbers', () => {
  it('keeps a p-value whole rather than emitting a bare number', () => {
    const tokens = extractNumbers('difference was significant (p < 0.001)');
    const pvalues = tokens.filter((t) => t.kind === 'pvalue');
    assert.equal(pvalues.length, 1);
    assert.equal(pvalues[0].value, 0.001);
    assert.equal(pvalues[0].cmp, '<');
    assert.equal(tokens.filter((t) => t.value === 0.001 && t.kind === 'plain').length, 0);
  });

  it('restores the leading zero AMA style drops', () => {
    const [p] = extractNumbers('P = .03');
    assert.equal(p.value, 0.03);
    assert.equal(p.cmp, '=');
  });

  it('marks percentages in both the English and Turkish word order', () => {
    assert.equal(extractNumbers('12.4%')[0].kind, 'percent');
    assert.equal(extractNumbers('%12,4')[0].kind, 'percent');
  });

  it('does not read an identifier as a number', () => {
    assert.equal(extractNumbers('COVID19 and H1N1').length, 0);
  });
});

describe('checkGrounding — rounding asymmetry', () => {
  const source = 'The age-adjusted rate rose to 2.22 per 100,000 in 2023.';

  it('accepts a figure that rounds a source number down in precision', () => {
    assert.deepEqual(ungrounded('AAMR 2.2', source), []);
    assert.deepEqual(ungrounded('AAMR 2', source), []);
  });

  it('rejects a figure that invents precision the source does not have', () => {
    // Source says 2.2; a figure claiming 2.22 has manufactured a digit.
    assert.deepEqual(ungrounded('AAMR 2.22', 'The rate rose to 2.2 in 2023.'), ['2.22']);
  });

  it('accepts a grouped number written either way', () => {
    const idx = 'Enrolled 1,378 patients across 9 studies.';
    assert.deepEqual(ungrounded('1,378 patients', idx), []);
    assert.deepEqual(ungrounded('1378 patients', idx), []);
  });

  it('flags a number that is simply not in the paper', () => {
    assert.deepEqual(ungrounded('2,431 patients', 'Enrolled 1,378 patients.'), ['2,431']);
  });
});

describe('checkGrounding — p-values', () => {
  it('matches the comparator, not just the value', () => {
    const source = 'The primary outcome differed (p < 0.001).';
    assert.deepEqual(ungrounded('p < 0.001', source), []);
    // Turning "p < 0.001" into "p = 0.001" states a precision the trial did not report.
    assert.deepEqual(ungrounded('p = 0.001', source), ['p = 0.001']);
  });

  it('accepts AMA style in the source and full style in the figure', () => {
    assert.deepEqual(ungrounded('p = 0.03', 'no difference (P = .03)'), []);
  });
});

describe('checkGrounding — ranges, percentages and conventions', () => {
  const source =
    'Mean difference −6.27 minutes (95% CI −16.96 to 4.42). Overall 37 of 298 (12.4%) had the event.';

  it('checks both bounds of a confidence interval', () => {
    assert.deepEqual(ungrounded('MD −6.27 (95% CI −16.96 to 4.42)', source), []);
    // One bound silently altered must not slip through.
    assert.deepEqual(ungrounded('MD −6.27 (95% CI −16.96 to 4.52)', source), ['4.52']);
  });

  it('treats the 95 in "95% CI" as a convention, not a finding', () => {
    assert.deepEqual(ungrounded('95% CI −16.96 to 4.42', source), []);
    // The same number outside a CI context still has to be grounded.
    assert.deepEqual(ungrounded('95 events', 'Only 12 events occurred.'), ['95']);
  });

  it('grounds a percentage against either the percentage or the bare number', () => {
    assert.deepEqual(ungrounded('12.4%', source), []);
    assert.deepEqual(ungrounded('12.4', source), []);
    assert.deepEqual(ungrounded('21.7%', source), ['21.7%']);
  });

  it('can accept a percentage derived from two counts, but only when asked', () => {
    const counts = 'Events occurred in 37 of 298 participants.';
    assert.deepEqual(ungrounded('12.4%', counts), ['12.4%']);
    assert.deepEqual(ungrounded('12.4%', counts, { allowDerivedPercent: true }), []);
  });

  it('handles a negative sign written as a unicode minus in either place', () => {
    assert.deepEqual(ungrounded('−582.83 mL', 'reduced by -582.83 mL'), []);
  });
});

describe('checkGrounding — reporting', () => {
  it('reports the path and quotes the field so the author can adjudicate', () => {
    const index = buildSourceIndex('Enrolled 1,378 patients.');
    const [issue] = checkGrounding(
      [{ path: 'panels[3].rows[0].value', text: 'MD −6.27 (95% CI −16.96 to 4.42)' }],
      index,
    );
    assert.equal(issue.path, 'panels[3].rows[0].value');
    assert.equal(issue.raw, '-6.27');
    assert.match(issue.context, /MD/);
  });

  it('reports one issue per distinct number per field', () => {
    const index = buildSourceIndex('nothing numeric here');
    const issues = checkGrounding([{ path: 'a', text: '5 and 5 and 5' }], index);
    assert.equal(issues.length, 1);
  });

  it('is silent when the figure carries no numbers at all', () => {
    const index = buildSourceIndex('Enrolled 1,378 patients.');
    assert.deepEqual(checkGrounding([{ path: 'a', text: 'Improved outcomes' }], index), []);
  });
});
