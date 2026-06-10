import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getJournalTemplate } from './templates';

describe('Journal of Clinical Medicine template', () => {
  const template = getJournalTemplate('jcm');

  it('is bundled with source metadata and the original-research abstract rules', () => {
    assert.ok(template);
    assert.equal(template.sourceUrl, 'https://www.mdpi.com/journal/jcm/instructions');
    assert.equal(template.rulesUpdatedAt, '2026-06-10');
    assert.equal(template.referenceStyle, 'vancouver');
    assert.equal(template.abstractStructure, 'structured');
    assert.equal(template.abstractWordLimit, 250);
    assert.equal(template.totalWordLimit, undefined);
  });

  it('captures required research sections while keeping Conclusions optional', () => {
    assert.ok(template);
    const required = template.sections.filter((section) => section.required).map((section) => section.heading);
    assert.deepEqual(required, [
      'Abstract',
      'Keywords',
      'Introduction',
      'Materials and Methods',
      'Results',
      'Discussion',
      'References',
    ]);
    assert.equal(
      template.sections.find((section) => section.heading === 'Conclusions')?.required,
      false,
    );
  });

  it('includes JCM back-matter declarations', () => {
    assert.ok(template);
    assert.deepEqual(
      template.requiredStatements.map((statement) => statement.id),
      [
        'author-contributions',
        'funding',
        'ethics',
        'informed-consent',
        'data-availability',
        'conflict-of-interest',
      ],
    );
  });
});
