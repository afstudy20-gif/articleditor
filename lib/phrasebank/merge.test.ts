import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCategories, mergePhrases, normalizeCategoryName } from './merge';
import type { Phrase, PhraseCategory } from '@/store/types';

function phrase(text: string, id = text): Phrase {
  return { id, text, category: 'c' };
}

function category(name: string, phrases: Phrase[], id = name): PhraseCategory {
  return { id, name, phrases };
}

describe('normalizeCategoryName', () => {
  it('lowercases and collapses whitespace', () => {
    assert.equal(normalizeCategoryName('Introducing  Work'), 'introducing work');
    assert.equal(normalizeCategoryName('  Results '), 'results');
    assert.equal(normalizeCategoryName('Methods'), 'methods');
  });
});

describe('mergePhrases', () => {
  it('concatenates and dedupes case-insensitively, base first', () => {
    const merged = mergePhrases([phrase('A key aspect'), phrase('Notable point')], [
      phrase('A KEY ASPECT'),
      phrase('New insight'),
    ]);
    assert.deepEqual(
      merged.map((p) => p.text),
      ['A key aspect', 'Notable point', 'New insight'],
    );
  });

  it('handles empty/undefined inputs', () => {
    assert.deepEqual(mergePhrases(undefined, undefined), []);
    assert.equal(mergePhrases([phrase('x')], undefined).length, 1);
    assert.equal(mergePhrases(undefined, [phrase('y')]).length, 1);
  });

  it('does not mutate its inputs', () => {
    const base = [phrase('a')];
    const incoming = [phrase('b')];
    mergePhrases(base, incoming);
    assert.equal(base.length, 1);
    assert.equal(incoming.length, 1);
  });
});

describe('mergeCategories', () => {
  it('merges phrases into matching categories (case/space-insensitive)', () => {
    const base = [category('Introducing Work', [phrase('A key aspect')])];
    const incoming = [category('introducing  work', [phrase('Another angle')])];
    const merged = mergeCategories(base, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, 'Introducing Work');
    assert.deepEqual(
      merged[0].phrases.map((p) => p.text),
      ['A key aspect', 'Another angle'],
    );
  });

  it('appends unique categories: base first, then incoming', () => {
    const base = [category('Methods', [phrase('We sampled')])];
    const incoming = [category('Results', [phrase('We found')])];
    const merged = mergeCategories(base, incoming);
    assert.deepEqual(
      merged.map((c) => c.name),
      ['Methods', 'Results'],
    );
  });

  it('dedupes phrases across base and incoming in shared categories', () => {
    const base = [category('Results', [phrase('Increased')])];
    const incoming = [category('results', [phrase('Increased'), phrase('Decreased')])];
    const merged = mergeCategories(base, incoming);
    assert.equal(merged.length, 1);
    assert.deepEqual(
      merged[0].phrases.map((p) => p.text),
      ['Increased', 'Decreased'],
    );
  });

  it('handles empty/undefined inputs without throwing', () => {
    assert.deepEqual(mergeCategories(undefined, undefined), []);
    assert.equal(mergeCategories([category('A', [])], undefined).length, 1);
  });

  it('does not mutate its inputs', () => {
    const base = [category('Methods', [phrase('x')])];
    const incoming = [category('methods', [phrase('y')])];
    mergeCategories(base, incoming);
    assert.equal(base[0].phrases.length, 1);
    assert.equal(incoming[0].phrases.length, 1);
  });

  it('merges with an empty base (incoming becomes the result)', () => {
    const incoming = [category('Custom', [phrase('only')])];
    const merged = mergeCategories([], incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].name, 'Custom');
  });
});
