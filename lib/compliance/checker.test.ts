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
