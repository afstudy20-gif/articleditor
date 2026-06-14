import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkReviewBlocks,
  groupAcademicIssues,
  locateQuoteInSegments,
  type AcademicReviewIssue,
  type ReviewBlock,
} from './academic-review';

test('chunkReviewBlocks preserves order and keeps chunks within the requested size', () => {
  const blocks: ReviewBlock[] = [
    { id: 'b1', text: 'Introduction', section: 'Introduction' },
    { id: 'b2', text: 'A'.repeat(35), section: 'Introduction' },
    { id: 'b3', text: 'B'.repeat(35), section: 'Methods' },
    { id: 'b4', text: 'C'.repeat(20), section: 'Results' },
  ];

  const chunks = chunkReviewBlocks(blocks, 60);

  assert.deepEqual(chunks.flatMap((chunk) => chunk.blocks.map((block) => block.id)), [
    'b1',
    'b2',
    'b3',
    'b4',
  ]);
  assert.ok(chunks.every((chunk) => chunk.characterCount <= 60));
  assert.equal(chunks[1].blocks[0].section, 'Methods');
});

test('chunkReviewBlocks splits an oversized block without losing its identity', () => {
  const chunks = chunkReviewBlocks(
    [{ id: 'methods-1', text: '0123456789'.repeat(8), section: 'Methods' }],
    30,
  );

  assert.equal(chunks.length, 3);
  assert.equal(chunks.map((chunk) => chunk.blocks[0].text).join(''), '0123456789'.repeat(8));
  assert.deepEqual(
    chunks.map((chunk) => chunk.blocks[0].id),
    ['methods-1:part-1', 'methods-1:part-2', 'methods-1:part-3'],
  );
});

test('locateQuoteInSegments maps a quote across marked text nodes', () => {
  const result = locateQuoteInSegments(
    [
      { text: 'The intervention ', from: 11 },
      { text: 'significantly reduced', from: 28 },
      { text: ' mortality.', from: 49 },
    ],
    'intervention significantly reduced mortality',
  );

  assert.deepEqual(result, { from: 15, to: 59 });
});

test('locateQuoteInSegments uses the requested occurrence for duplicate wording', () => {
  const result = locateQuoteInSegments(
    [{ text: 'Risk was high. Risk was high.', from: 5 }],
    'Risk was high',
    1,
  );

  assert.deepEqual(result, { from: 20, to: 33 });
});

test('groupAcademicIssues returns stable category counts and passed checks', () => {
  const issues: AcademicReviewIssue[] = [
    issue('grammar', 'g1'),
    issue('grammar', 'g2'),
    issue('readability', 'r1'),
  ];

  const grouped = groupAcademicIssues(issues);

  assert.equal(grouped.find((group) => group.category === 'grammar')?.issues.length, 2);
  assert.equal(grouped.find((group) => group.category === 'readability')?.issues.length, 1);
  assert.ok(grouped.find((group) => group.category === 'statistics')?.passed);
});

function issue(category: AcademicReviewIssue['category'], id: string): AcademicReviewIssue {
  return {
    id,
    category,
    severity: 'low',
    blockId: 'b1',
    quote: id,
    explanation: id,
    replacement: id,
    status: 'open',
  };
}
