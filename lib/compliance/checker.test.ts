import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCompliance } from './checker';
import { getJournalTemplate } from '@/lib/journals/templates';
import type { WritingStats } from '@/lib/stats/types';

const stats: WritingStats = {
  words: 100,
  characters: 500,
  charactersNoSpaces: 400,
  sentences: 5,
  paragraphs: 3,
  headings: 7,
  citations: 1,
  uniqueCitations: 1,
  citationDensity: 10,
  readingTimeMin: 1,
};

describe('JCM reference-style compliance', () => {
  const template = getJournalTemplate('jcm');
  assert.ok(template);

  it('recognizes MDPI ACS as the preferred matching style', () => {
    const report = checkCompliance({
      template,
      stats,
      plainText: '',
      sectionHeadings: [],
      referenceStyle: 'mdpi-acs',
    });
    const issue = report.issues.find((item) => item.category === 'reference-style');

    assert.equal(issue?.severity, 'ok');
    assert.equal(issue?.confidence, 'verified');
  });

  it('treats another consistent submission style as guidance, not a scored failure', () => {
    const report = checkCompliance({
      template,
      stats,
      plainText: '',
      sectionHeadings: [],
      referenceStyle: 'vancouver',
    });
    const issue = report.issues.find((item) => item.category === 'reference-style');

    assert.equal(issue?.severity, 'info');
    assert.equal(issue?.confidence, 'heuristic');
    assert.match(issue?.message ?? '', /prefers MDPI ACS/);
  });
});

describe('JCM section compliance', () => {
  const template = getJournalTemplate('jcm');
  assert.ok(template);

  it('accepts Turkish keyword headings for the required Keywords section', () => {
    const report = checkCompliance({
      template,
      stats,
      plainText: 'Anahtar Kelimeler: lipid paradoksu; mortalite',
      sectionHeadings: ['Anahtar Kelimeler'],
      referenceStyle: 'mdpi-acs',
    });
    const issue = report.issues.find(
      (item) => item.category === 'section' && item.message.includes('"Keywords"'),
    );

    assert.equal(issue?.severity, 'ok');
    assert.equal(issue?.confidence, 'verified');
  });

  it('accepts the generated bibliography as the required References section', () => {
    const report = checkCompliance({
      template,
      stats,
      plainText: '',
      sectionHeadings: [],
      referenceStyle: 'mdpi-acs',
      bibliographyReferenceCount: 19,
    });
    const issue = report.issues.find(
      (item) => item.category === 'section' && item.message.includes('"References"'),
    );

    assert.equal(issue?.severity, 'ok');
    assert.equal(issue?.confidence, 'verified');
    assert.match(issue?.message ?? '', /generated from 19 cited references/);
  });
});
