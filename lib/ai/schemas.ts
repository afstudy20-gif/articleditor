// Zod schemas for AI structured output. Each route uses one schema; on parse
// failure the provider layer retries once with a schema-reminder appended.

import { z } from 'zod';
import { ACADEMIC_REVIEW_CATEGORIES } from './academic-review';

// ── Full-document academic review ───────────────────────────────────
export const AcademicReviewCategory = z.enum(ACADEMIC_REVIEW_CATEGORIES);

export const AcademicReviewSuggestion = z.object({
  category: AcademicReviewCategory,
  severity: z.enum(['low', 'med', 'high']),
  blockId: z.string().min(1),
  quote: z.string().min(1).max(240),
  occurrence: z.number().int().min(0).optional(),
  explanation: z.string().min(1).max(800),
  replacement: z.string().max(1_500).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const AcademicReviewResult = z.object({
  issues: z.array(AcademicReviewSuggestion).max(40),
  summary: z.string().max(1_500).optional(),
});

export type AcademicReviewSuggestionT = z.infer<typeof AcademicReviewSuggestion>;
export type AcademicReviewResultT = z.infer<typeof AcademicReviewResult>;

// ── Section-specific manuscript tools ───────────────────────────────
export const ManuscriptToolMode = z.enum([
  'abstract',
  'titles',
  'discussion',
  'conclusion',
]);

export const ManuscriptToolResult = z.object({
  output: z.string().max(12_000).optional(),
  options: z.array(z.string().min(1).max(500)).max(12).optional(),
  rationale: z.string().max(1_500).optional(),
  cautions: z.array(z.string().max(500)).max(8).optional(),
});

export type ManuscriptToolModeT = z.infer<typeof ManuscriptToolMode>;
export type ManuscriptToolResultT = z.infer<typeof ManuscriptToolResult>;

// ── Reviewer (A1) ───────────────────────────────────────────────────
export const ReviewIssueCategory = z.enum([
  'clarity',
  'tone',
  'structure',
  'evidence',
  'grammar',
  'consistency',
  'flow',
]);

export const ReviewSeverity = z.enum(['low', 'med', 'high']);

export const ReviewIssue = z.object({
  category: ReviewIssueCategory,
  severity: ReviewSeverity,
  span: z.tuple([z.number().int(), z.number().int()]).optional(),
  quote: z.string().optional(),
  comment: z.string(),
  suggestion: z.string().optional(),
});

export const ReviewResult = z.object({
  issues: z.array(ReviewIssue),
  summary: z.string().optional(),
});

export type ReviewIssueT = z.infer<typeof ReviewIssue>;
export type ReviewResultT = z.infer<typeof ReviewResult>;

// ── Enhancer (A2) ───────────────────────────────────────────────────
export const EnhanceMode = z.enum([
  'expand',
  'shorten',
  'rephrase',
  'tone-academic',
  'clarity',
  'concision',
  'grammar',
]);

export const EnhanceResult = z.object({
  after: z.string(),
  rationale: z.string().optional(),
});

export type EnhanceModeT = z.infer<typeof EnhanceMode>;
export type EnhanceResultT = z.infer<typeof EnhanceResult>;

// ── Scoring (A3) ────────────────────────────────────────────────────
export const ScoreBreakdownItem = z.object({
  aspect: z.string(),
  score: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export const ScoreResult = z.object({
  clarity: z.number().min(0).max(100),
  coherence: z.number().min(0).max(100),
  academic_tone: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  breakdown: z.array(ScoreBreakdownItem),
  recommendations: z.array(z.string()).optional(),
});

export type ScoreResultT = z.infer<typeof ScoreResult>;

// ── Aspect extractor (B3) ───────────────────────────────────────────
export const AspectExtract = z.object({
  goals: z.array(z.string()).optional(),
  methods: z.array(z.string()).optional(),
  datasets: z.array(z.string()).optional(),
  eval_protocols: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  contributions: z.array(z.string()).optional(),
  findings: z.array(z.string()).optional(),
});

export type AspectExtractT = z.infer<typeof AspectExtract>;

// ── Citation gap detection (B2) ─────────────────────────────────────
export const ClaimNeedingCitation = z.object({
  quote: z.string(),
  span: z.tuple([z.number().int(), z.number().int()]).optional(),
  claim_type: z.enum(['empirical', 'theoretical', 'statistical', 'attribution', 'definition']),
  rationale: z.string(),
});

export const GapDetectResult = z.object({
  claims: z.array(ClaimNeedingCitation),
});

export type ClaimT = z.infer<typeof ClaimNeedingCitation>;
export type GapDetectResultT = z.infer<typeof GapDetectResult>;

// ── Compare My Work (C1) ────────────────────────────────────────────
export const CompareOverlap = z.object({
  aspect: z.string(),
  mine: z.string(),
  theirs: z.string(),
  note: z.string().optional(),
});

export const CompareResult = z.object({
  overlaps: z.array(CompareOverlap),
  gaps: z.array(z.string()),
  differentiators: z.array(z.string()),
  citation_snippet: z.string().optional(),
});

export type CompareResultT = z.infer<typeof CompareResult>;

// ── Deep research (C2) ──────────────────────────────────────────────
export const ResearchCluster = z.object({
  theme: z.string(),
  ref_ids: z.array(z.string()),
  summary: z.string(),
  takeaway: z.string(),
});

export const DeepResearchResult = z.object({
  clusters: z.array(ResearchCluster),
  positioning: z.string().optional(),
});

export type DeepResearchResultT = z.infer<typeof DeepResearchResult>;
