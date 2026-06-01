import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhrasebankText } from './parse';

test('parsePhrasebankText detects categories and phrases', () => {
  const categories = parsePhrasebankText(`
Introducing Work
Establishing the importance of the topic
The aim of this study is to examine the relationship between sleep and cognition.
This paper presents a new approach to clinical decision support.

Being Cautious
Highlighting uncertainty in findings
These findings may be interpreted with some caution.
It is possible that the observed effect was influenced by baseline differences.
`);

  assert.deepEqual(
    categories.map((cat) => cat.name),
    ['Introducing Work: Establishing The Importance Of The Topic', 'Being Cautious: Highlighting Uncertainty In Findings'],
  );
  assert.equal(categories[0].phrases.length, 2);
  assert.match(categories[1].phrases[0].id, /^phrase_/);
});
