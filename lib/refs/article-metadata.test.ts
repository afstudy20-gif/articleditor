import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  guessArticleTitle,
  extractFirstAuthor,
  extractYear,
  extractDoi,
  extractPmid,
  extractArticleAbstract,
  extractCitationLocators,
  refFromArticleText,
} from './article-metadata';

const SAMPLE_ARTICLE = `Smith JA, Doe BC, Kaya M

Efficacy of Statin Therapy in Patients with Chronic Heart Failure: A Randomized Trial

Journal of Cardiology, 2021

doi:10.1234/jcard.2021.5678
PMID: 33445566

Abstract
Background: Heart failure remains a leading cause of morbidity. This trial evaluated
statin therapy outcomes in a randomized cohort of 400 patients over 24 months. We found
significant reductions in adverse events among the treatment group compared to placebo,
with consistent effects across subgroups.

Keywords: heart failure, statins, randomized trial

Introduction
Heart failure affects millions worldwide...`;

describe('guessArticleTitle', () => {
  it('picks the longest substantial line before Abstract/Introduction', () => {
    const t = guessArticleTitle(SAMPLE_ARTICLE);
    assert.equal(t, 'Efficacy of Statin Therapy in Patients with Chronic Heart Failure: A Randomized Trial');
  });

  it('skips copyright/DOI/journal-homepage boilerplate lines', () => {
    const text = [
      'doi: 10.1000/xyz.123',
      'Copyright 2020 Elsevier Inc. All rights reserved.',
      'Journal homepage: www.example.com/journal',
      'A Study of Cardiovascular Outcomes in Diabetic Patients',
      'Abstract',
    ].join('\n');
    assert.equal(guessArticleTitle(text), 'A Study of Cardiovascular Outcomes in Diabetic Patients');
  });

  it('returns empty string for empty/short input', () => {
    assert.equal(guessArticleTitle(''), '');
    assert.equal(guessArticleTitle('short'), '');
  });
});

describe('extractFirstAuthor', () => {
  it('extracts a Western-style surname + initials', () => {
    assert.equal(extractFirstAuthor('Smith JA, Doe BC, Kaya M'), 'Smith JA');
  });

  it('handles Turkish/non-ASCII surnames', () => {
    assert.equal(extractFirstAuthor('Uzunoğlu H, Yılmaz K'), 'Uzunoğlu H');
  });

  it('falls back to a text slice when no author pattern matches', () => {
    const out = extractFirstAuthor('12345 not an author line at all here');
    assert.ok(out.length <= 30);
  });
});

describe('extractYear', () => {
  it('finds a plausible 4-digit year', () => {
    assert.equal(extractYear('Published in 2021, volume 12'), 2021);
    assert.equal(extractYear('J Cardiol. 2019;12(3):45-67.'), 2019);
  });

  it('returns undefined when no year is present', () => {
    assert.equal(extractYear('no year here'), undefined);
  });
});

describe('extractDoi', () => {
  it('extracts a labeled DOI', () => {
    assert.equal(extractDoi('doi:10.1234/jcard.2021.5678'), '10.1234/jcard.2021.5678');
  });

  it('extracts a bare DOI or a doi.org URL', () => {
    assert.equal(extractDoi('See 10.1000/abc.123 for details'), '10.1000/abc.123');
    assert.equal(extractDoi('https://doi.org/10.1000/abc.123'), '10.1000/abc.123');
  });

  it('strips trailing punctuation', () => {
    assert.equal(extractDoi('doi:10.1000/abc.123.'), '10.1000/abc.123');
  });

  it('returns undefined when absent', () => {
    assert.equal(extractDoi('no doi here'), undefined);
  });
});

describe('extractPmid', () => {
  it('extracts a labeled PMID', () => {
    assert.equal(extractPmid('PMID: 33445566'), '33445566');
  });

  it('extracts from a pubmed/ URL segment', () => {
    assert.equal(extractPmid('https://pubmed.ncbi.nlm.nih.gov/33445566/'), '33445566');
  });

  it('returns undefined when absent', () => {
    assert.equal(extractPmid('no pmid here'), undefined);
  });
});

