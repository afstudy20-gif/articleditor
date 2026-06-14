import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getJournalTemplate } from './templates';

describe('Journal of Clinical Medicine template', () => {
  const template = getJournalTemplate('jcm');

  it('is bundled with source metadata and the original-research abstract rules', () => {
    assert.ok(template);
    assert.equal(template.sourceUrl, 'https://www.mdpi.com/journal/jcm/instructions');
    assert.equal(template.rulesUpdatedAt, '2026-06-11');
    assert.equal(template.referenceStyle, 'mdpi-acs');
    assert.equal(template.referenceStylePolicy, 'preferred');
    assert.deepEqual(template.publisherReferenceStyles, [
      'mdpi-acs',
      'mdpi-chicago',
      'mdpi-apa',
    ]);
    assert.equal(template.referenceGuideUrl, 'https://www.mdpi.com/authors/layout');
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

  it('captures JCM citation and bibliography requirements', () => {
    assert.ok(template);
    assert.ok(template.referenceRules?.some((rule) => rule.includes('square brackets')));
    assert.ok(template.referenceRules?.some((rule) => rule.includes('before punctuation')));
    assert.ok(template.referenceRules?.some((rule) => rule.includes('full article title')));
    assert.ok(template.referenceRules?.some((rule) => rule.includes('three house styles')));
    assert.ok(template.referenceRules?.some((rule) => rule.includes('first 10 authors')));
    assert.ok(template.referenceRules?.some((rule) => rule.includes('DOIs')));
    assert.ok(template.referenceRules?.some((rule) => rule.includes('supplementary files')));
  });
});

describe('Journal of International Medical Research template', () => {
  const template = getJournalTemplate('journal-international-medical-research');

  it('uses the required SAGE Vancouver reference profile', () => {
    assert.ok(template);
    assert.equal(template.name, 'Journal of International Medical Research');
    assert.equal(template.publisher, 'SAGE Publishing');
    assert.equal(template.referenceStyle, 'sage-vancouver');
    assert.equal(template.referenceStylePolicy, 'required');
    assert.equal(
      template.sourceUrl,
      'https://journals.sagepub.com/author-instructions/IMR',
    );
  });

  it('captures article-type limits and submission requirements', () => {
    assert.ok(template);
    assert.ok(template.requirements?.some((rule) => rule.includes('Randomised Clinical Trials')));
    assert.ok(
      template.requirements?.some((rule) =>
        rule.toLowerCase().includes('minimum of 5 keywords'),
      ),
    );
    assert.ok(template.requirements?.some((rule) => rule.includes('300 dpi')));
    assert.deepEqual(template.submissionQuestions, [
      'Please explain clearly how your manuscript demonstrates evidence of direct or indirect clinical relevance.',
      'Please explain clearly how clinical practice might be influenced by the results of your study.',
      'Please explain clearly how the subjects were selected in clinical studies and treatments allocated.',
      'Please explain clearly why your submission is appropriate to an international medical journal with a general readership rather than to a specialist publication.',
    ]);
    assert.equal(
      template.sections.find((section) => section.heading === 'Statements and Declarations')?.required,
      true,
    );
  });

  it('requires each declarations subheading, including consent for publication', () => {
    assert.ok(template);
    assert.deepEqual(
      template.requiredStatements.map((statement) => statement.id),
      [
        'author-contributions',
        'acknowledgments',
        'ethics',
        'informed-consent',
        'consent-publication',
        'conflict-of-interest',
        'funding',
        'data-availability',
      ],
    );
  });
});
