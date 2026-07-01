import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectMarkers, normalizeSuperscripts } from './detect';

describe('normalizeSuperscripts', () => {
  it('converts citation superscripts after punctuation to brackets', () => {
    assert.equal(normalizeSuperscripts('dysfunction.²³ Coronary'), 'dysfunction.[23] Coronary');
    assert.equal(normalizeSuperscripts('no-reflow,⁹ and'), 'no-reflow,[9] and');
  });

  it('converts a multi-digit superscript stuck to a word (real citation)', () => {
    assert.equal(normalizeSuperscripts('atherosclerosis³²,'), 'atherosclerosis[32],');
  });

  it('leaves units and exponents alone', () => {
    // eGFR unit m² — lone ² after a letter.
    assert.equal(normalizeSuperscripts('1.73 m², Mean'), '1.73 m², Mean');
    // Scientific notation 10⁹/L — superscript after a digit.
    assert.equal(normalizeSuperscripts('count ×10⁹/L'), 'count ×10⁹/L');
  });
});

describe('detectMarkers', () => {
  it('expands comma lists and dash ranges inside brackets', () => {
    const occ = detectMarkers('primary PCI.[6,7] and later [9–11].');
    const nums = occ.flatMap((o) => o.refNumbers);
    assert.deepEqual(nums, [6, 7, 9, 10, 11]);
  });

  it('expands comma lists and dash ranges inside parentheses', () => {
    const occ = detectMarkers('primary PCI (4-6), stenting (8; 10).');
    const nums = occ.flatMap((o) => o.refNumbers);
    assert.deepEqual(nums, [4, 5, 6, 8, 10]);
  });

  it('detects citations written as literal superscript characters', () => {
    const occ = detectMarkers('no-reflow.¹¹ Platelets');
    assert.deepEqual(occ[0]?.refNumbers, [11]);
  });

  it('keeps original indexes when multiple superscript citations are normalized', () => {
    const text = 'death and disability¹. Because PCI is preferred ².';
    const occ = detectMarkers(text);
    assert.deepEqual(occ.map((o) => o.refNumbers), [[1], [2]]);
    assert.equal(text.slice(occ[0].startIndex, occ[0].endIndex), '¹');
    assert.equal(text.slice(occ[1].startIndex, occ[1].endIndex), '²');
  });

  it('detects numeric superscripts flattened to baseline text', () => {
    const text = 'PCI has become the reperfusion strategy of choice 2.';
    const occ = detectMarkers(text);
    assert.deepEqual(occ.map((o) => o.refNumbers), [[2]]);
    assert.equal(text.slice(occ[0].startIndex, occ[0].endIndex), '2');
  });

  it('does not treat the m² unit as a citation', () => {
    assert.equal(detectMarkers('eGFR 1.73 m² at baseline').length, 0);
  });

  it('does not treat common statistics as flattened citations', () => {
    const text = 'OR 1.033, 95% CI 1.021-1.045, P < 0.001; no-reflow developed in 72 of 884 patients.';
    assert.equal(detectMarkers(text).length, 0);
  });

  it('does not treat IQR / measurement bracket ranges as citations', () => {
    // median age 61 [49–63] — value precedes the bracket range
    const t1 = 'median age 61 [IQR 53–70] vs 55 [49–63] vs 54 [45–63] years; p<0.001';
    assert.equal(detectMarkers(t1).length, 0, 'median + IQR ranges');

    // 83 [71–92] mg/dL — unit follows the bracket range
    const t2 = 'LDL-C was 83 [71–92] mg/dL in the first group [2].';
    const m2 = detectMarkers(t2);
    assert.equal(m2.length, 1, 'only the real citation kept');
    assert.deepEqual(m2[0]?.refNumbers, [2]);

    // "ranged from [40–50]" — range keyword
    const t3 = 'Ages ranged from [40–50] in group one [3,4].';
    const m3 = detectMarkers(t3);
    assert.equal(m3.length, 1, 'only the real citation kept');
    assert.deepEqual(m3[0]?.refNumbers, [3, 4]);
  });
});
