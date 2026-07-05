import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AcademicReviewResult,
  ManuscriptToolMode,
  ManuscriptToolResult,
  ReviewResult,
  EnhanceMode,
  EnhanceResult,
  ScoreResult,
  AspectExtract,
  GapDetectResult,
  CompareResult,
  DeepResearchResult,
} from './schemas';

describe('AcademicReviewResult', () => {
  const validIssue = {
    category: 'grammar',
    severity: 'med',
    blockId: 'b1',
    quote: 'teh results',
    explanation: 'Typo: "teh" should be "the".',
  };

  it('accepts a valid payload with optional fields', () => {
    const parsed = AcademicReviewResult.parse({
      issues: [
        { ...validIssue, occurrence: 1, replacement: 'the results', confidence: 0.9 },
      ],
      summary: 'One typo found.',
    });
    assert.equal(parsed.issues.length, 1);
    assert.equal(parsed.issues[0].confidence, 0.9);
  });

  it('accepts an empty issue list without summary', () => {
    assert.deepEqual(AcademicReviewResult.parse({ issues: [] }), { issues: [] });
  });

  it('rejects unknown categories', () => {
    assert.throws(() =>
      AcademicReviewResult.parse({ issues: [{ ...validIssue, category: 'vibes' }] }),
    );
  });

  it('rejects empty quote, over-long quote, and out-of-range confidence', () => {
    assert.throws(() => AcademicReviewResult.parse({ issues: [{ ...validIssue, quote: '' }] }));
    assert.throws(() =>
      AcademicReviewResult.parse({ issues: [{ ...validIssue, quote: 'x'.repeat(241) }] }),
    );
    assert.throws(() =>
      AcademicReviewResult.parse({ issues: [{ ...validIssue, confidence: 1.5 }] }),
    );
  });

  it('rejects more than 40 issues', () => {
    const issues = Array.from({ length: 41 }, () => ({ ...validIssue }));
    assert.throws(() => AcademicReviewResult.parse({ issues }));
  });
});

describe('ManuscriptTool schemas', () => {
  it('accepts every declared mode and rejects unknown ones', () => {
    for (const mode of ['abstract', 'titles', 'discussion', 'conclusion']) {
      assert.equal(ManuscriptToolMode.parse(mode), mode);
    }
    assert.throws(() => ManuscriptToolMode.parse('introduction'));
  });

  it('accepts a fully-optional result object', () => {
    assert.deepEqual(ManuscriptToolResult.parse({}), {});
    const parsed = ManuscriptToolResult.parse({
      output: 'An abstract.',
      options: ['Title A', 'Title B'],
      rationale: 'why',
      cautions: ['check numbers'],
    });
    assert.equal(parsed.options?.length, 2);
  });

  it('rejects too many options and empty option strings', () => {
    assert.throws(() =>
      ManuscriptToolResult.parse({ options: Array.from({ length: 13 }, (_, i) => `t${i}`) }),
    );
    assert.throws(() => ManuscriptToolResult.parse({ options: [''] }));
  });
});

describe('ReviewResult', () => {
  it('accepts a valid payload with span tuple', () => {
    const parsed = ReviewResult.parse({
      issues: [
        {
          category: 'clarity',
          severity: 'low',
          span: [10, 24],
          quote: 'this thing',
          comment: 'Vague referent.',
          suggestion: 'name the thing',
        },
      ],
      summary: 'ok',
    });
    assert.deepEqual(parsed.issues[0].span, [10, 24]);
  });

  it('rejects bad severity, bad category, and malformed span', () => {
    const base = { category: 'clarity', severity: 'low', comment: 'c' };
    assert.throws(() => ReviewResult.parse({ issues: [{ ...base, severity: 'critical' }] }));
    assert.throws(() => ReviewResult.parse({ issues: [{ ...base, category: 'novelty' }] }));
    assert.throws(() => ReviewResult.parse({ issues: [{ ...base, span: [1] }] }));
    assert.throws(() => ReviewResult.parse({ issues: [{ ...base, span: [1.5, 2] }] }));
  });
});

