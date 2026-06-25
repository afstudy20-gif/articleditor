import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countWords, splitAbstractFromParagraphs, splitAbstractMetadataFromParagraphs } from './abstract';
import type { ImportParagraph } from './import-rich';

function paragraph(text: string, style?: string): ImportParagraph {
  return { text, style };
}

describe('splitAbstractFromParagraphs', () => {
  it('extracts a headed abstract and removes it from body paragraphs', () => {
    const out = splitAbstractFromParagraphs([
      paragraph('Title', 'Heading1'),
      paragraph('Abstract', 'Heading2'),
      paragraph('Background: Platelets matter.'),
      paragraph('Methods', 'Heading2'),
      paragraph('We studied STEMI.'),
    ]);

    assert.equal(out.abstractText, 'Background: Platelets matter.');
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Title', 'Methods', 'We studied STEMI.']);
  });

  it('extracts an inline abstract label', () => {
    const out = splitAbstractFromParagraphs([
      paragraph('Abstract: A concise summary.'),
      paragraph('Introduction'),
      paragraph('Main body.'),
    ]);

    assert.equal(out.abstractText, 'A concise summary.');
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Introduction', 'Main body.']);
  });
});

describe('splitAbstractMetadataFromParagraphs', () => {
  it('extracts keywords after the abstract and removes them from body paragraphs', () => {
    const out = splitAbstractMetadataFromParagraphs([
      paragraph('Title', 'Heading1'),
      paragraph('Abstract', 'Heading2'),
      paragraph('Platelet activation was associated with no-reflow.'),
      paragraph('Keywords: Blood Platelets; Myocardial Infarction; No-Reflow Phenomenon'),
      paragraph('Introduction', 'Heading2'),
      paragraph('Main body.'),
    ]);

    assert.equal(out.abstractText, 'Platelet activation was associated with no-reflow.');
    assert.deepEqual(out.keywords, ['Blood Platelets', 'Myocardial Infarction', 'No-Reflow Phenomenon']);
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Title', 'Introduction', 'Main body.']);
  });

  it('keeps structured abstract subheadings inside the abstract', () => {
    const out = splitAbstractMetadataFromParagraphs([
      paragraph('Title', 'Heading1'),
      paragraph('Abstract', 'Heading2'),
      paragraph('Background: Primary PCI outcomes depend on rapid reperfusion.'),
      paragraph('Results: No-reflow developed in 72 of 884 patients.'),
      paragraph('Conclusion: MPV-based modification discriminated no-reflow.'),
      paragraph('Keywords: no-reflow; STEMI'),
      paragraph('Introduction'),
      paragraph('Main body.'),
    ]);

    assert.equal(
      out.abstractText,
      [
        'Background: Primary PCI outcomes depend on rapid reperfusion.',
        'Results: No-reflow developed in 72 of 884 patients.',
        'Conclusion: MPV-based modification discriminated no-reflow.',
      ].join('\n\n'),
    );
    assert.deepEqual(out.keywords, ['no-reflow', 'STEMI']);
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Title', 'Introduction', 'Main body.']);
  });

  it('extracts keyword-only metadata without an abstract section', () => {
    const out = splitAbstractMetadataFromParagraphs([
      paragraph('Keywords'),
      paragraph('ST Elevation Myocardial Infarction; Angioplasty'),
      paragraph('Introduction', 'Heading2'),
      paragraph('Main body.'),
    ]);

    assert.equal(out.abstractText, '');
    assert.deepEqual(out.keywords, ['ST Elevation Myocardial Infarction', 'Angioplasty']);
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Introduction', 'Main body.']);
  });

  it('extracts inline keywords even when the label has no colon', () => {
    const out = splitAbstractMetadataFromParagraphs([
      paragraph('Keywords no-reflow, ST-elevation myocardial infarction, mean platelet volume'),
      paragraph('Introduction', 'Heading2'),
      paragraph('Main body.'),
    ]);

    assert.deepEqual(out.keywords, [
      'no-reflow',
      'ST-elevation myocardial infarction',
      'mean platelet volume',
    ]);
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Introduction', 'Main body.']);
  });

  it('extracts Turkish inline keywords separated by bullets', () => {
    const out = splitAbstractMetadataFromParagraphs([
      paragraph('Anahtar kelimeler - no-reflow • mean platelet volume • inflammation'),
      paragraph('Giriş', 'Heading2'),
      paragraph('Ana metin.'),
    ]);

    assert.deepEqual(out.keywords, ['no-reflow', 'mean platelet volume', 'inflammation']);
    assert.deepEqual(out.bodyParagraphs.map((p) => p.text), ['Giriş', 'Ana metin.']);
  });
});

describe('countWords', () => {
  it('counts non-empty words', () => {
    assert.equal(countWords('  one two\n\nthree  '), 3);
  });
});
