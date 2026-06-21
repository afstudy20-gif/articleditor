import assert from 'node:assert/strict';
import test from 'node:test';
import { scanMedicalStatistics } from './medical-reporting';

test('flags p = 0.000 and suggests p < 0.001', () => {
  const issues = scanMedicalStatistics('Mortality was lower in the intervention group (p = 0.000).');
  const issue = issues.find((item) => item.code === 'p-zero');

  assert.ok(issue);
  assert.equal(issue?.replacement, 'p < 0.001');
});

test('flags effect estimates that omit confidence intervals', () => {
  const issues = scanMedicalStatistics('Treatment was associated with mortality (HR 1.42, p = 0.03).');

  assert.ok(issues.some((item) => item.code === 'effect-ci'));
});

test('does not flag an effect estimate with a confidence interval', () => {
  const issues = scanMedicalStatistics(
    'Treatment was associated with mortality (HR 1.42, 95% CI 1.10–1.84; p = 0.006).',
  );

  assert.ok(!issues.some((item) => item.code === 'effect-ci'));
});

test('flags percentages without a numerator or denominator', () => {
  const issues = scanMedicalStatistics('Adverse events occurred in 18% of participants.');

  assert.ok(issues.some((item) => item.code === 'percent-denominator'));
});

test('accepts percentages accompanied by counts', () => {
  const issues = scanMedicalStatistics('Adverse events occurred in 18% (18/100) of participants.');

  assert.ok(!issues.some((item) => item.code === 'percent-denominator'));
});

test('accepts p = 1 but flags values above 1', () => {
  const issues = scanMedicalStatistics(
    'The first comparison had p = 1, whereas the second had p = 1.2.',
  );
  const rangeIssues = issues.filter((item) => item.code === 'p-range');

  assert.equal(rangeIssues.length, 1);
  assert.equal(rangeIssues[0]?.quote, 'p = 1.2');
});

test('flags missing leading zero in p values with a clean replacement', () => {
  // Regression: the replacement used to be garbage ("p = 0P=.005") because the
  // letter-case "P" wasn't stripped and a literal "p = 0" was prepended.
  const cases: Array<[string, string, string]> = [
    ['P = .005', 'P = .005', 'P = 0.005'],
    ['p = .04', 'p = .04', 'p = 0.04'],
    ['p=.34', 'p=.34', 'p=0.34'],
  ];
  for (const [text, quote, expectedReplacement] of cases) {
    const issues = scanMedicalStatistics(text);
    const issue = issues.find((item) => item.code === 'p-leading-zero');
    assert.ok(issue, `expected p-leading-zero issue for "${text}"`);
    assert.equal(issue?.quote, quote);
    assert.equal(issue?.replacement, expectedReplacement);
  }
});