describe('Enhance schemas', () => {
  it('accepts every declared mode', () => {
    const modes = ['expand', 'shorten', 'rephrase', 'tone-academic', 'clarity', 'concision', 'grammar'];
    for (const m of modes) assert.equal(EnhanceMode.parse(m), m);
    assert.throws(() => EnhanceMode.parse('embellish'));
  });

  it('requires "after" and keeps rationale optional', () => {
    assert.deepEqual(EnhanceResult.parse({ after: 'better text' }), { after: 'better text' });
    assert.throws(() => EnhanceResult.parse({ rationale: 'no after field' }));
  });
});

describe('ScoreResult', () => {
  const valid = {
    clarity: 80,
    coherence: 75,
    academic_tone: 90,
    overall: 82,
    breakdown: [{ aspect: 'intro', score: 70, notes: 'fine' }],
  };

  it('accepts a valid payload', () => {
    const parsed = ScoreResult.parse({ ...valid, recommendations: ['tighten abstract'] });
    assert.equal(parsed.overall, 82);
  });

  it('rejects out-of-range scores', () => {
    assert.throws(() => ScoreResult.parse({ ...valid, overall: 101 }));
    assert.throws(() => ScoreResult.parse({ ...valid, clarity: -1 }));
    assert.throws(() =>
      ScoreResult.parse({ ...valid, breakdown: [{ aspect: 'x', score: 200 }] }),
    );
  });

  it('rejects missing required dimensions', () => {
    const { coherence: _omit, ...partial } = valid;
    assert.throws(() => ScoreResult.parse(partial));
  });
});

describe('AspectExtract', () => {
  it('accepts an empty object (all fields optional)', () => {
    assert.deepEqual(AspectExtract.parse({}), {});
  });

  it('accepts string arrays and rejects wrong element types', () => {
    const parsed = AspectExtract.parse({ goals: ['g1'], findings: ['f1', 'f2'] });
    assert.equal(parsed.findings?.length, 2);
    assert.throws(() => AspectExtract.parse({ methods: [42] }));
  });
});

describe('GapDetectResult', () => {
  it('accepts valid claims', () => {
    const parsed = GapDetectResult.parse({
      claims: [
        {
          quote: 'Most studies agree',
          span: [0, 17],
          claim_type: 'empirical',
          rationale: 'Sweeping empirical claim without a source.',
        },
      ],
    });
    assert.equal(parsed.claims[0].claim_type, 'empirical');
  });

  it('rejects unknown claim types and missing rationale', () => {
    const base = { quote: 'q', rationale: 'r' };
    assert.throws(() =>
      GapDetectResult.parse({ claims: [{ ...base, claim_type: 'anecdotal' }] }),
    );
    assert.throws(() =>
      GapDetectResult.parse({ claims: [{ quote: 'q', claim_type: 'empirical' }] }),
    );
  });
});

describe('CompareResult', () => {
  it('accepts a valid payload', () => {
    const parsed = CompareResult.parse({
      overlaps: [{ aspect: 'method', mine: 'CNN', theirs: 'CNN variant', note: 'similar' }],
      gaps: ['no ablation'],
      differentiators: ['larger dataset'],
      citation_snippet: '[1]',
    });
    assert.equal(parsed.overlaps.length, 1);
  });

  it('rejects when required arrays are missing', () => {
    assert.throws(() => CompareResult.parse({ overlaps: [], gaps: [] }));
    assert.throws(() =>
      CompareResult.parse({ overlaps: [{ aspect: 'a' }], gaps: [], differentiators: [] }),
    );
  });
});

describe('DeepResearchResult', () => {
  it('accepts valid clusters', () => {
    const parsed = DeepResearchResult.parse({
      clusters: [
        { theme: 'transformers', ref_ids: ['r1', 'r2'], summary: 's', takeaway: 't' },
      ],
      positioning: 'novel angle',
    });
    assert.equal(parsed.clusters[0].ref_ids.length, 2);
  });

  it('rejects clusters missing required fields', () => {
    assert.throws(() =>
      DeepResearchResult.parse({ clusters: [{ theme: 't', ref_ids: [], summary: 's' }] }),
    );
  });
});
