import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkForAiDetection,
  normalizeAiDetectionResponse,
  normalizePlagiarismWebhook,
} from './copyleaks';

test('chunks long AI detection text without losing content', () => {
  const text = `${'A'.repeat(18_000)} ${'B'.repeat(18_000)}`;
  const chunks = chunkForAiDetection(text, 24_000);

  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 24_000));
  assert.equal(chunks.join(''), text);
});

test('keeps a short final remainder by rebalancing the previous AI chunk', () => {
  const text = 'A'.repeat(24_100);
  const chunks = chunkForAiDetection(text, 24_000);

  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => chunk.length >= 255));
  assert.ok(chunks.every((chunk) => chunk.length <= 24_000));
});

test('normalizes Copyleaks AI probability and classifications', () => {
  const result = normalizeAiDetectionResponse({
    summary: { ai: 0.72, human: 0.28 },
    classifications: [
      { text: 'First sentence.', classification: 2, probability: 0.81 },
      { text: 'Second sentence.', classification: 1, probability: 0.12 },
    ],
  });

  assert.equal(result.aiProbability, 0.72);
  assert.equal(result.humanProbability, 0.28);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0]?.label, 'ai');
  assert.equal(result.segments[1]?.label, 'human');
});

test('normalizes plagiarism completion score and internet sources', () => {
  const result = normalizePlagiarismWebhook('scan-1', {
    results: {
      score: {
        aggregatedScore: 31.4,
        identicalWords: 18,
        minorChangedWords: 9,
        relatedMeaningWords: 4.4,
      },
      internet: [
        {
          id: 'source-1',
          title: 'Example source',
          matchedWords: '24',
          metadata: { finalUrl: 'https://example.com/article' },
        },
      ],
    },
    scannedDocument: { totalWords: 1000, credits: 10 },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.score?.aggregated, 31.4);
  assert.equal(result.sources[0]?.url, 'https://example.com/article');
  assert.equal(result.totalWords, 1000);
});
