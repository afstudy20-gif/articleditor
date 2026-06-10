import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  incrementStringPart,
  getNextNumbering,
  isNumberingPrefix
} from './numbering';

test('isNumberingPrefix', () => {
  assert.equal(isNumberingPrefix('1'), true);
  assert.equal(isNumberingPrefix('1.1'), true);
  assert.equal(isNumberingPrefix('A1'), true);
  assert.equal(isNumberingPrefix('1.a'), true);
  assert.equal(isNumberingPrefix('I'), true);
  assert.equal(isNumberingPrefix('iv'), true);
  
  // Non-numbering
  assert.equal(isNumberingPrefix('Introduction'), false);
  assert.equal(isNumberingPrefix('Methodology'), false);
});

test('incrementStringPart', () => {
  assert.equal(incrementStringPart('1'), '2');
  assert.equal(incrementStringPart('9'), '10');
  assert.equal(incrementStringPart('a'), 'b');
  assert.equal(incrementStringPart('z'), 'aa');
  assert.equal(incrementStringPart('A'), 'B');
  assert.equal(incrementStringPart('Z'), 'AA');
  assert.equal(incrementStringPart('i'), 'ii');
  assert.equal(incrementStringPart('iv'), 'v');
  assert.equal(incrementStringPart('IX'), 'X');
});

test('getNextNumbering - various prefixes', () => {
  // 1.a -> 1.b
  const res1 = getNextNumbering('1.a. Introduction');
  assert.ok(res1);
  assert.equal(res1.next, '1.b. ');
  assert.equal(res1.nextSub, '1.a.1. ');

  // A1 -> A2
  const res2 = getNextNumbering('A1. Title');
  assert.ok(res2);
  assert.equal(res2.next, 'A2. ');
  assert.equal(res2.nextSub, 'A1.1. ');

  // 1.1 -> 1.2
  const res3 = getNextNumbering('1.1. Section');
  assert.ok(res3);
  assert.equal(res3.next, '1.2. ');
  assert.equal(res3.nextSub, '1.1.1. ');

  // I -> II
  const res4 = getNextNumbering('I) Heading');
  assert.ok(res4);
  assert.equal(res4.next, 'II) ');
  assert.equal(res4.nextSub, 'I.1) ');
});
