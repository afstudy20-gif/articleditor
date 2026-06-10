import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tiptapToBuildInput } from './to-export';
import type { Ref } from '@/store/types';

function ref(id: string, family: string, year: number): Ref {
  return {
    id,
    type: 'journal-article',
    authors: [{ family, given: 'A.' }],
    year,
    title: `Title ${family}`,
    containerTitle: 'J Test',
  };
}

function docWithCitations(ids: string[][]): unknown {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: ids.flatMap((group, i) => [
          { type: 'text', text: `claim ${i} ` },
          { type: 'citation', attrs: { refIds: group } },
        ]),
      },
    ],
  };
}

describe('tiptapToBuildInput marker/bibliography consistency', () => {
  // Cited order: Zeta, Alpha, Mid — alphabetical order differs from citation order.
  const rZ = ref('rz', 'Zeta', 2020);
  const rA = ref('ra', 'Alpha', 2021);
  const rM = ref('rm', 'Mid', 2022);
  const refsById = new Map([['rz', rZ], ['ra', rA], ['rm', rM]]);
  const refOrder = new Map([['rz', 1], ['ra', 2], ['rm', 3]]);
  const doc = docWithCitations([['rz'], ['ra'], ['rm']]);

  it('vancouver: numbers follow citation order', () => {
    const out = tiptapToBuildInput(doc, refsById, refOrder, 'vancouver');
    assert.deepEqual(out.orderedRefs.map((r) => r.id), ['rz', 'ra', 'rm']);
    assert.deepEqual(out.markers.map((m) => m.refNumbers), [[1], [2], [3]]);
  });

  it('apa: marker numbers resolve to the correct ref in the sorted bibliography', () => {
    const out = tiptapToBuildInput(doc, refsById, refOrder, 'apa');
    // APA bibliography is alphabetical: Alpha, Mid, Zeta
    assert.deepEqual(out.orderedRefs.map((r) => r.id), ['ra', 'rm', 'rz']);
    // First citation in text is Zeta → must point at position 3 in the
    // sorted bibliography, NOT citation-order position 1.
    for (const m of out.markers) {
      for (const n of m.refNumbers) {
        const resolved = out.orderedRefs[n - 1];
        assert.ok(resolved, `marker number ${n} resolves`);
      }
    }
    assert.deepEqual(out.markers.map((m) => m.refNumbers), [[3], [1], [2]]);
    // Cross-check: resolving the first marker yields Zeta (the ref actually cited).
    const first = out.markers[0];
    assert.equal(out.orderedRefs[first.refNumbers[0] - 1].id, 'rz');
  });
});
