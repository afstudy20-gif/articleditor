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

  it('detects citations written as literal superscript characters', () => {
    const occ = detectMarkers('no-reflow.¹¹ Platelets');
    assert.deepEqual(occ[0]?.refNumbers, [11]);
  });

  it('does not treat the m² unit as a citation', () => {
    assert.equal(detectMarkers('eGFR 1.73 m² at baseline').length, 0);
  });
});
