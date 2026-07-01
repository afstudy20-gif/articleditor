import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocWithCitations } from './import-rich';

describe('buildDocWithCitations', () => {
  it('turns a short all-bold imported paragraph into a bold heading', () => {
    const doc = buildDocWithCitations([
      {
        text: 'Methods',
        runs: [{ text: 'Methods', bold: true }],
      },
    ], []) as any;

    assert.equal(doc.content[0].type, 'heading');
    assert.equal(doc.content[0].attrs.level, 2);
    assert.deepEqual(doc.content[0].content[0].marks, [{ type: 'bold' }]);
  });

  it('preserves inline formatting without promoting a normal paragraph', () => {
    const doc = buildDocWithCitations([
      {
        text: 'Bold opening and normal text.',
        runs: [
          { text: 'Bold opening', bold: true },
          { text: ' and normal text.' },
        ],
      },
    ], []) as any;

    assert.equal(doc.content[0].type, 'paragraph');
    assert.deepEqual(doc.content[0].content, [
      { type: 'text', text: 'Bold opening', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and normal text.' },
    ]);
  });

  it('keeps explicit Word heading styles as heading nodes', () => {
    const doc = buildDocWithCitations([
      {
        text: 'Introduction',
        style: 'Heading1',
        runs: [{ text: 'Introduction' }],
      },
    ], []) as any;

    assert.equal(doc.content[0].type, 'heading');
    assert.equal(doc.content[0].attrs.level, 1);
  });

  it('remaps citation markers when only a subset of references is selected', () => {
    const refs = [
      { id: 'ref-1', raw: 'First reference' },
      { id: 'ref-3', raw: 'Third reference' },
    ] as any;
    const doc = buildDocWithCitations(
      [{ text: 'Text with [1] and [2] and [3].' }],
      refs,
      [1, 3],
    ) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 2);
    assert.deepEqual(citations[0].attrs.refIds, ['ref-1']);
    assert.deepEqual(citations[1].attrs.refIds, ['ref-3']);
  });

  it('drops citations for references that are not selected', () => {
    const refs = [{ id: 'ref-1', raw: 'First reference' }] as any;
    const doc = buildDocWithCitations(
      [{ text: 'Text with [1] and [2].' }],
      refs,
      [1],
    ) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 1);
    assert.deepEqual(citations[0].attrs.refIds, ['ref-1']);
    const textNodes = doc.content[0].content.filter((n: any) => n.type === 'text');
    assert.ok(textNodes.some((n: any) => n.text.includes('[2]')));
  });

  it('keeps multiple unicode superscript citations aligned to the original text', () => {
    const refs = [
      { id: 'ref-1', raw: 'First reference' },
      { id: 'ref-2', raw: 'Second reference' },
    ] as any;
    const doc = buildDocWithCitations([
      {
        text: 'STEMI remains a leading cause of death and disability¹. PCI is the strategy of choice ².',
      },
    ], refs) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 2);
    assert.deepEqual(citations[0].attrs.refIds, ['ref-1']);
    assert.deepEqual(citations[1].attrs.refIds, ['ref-2']);
    const text = doc.content[0].content
      .filter((n: any) => n.type === 'text')
      .map((n: any) => n.text)
      .join('');
    assert.ok(text.includes('disability.'));
    assert.ok(text.includes('choice .'));
  });

  it('turns flattened baseline numeric citations into citation nodes', () => {
    const refs = [
      { id: 'ref-1', raw: 'First reference' },
      { id: 'ref-2', raw: 'Second reference' },
    ] as any;
    const doc = buildDocWithCitations([
      {
        text: 'Because PCI is preferred, it is the strategy of choice 2.',
      },
    ], refs) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 1);
    assert.deepEqual(citations[0].attrs.refIds, ['ref-2']);
  });

  it('does not treat author-byline affiliation superscripts as citations (style signal)', () => {
    const refs = [
      { id: 'ref-1', raw: 'First reference' },
      { id: 'ref-2', raw: 'Second reference' },
    ] as any;
    const doc = buildDocWithCitations([
      {
        // MDPI author-names paragraph: superscript affiliation numbers.
        style: 'MDPI13authornames',
        text: 'Fatih Akkaya 1, Nihan Bahadır 1, Adnan Duha Cömert 2',
      },
    ], refs) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 0, 'no citation nodes from byline superscripts');
    const text = doc.content[0].content.map((n: any) => n.text ?? '').join('');
    assert.ok(text.includes('Fatih Akkaya'), 'byline text preserved');
    assert.ok(/1.*1.*2/.test(text), 'affiliation numbers kept as plain text');
  });

  it('does not treat multi-author byline affiliation digits as citations (structure signal)', () => {
    const refs = [{ id: 'ref-1', raw: 'First reference' }] as any;
    const doc = buildDocWithCitations([
      {
        // No style hint — must be detected from the "Name N, Name N" structure.
        text: 'Fatih Akkaya 1, Nihan Bahadır 1, Mustafa Kamil Sağlam 1',
      },
    ], refs) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 0, 'no citation nodes from byline structure');
  });

  it('does not treat an affiliation line as a citation', () => {
    const refs = [{ id: 'ref-1', raw: 'First reference' }] as any;
    const doc = buildDocWithCitations([
      { text: '1 Cardiology, Ordu University, Ordu, Turkey' },
    ], refs) as any;

    const citations = doc.content[0].content.filter((n: any) => n.type === 'citation');
    assert.equal(citations.length, 0, 'no citation from affiliation line');
  });
});
