import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokenize, createCheckerFromBuffers, SpellChecker } from './spellcheck';

// Load the real bundled dictionaries for integration tests.
const PUBLIC = resolve(process.cwd(), 'public/dictionaries');
const enAff = readFileSync(`${PUBLIC}/en-US.aff`, 'utf-8');
const enDic = readFileSync(`${PUBLIC}/en-US.dic`, 'utf-8');
const enGbAff = readFileSync(`${PUBLIC}/en-GB.aff`, 'utf-8');
const enGbDic = readFileSync(`${PUBLIC}/en-GB.dic`, 'utf-8');
const trAff = readFileSync(`${PUBLIC}/tr.aff`, 'utf-8');
const trDic = readFileSync(`${PUBLIC}/tr.dic`, 'utf-8');

const enChecker = createCheckerFromBuffers(enAff, enDic);
const enGbChecker = createCheckerFromBuffers(enGbAff, enGbDic);
const trChecker = createCheckerFromBuffers(trAff, trDic);

describe('tokenize', () => {
  it('extracts words with absolute offsets', () => {
    const tokens = tokenize('hello world');
    assert.deepEqual(
      tokens.map((t) => ({ w: t.word, s: t.start, e: t.end })),
      [
        { w: 'hello', s: 0, e: 5 },
        { w: 'world', s: 6, e: 11 },
      ],
    );
  });

  it('keeps Turkish letters intact', () => {
    const tokens = tokenize('ÇMS ve İSS kullanıldı');
    const words = tokens.map((t) => t.word);
    assert.ok(words.includes('ÇMS'));
    assert.ok(words.includes('kullanıldı'));
  });

  it('skips numbers and single letters', () => {
    const tokens = tokenize('see 12 x and a test');
    const words = tokens.map((t) => t.word);
    assert.ok(!words.includes('12'));
    assert.ok(!words.includes('x'));
    assert.ok(!words.includes('a'));
    assert.ok(words.includes('see'));
    assert.ok(words.includes('test'));
  });

  it('offsets are correct after punctuation', () => {
    const text = 'word, then!';
    const tokens = tokenize(text);
    assert.equal(tokens[0].word, 'word');
    assert.equal(text.slice(tokens[0].start, tokens[0].end), 'word');
    assert.equal(tokens[1].word, 'then');
    assert.equal(text.slice(tokens[1].start, tokens[1].end), 'then');
  });
});

describe('SpellChecker (English)', () => {
  it('flags a misspelled word and suggests corrections', () => {
    const issues = enChecker.check('this is a teest of the system');
    const teest = issues.find((i) => i.quote === 'teest');
    assert.ok(teest, 'expected "teest" to be flagged');
    assert.ok(teest!.suggestions.length > 0);
    assert.ok(teest!.suggestions.includes('test'));
  });

  it('does not flag correctly spelled words', () => {
    const issues = enChecker.check('the quick brown fox jumps over the lazy dog');
    assert.equal(issues.length, 0);
  });

  it('treats capitalised sentence-initial words as correct', () => {
    const issues = enChecker.check('This is correct.');
    assert.equal(issues.length, 0);
  });

  it('does not flag common acronyms (2-4 upper-case letters)', () => {
    const issues = enChecker.check('The MRI showed changes in the USA yesterday.');
    // MRI and USA should be skipped as acronym noise.
    assert.ok(!issues.some((i) => i.quote === 'MRI' || i.quote === 'USA'));
  });

  it('respects ignored words', () => {
    enChecker.ignore('supercalifragilistic');
    const issues = enChecker.check('supercalifragilistic is a word');
    assert.ok(!issues.some((i) => i.quote === 'supercalifragilistic'));
  });
});

describe('SpellChecker (English variants)', () => {
  it('keeps American and British spelling variants separate', () => {
    assert.equal(enChecker.check('color analyze center behavior').length, 0);
    assert.equal(enGbChecker.check('colour analyse centre behaviour').length, 0);

    assert.ok(enChecker.check('colour analyse centre behaviour').some((issue) => issue.quote === 'colour'));
    assert.ok(enGbChecker.check('color analyze center behavior').some((issue) => issue.quote === 'color'));
  });
});

describe('SpellChecker (Turkish)', () => {
  it('flags a misspelled Turkish word', () => {
    const issues = trChecker.check('merhba dünya');
    assert.ok(issues.some((i) => i.quote === 'merhba'));
  });

  it('does not flag correctly spelled Turkish words', () => {
    const issues = trChecker.check('merhaba dünya');
    assert.equal(issues.length, 0);
  });

  it('recognises agglutinative suffixed forms', () => {
    // A real Turkish root with a common suffix should pass.
    const issues = trChecker.check('hastalarda bulgular görüldü');
    const flagged = issues.map((i) => i.quote);
    assert.ok(!flagged.includes('hastalarda'), `hastalarda flagged but should be OK via affixes`);
  });

  it('keeps Turkish letters intact in offsets', () => {
    const text = 'gözlem yapıldı';
    const issues = trChecker.check(text);
    for (const issue of issues) {
      assert.equal(text.slice(issue.start, issue.end), issue.quote);
    }
  });
});
