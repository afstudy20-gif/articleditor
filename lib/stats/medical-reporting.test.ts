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