describe('extractArticleAbstract', () => {
  it('extracts the labeled Abstract section, stopping at Keywords', () => {
    const abs = extractArticleAbstract(SAMPLE_ARTICLE);
    assert.ok(abs.startsWith('Background: Heart failure remains a leading cause'));
    assert.ok(!abs.toLowerCase().includes('keywords'));
    assert.ok(!abs.toLowerCase().includes('introduction'));
  });

  it('returns empty string when no abstract-like section is found', () => {
    assert.equal(extractArticleAbstract('Just a short note with no structure.'), '');
    assert.equal(extractArticleAbstract(''), '');
  });
});

describe('extractCitationLocators', () => {
  it('parses journal, volume, issue and pages from a "Cite this article as" line', () => {
    const text = [
      'Copyright@Author(s)',
      'Cite this article as: Sun Y, Wang W, Feng Y. The Relation Between the',
      'aggregate index and mortality in the elderly',
      'population. Anatol J Cardiol. 2026;30(7):455-464.',
      'DOI: 10.14744/AnatolJCardiol.2026.5439',
    ].join('\n');
    const loc = extractCitationLocators(text);
    assert.equal(loc.volume, '30');
    assert.equal(loc.issue, '7');
    assert.equal(loc.pages, '455-464');
    assert.equal(loc.containerTitle, 'Anatol J Cardiol');
  });

  it('handles a bare Year;Vol(Issue):Pages string with no cite anchor', () => {
    const loc = extractCitationLocators('Circulation 2019;140(3):e1-e10 was reported.');
    assert.equal(loc.volume, '140');
    assert.equal(loc.issue, '3');
    assert.equal(loc.pages, 'e1-e10');
    assert.equal(loc.containerTitle, undefined);
  });

  it('returns empty object when no locator pattern is present', () => {
    assert.deepEqual(extractCitationLocators('A plain sentence with a 2020 year only.'), {});
    assert.deepEqual(extractCitationLocators(''), {});
  });
});

describe('refFromArticleText', () => {
  it('captures journal/volume/issue/pages from the article citation line', () => {
    const text = [
      'The Relation Between the Aggregate Index of Systemic Inflammation and Mortality',
      'ABSTRACT',
      'Background: Cardiovascular disease is a leading cause of death and is closely',
      'associated with inflammation in the elderly population studied here at length.',
      'Cite this article as: Sun Y, Wang W, Feng Y. The Relation … elderly',
      'population. Anatol J Cardiol. 2026;30(7):455-464.',
      'DOI: 10.14744/AnatolJCardiol.2026.5439',
    ].join('\n');
    const ref = refFromArticleText({ filename: '1782720593-en.pdf', text });
    assert.equal(ref.volume, '30');
    assert.equal(ref.issue, '7');
    assert.equal(ref.pages, '455-464');
    assert.equal(ref.containerTitle, 'Anatol J Cardiol');
    assert.equal(ref.doi, '10.14744/AnatolJCardiol.2026.5439');
  });


  it('builds a complete Ref from a realistic article text', () => {
    const ref = refFromArticleText({ filename: 'smith-2021.pdf', text: SAMPLE_ARTICLE });
    assert.equal(ref.type, 'journal-article');
    assert.equal(ref.title, 'Efficacy of Statin Therapy in Patients with Chronic Heart Failure: A Randomized Trial');
    assert.equal(ref.year, 2021);
    assert.equal(ref.doi, '10.1234/jcard.2021.5678');
    assert.equal(ref.pmid, '33445566');
    assert.ok(ref.abstract?.startsWith('Background:'));
    assert.equal(ref.authors[0]?.literal, 'Smith JA');
    assert.equal(ref.source, 'pdf_folder');
    assert.ok(ref.id);
  });

  it('falls back to the filename as title when nothing extractable', () => {
    const ref = refFromArticleText({ filename: 'unreadable_scan.pdf', text: '' });
    assert.equal(ref.title, 'unreadable_scan');
    assert.deepEqual(ref.authors, []);
    assert.equal(ref.doi, undefined);
  });

  it('never throws on garbage input', () => {
    assert.doesNotThrow(() => refFromArticleText({ filename: 'x.pdf', text: '{}[]<><<<>' }));
  });
});
