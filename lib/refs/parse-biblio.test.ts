/**
 * Tests for the bibliography parser guards.
 *
 * Runs on Node's built-in test runner (no extra dependency) via the `tsx`
 * loader that is already a devDependency:
 *
 *   npm test                       # runs every test under lib/
 *   node --import tsx --test lib/refs/parse-biblio.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitBodyAndBiblio,
  parseBiblioLines,
  parseRefLine,
  MAX_REF_LINE_LENGTH,
  MAX_BIBLIO_LINES,
} from './parse-biblio';

describe('parseRefLine', () => {
  it('parses a well-formed Vancouver reference with reasonable confidence', () => {
    const line = '1. Smith JA, Doe RB. Effects of sleep on memory. Nature. 2019;15(3):123-130.';
    const { ref, confidence } = parseRefLine(line, 'r1');

    assert.equal(ref.year, 2019);
    assert.ok(ref.authors.length > 0);
    assert.ok(ref.title);
    // year + authors + title (+ journal) should clear the low-confidence bar.
    assert.ok(confidence >= 0.4);
    assert.equal(ref.confidence, confidence);
  });

  it('captures a DOI', () => {
    const line = '2. Lee CD, Park E. Neural correlates. Brain. 2020;10:1-9. doi:10.1000/abcd.123';
    const { ref } = parseRefLine(line, 'r2');
    assert.equal(ref.doi, '10.1000/abcd.123');
  });

  it('flags a reference with no author and no year as low confidence', () => {
    const line = '3. some untitled fragment with no recognizable metadata';
    const { ref, confidence } = parseRefLine(line, 'r3');

    assert.equal(ref.authors.length, 0);
    assert.equal(ref.year, undefined);
    assert.ok(confidence < 0.4);
    assert.ok((ref.confidence ?? 1) < 0.4);
  });

  it('does not hang and returns low confidence on an extremely long line', () => {
    const line = '1. ' + 'x'.repeat(5000);
    const start = Date.now();
    const { ref, confidence } = parseRefLine(line, 'r1');
    const elapsed = Date.now() - start;

    // Guard must short-circuit: bounded work, low confidence, clamped raw.
    assert.ok(elapsed < 1000);
    assert.equal(confidence, 0);
    assert.equal(ref.confidence, 0);
    assert.ok((ref.raw ?? '').length <= MAX_REF_LINE_LENGTH);
  });

  it('preserves correct-path behaviour for a line near the length budget', () => {
    const padding = 'a'.repeat(MAX_REF_LINE_LENGTH - 60);
    const line = `1. Smith JA. ${padding}. Nature. 2018;1:1-2.`.slice(0, MAX_REF_LINE_LENGTH);
    const { ref } = parseRefLine(line, 'r1');
    assert.ok((ref.confidence ?? 0) > 0);
  });
});

describe('parseBiblioLines', () => {
  it('parses a 3-reference numbered bibliography with no low-confidence entries', () => {
    const lines = [
      '1. Smith JA, Doe RB. Effects of sleep on memory. Nature. 2019;15(3):123-130.',
      '2. Lee CD, Park E. Neural correlates of attention. Science. 2020;5(1):10-20.',
      '3. Brown K, White L. A study of cognition. Cell. 2021;3(2):44-55.',
    ];
    const result = parseBiblioLines(lines);

    assert.equal(result.refs.length, 3);
    assert.equal(result.truncated, false);
    assert.equal(result.truncatedLineCount, 0);
    assert.deepEqual(result.lowConfidence, []);
    assert.ok(result.refs.every((r) => typeof r.confidence === 'number'));
  });

  it('records weak references in lowConfidence', () => {
    const lines = [
      '1. Smith JA, Doe RB. Effects of sleep on memory. Nature. 2019;15(3):123-130.',
      '2. nondescript line without any usable citation metadata at all',
    ];
    const { lowConfidence } = parseBiblioLines(lines);
    assert.ok(lowConfidence.includes(1));
    assert.ok(!lowConfidence.includes(0));
  });

  it('surfaces truncation for oversized input without crashing', () => {
    const oversized = Array.from(
      { length: MAX_BIBLIO_LINES + 1000 },
      (_, i) => `${i + 1}. Author A. Title ${i}. Journal. 2020;1:1-2.`,
    );
    const result = parseBiblioLines(oversized);

    assert.equal(result.refs.length, MAX_BIBLIO_LINES);
    assert.equal(result.truncated, true);
    assert.equal(result.truncatedLineCount, 1000);
  });

  it('does not mutate the input array', () => {
    const lines = [
      '1. Smith JA. A title. Nature. 2019;1:1-2.',
      '2. Doe RB. Another. Science. 2020;2:3-4.',
    ];
    const snapshot = [...lines];
    parseBiblioLines(lines);
    assert.deepEqual(lines, snapshot);
  });

  it('returns empty refs for an empty array', () => {
    const result = parseBiblioLines([]);
    assert.deepEqual(result.refs, []);
    assert.deepEqual(result.lowConfidence, []);
    assert.equal(result.truncated, false);
  });
});

describe('splitBodyAndBiblio', () => {
  it('splits body from a References heading and groups numbered refs', () => {
    const text = [
      'This is the body of the paper.',
      'It has several sentences of content.',
      '',
      'References',
      '1. Smith JA, Doe RB. Effects of sleep on memory. Nature. 2019;15(3):123-130.',
      '2. Lee CD, Park E. Neural correlates of attention. Science. 2020;5(1):10-20.',
      '3. Brown K, White L. A study of cognition. Cell. 2021;3(2):44-55.',
    ].join('\n');

    const split = splitBodyAndBiblio(text);

    assert.ok(split.bodyText.includes('body of the paper'));
    assert.ok(!split.bodyText.includes('Smith JA'));
    assert.equal(split.refLines.length, 3);
    assert.equal(split.headingFound?.toLowerCase(), 'references');
    assert.equal(split.truncated, false);
  });

  it('returns empty refLines and full body when no bibliography is present', () => {
    const text = 'Just a body paragraph with no references section.';
    const split = splitBodyAndBiblio(text);
    assert.deepEqual(split.refLines, []);
    assert.equal(split.bodyText, text);
  });

  it('handles empty and whitespace-only input without throwing', () => {
    for (const input of ['', '   ', '\n\n\t  \n']) {
      const split = splitBodyAndBiblio(input);
      assert.deepEqual(split.refLines, []);
      const parsed = parseBiblioLines(split.refLines);
      assert.deepEqual(parsed.refs, []);
    }
  });

  it('surfaces truncation when the bibliography exceeds the line cap', () => {
    const refs = Array.from(
      { length: MAX_BIBLIO_LINES + 500 },
      (_, i) => `${i + 1}. Author A. Title ${i}. Journal. 2020;1:1-2.`,
    );
    const text = ['Body text here.', 'References', ...refs].join('\n');

    const split = splitBodyAndBiblio(text);

    assert.equal(split.truncated, true);
    assert.equal(split.truncatedLineCount, 500);
    assert.ok(split.refLines.length <= MAX_BIBLIO_LINES);
  });

  it('does not hang when a single reference line is pathologically long', () => {
    const longRef = '1. ' + 'x'.repeat(MAX_REF_LINE_LENGTH * 3);
    const text = ['Body.', 'References', longRef, '2. Smith JA. T. N. 2019;1:1-2.'].join('\n');

    const start = Date.now();
    const split = splitBodyAndBiblio(text);
    const parsed = parseBiblioLines(split.refLines);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 2000);
    assert.ok(parsed.refs.length > 0);
  });

  it('stops bibliography extraction when meeting a table stop pattern', () => {
    const text = [
      'Body text.',
      'References',
      '1. Smith JA. Title. Nature. 2019;1:1-2.',
      '2. Lee CD. Title. Science. 2020;2:3-4.',
      '',
      'Table 1',
      'Variable Group A\tVariable Group B',
      'Value 1\tValue 2',
    ].join('\n');

    const split = splitBodyAndBiblio(text);
    assert.equal(split.refLines.length, 2);
    assert.ok(split.refLines[0].includes('Smith JA'));
    assert.ok(split.refLines[1].includes('Lee CD'));
    assert.ok(!split.refLines.some(l => l.includes('Variable Group')));
  });
});
