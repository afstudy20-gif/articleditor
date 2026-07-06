import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import { formatBibEntry, formatInTextCitation, isBuiltinStyle, styleLabel } from './styles';

function ref(overrides: Partial<Ref>): Ref {
  return {
    id: 'r1',
    type: 'journal-article',
    authors: [],
    ...overrides,
  } as Ref;
}

const AUTHORS = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ family: `Fam${i + 1}`, given: `G${i + 1}` }));

const STYLES = ['vancouver', 'apa', 'ama', 'ieee'] as const;

describe('formatBibEntry edge cases', () => {
  it('never emits "undefined" or "null" for sparse refs', () => {
    const sparse = [
      ref({ title: 'Only a title' }),
      ref({ authors: AUTHORS(1), year: 2020 }),
      ref({ authors: AUTHORS(2), title: 'No year or journal' }),
      ref({}),
    ];
    for (const style of STYLES) {
      for (const r of sparse) {
        const out = formatBibEntry(style, r, 1);
        assert.ok(typeof out === 'string');
        assert.ok(!/\bundefined\b|\bnull\b/.test(out), `${style}: "${out}"`);
      }
    }
  });

  it('applies et-al truncation for many authors', () => {
    const many = ref({ authors: AUTHORS(12), title: 'Big collaboration', year: 2021 });
    const vancouver = formatBibEntry('vancouver', many, 1);
    assert.ok(/et al/i.test(vancouver), vancouver);
    assert.ok(!vancouver.includes('Fam12'), 'Vancouver should truncate the author list');
    const apa = formatBibEntry('apa', many, 1);
    assert.ok(!/\bundefined\b/.test(apa));
  });

  it('keeps all authors when at or under the style limit', () => {
    const few = ref({ authors: AUTHORS(3), title: 'Small team', year: 2022 });
    const out = formatBibEntry('vancouver', few, 1);
    assert.ok(out.includes('Fam1'));
    assert.ok(out.includes('Fam3'));
    assert.ok(!/et al/i.test(out));
  });
});

describe('formatInTextCitation', () => {
  it('collapses consecutive numbers into ranges for numeric styles', () => {
    const refs = AUTHORS(3).map((a, i) => ref({ id: `r${i}`, authors: [a], year: 2020 }));
    const out = formatInTextCitation('vancouver', refs, [1, 2, 3]);
    assert.ok(/1[-–]3/.test(out), out);
  });

  it('renders non-consecutive numbers as a list', () => {
    const refs = [ref({ id: 'a' }), ref({ id: 'b' })];
    const out = formatInTextCitation('vancouver', refs, [1, 3]);
    assert.ok(out.includes('1'));
    assert.ok(out.includes('3'));
    assert.ok(!/1[-–]3/.test(out));
  });

  it('APA renders author-year, with fallback for missing data', () => {
    const out = formatInTextCitation('apa', [ref({ authors: AUTHORS(1), year: 2020 })], [1]);
    assert.ok(out.includes('2020'), out);
    const noData = formatInTextCitation('apa', [ref({})], [1]);
    assert.ok(!/\bundefined\b|\bnull\b/.test(noData), noData);
  });
});

describe('style registry helpers', () => {
  it('recognizes built-in ids and labels them', () => {
    for (const s of STYLES) {
      assert.ok(isBuiltinStyle(s));
      assert.ok(styleLabel(s).length > 0);
    }
    assert.equal(isBuiltinStyle('my-custom'), false);
  });
});
