import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAcronymMatch,
  findExactDefinition,
  extractAbbreviations,
  findSuggestions
} from './abbreviations';

describe('isAcronymMatch', () => {
  it('matches standard acronyms', () => {
    assert.equal(isAcronymMatch('AI', 'Artificial Intelligence'), true);
    assert.equal(isAcronymMatch('DNN', 'Deep Neural Network'), true);
    assert.equal(isAcronymMatch('WHO', 'World Health Organization'), true);
  });

  it('matches acronyms with stopwords', () => {
    assert.equal(isAcronymMatch('WWW', 'World Wide Web'), true);
    assert.equal(isAcronymMatch('WHOUN', 'World Health Organization of the United Nations'), true);
  });

  it('matches single-word acronyms in-order', () => {
    assert.equal(isAcronymMatch('EEG', 'electroencephalogram'), true);
    assert.equal(isAcronymMatch('MRI', 'magnetic resonance imaging'), true); // multi-word
  });

  it('returns false for mismatches', () => {
    assert.equal(isAcronymMatch('XYZ', 'Artificial Intelligence'), false);
    assert.equal(isAcronymMatch('ABC', 'Deep Neural Network'), false);
  });
});

describe('findExactDefinition', () => {
  it('extracts correct definitions walking backwards', () => {
    assert.equal(findExactDefinition('DNN', 'We used a Deep Neural Network'), 'Deep Neural Network');
    assert.equal(
      findExactDefinition('WHOUN', 'collaboration with the World Health Organization of the United Nations'),
      'World Health Organization of the United Nations'
    );
  });

  it('returns fallback matches', () => {
    assert.equal(findExactDefinition('EEG', 'an electroencephalogram'), 'electroencephalogram');
  });

  it('returns null on mismatch', () => {
    assert.equal(findExactDefinition('XYZ', 'We used a Deep Neural Network'), null);
  });
});

describe('extractAbbreviations', () => {
  it('finds and counts defined abbreviations', () => {
    const text = `
      First, we introduce the Deep Neural Network (DNN) model.
      Then, the DNN calculates weights. We used another DNN.
      However, we did not define Artificial Intelligence (AI) yet.
    `;
    const list = extractAbbreviations(text);
    assert.equal(list.length, 2);

    const dnn = list.find((item) => item.acronym === 'DNN');
    assert.ok(dnn);
    assert.equal(dnn.definition, 'Deep Neural Network');
    assert.equal(dnn.count, 3);

    const ai = list.find((item) => item.acronym === 'AI');
    assert.ok(ai);
    assert.equal(ai.definition, 'Artificial Intelligence');
    assert.equal(ai.count, 1);
  });
});

describe('findSuggestions', () => {
  it('flags full definition usages without the acronym', () => {
    const text = `
      First, we define Deep Neural Network (DNN).
      In Section 2, we discuss the Deep Neural Network algorithm.
      Finally, we run the DNN.
    `;
    const abbreviations = [
      { acronym: 'DNN', definition: 'Deep Neural Network', count: 1 }
    ];

    const suggestions = findSuggestions(text, abbreviations);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].acronym, 'DNN');
    assert.equal(suggestions[0].definition, 'Deep Neural Network');
  });
});
