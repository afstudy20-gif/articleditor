import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeToTipTapContent, encodedToPreview, type CitationNodeJSON } from './mixed-content';

// Must match the private-use-area sentinels in mixed-content.ts.
const OPEN = '';
const CLOSE = '';

const nodes: CitationNodeJSON[] = [
  { type: 'citation', attrs: { refIds: ['a'] } },
  { type: 'citation', attrs: { refIds: ['b', 'c'] } },
];

describe('decodeToTipTapContent', () => {
  it('restores citation nodes at sentinel positions', () => {
    const content = decodeToTipTapContent(`Before ${OPEN}0${CLOSE} middle ${OPEN}1${CLOSE} after.`, nodes);
    assert.equal(content.length, 1);
    const inline = content[0].content;
    assert.deepEqual(
      inline.map((n: { type: string }) => n.type),
      ['text', 'citation', 'text', 'citation', 'text'],
    );
    assert.deepEqual(inline[1].attrs.refIds, ['a']);
    assert.deepEqual(inline[3].attrs.refIds, ['b', 'c']);
  });

  it('leaves plain digits in prose untouched (regression: empty sentinels ate numbers)', () => {
    const content = decodeToTipTapContent('We enrolled 120 patients in 2020.', []);
    assert.equal(content.length, 1);
    assert.deepEqual(content[0].content, [
      { type: 'text', text: 'We enrolled 120 patients in 2020.' },
    ]);
  });

  it('splits double newlines into paragraphs and single newlines into hard breaks', () => {
    const content = decodeToTipTapContent('One.\n\nTwo.\nStill two.', []);
    assert.equal(content.length, 2);
    assert.ok(content[1].content.some((n: { type: string }) => n.type === 'hardBreak'));
  });

  it('drops sentinels pointing at unknown node indices', () => {
    const content = decodeToTipTapContent(`x ${OPEN}9${CLOSE} y`, nodes);
    const types = content[0].content.map((n: { type: string }) => n.type);
    assert.ok(!types.includes('citation') || content[0].content.length === 2);
    const text = content[0].content
      .filter((n: { type: string }) => n.type === 'text')
      .map((n: { text: string }) => n.text)
      .join('');
    assert.equal(text, 'x  y');
  });
});

describe('encodedToPreview', () => {
  const refOrder = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);

  it('renders sentinels as [N] using ref order', () => {
    const preview = encodedToPreview(`Text ${OPEN}0${CLOSE} and ${OPEN}1${CLOSE}.`, nodes, refOrder);
    assert.equal(preview, 'Text [1] and [2,3].');
  });

  it('renders unknown nodes or unnumbered refs as [?]', () => {
    const preview = encodedToPreview(`${OPEN}5${CLOSE}`, nodes, refOrder);
    assert.equal(preview, '[?]');
    const unnumbered = encodedToPreview(`${OPEN}0${CLOSE}`, nodes, new Map());
    assert.equal(unnumbered, '[?]');
  });

  it('does not rewrite plain numbers', () => {
    const preview = encodedToPreview('BP was 120/80 in 2020.', nodes, refOrder);
    assert.equal(preview, 'BP was 120/80 in 2020.');
  });
});
