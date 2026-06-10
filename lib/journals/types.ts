// Shared contracts for journal templates + pre-submission compliance.

export type CitationStyleId =
  | 'vancouver'
  | 'apa'
  | 'ama'
  | 'ieee'
  | 'mdpi-acs'
  | 'mdpi-chicago'
  | 'mdpi-apa';

export type AbstractStructure = 'structured' | 'unstructured' | 'any';

export interface JournalSection {
  /** Canonical English heading, e.g. "Introduction". */
  heading: string;
  level: 1 | 2 | 3;
  required: boolean;
  /** Optional per-section word ceiling. */
  wordLimit?: number;
}

/** A required prose statement the journal expects somewhere in the manuscript. */
export interface RequiredStatement {
  id: string;
  /** Human label, e.g. "Conflict of Interest". */
  label: string;
  /** Lowercased keywords; presence of any (in text) satisfies the check. */
  keywords: string[];
}

export interface JournalTemplate {
  id: string;
  name: string;
  publisher?: string;
  description?: string;
  /** Authoritative guideline page these rules were derived from. */
  sourceUrl?: string;
  /** ISO date the bundled rules were last reviewed against the source. */
  rulesUpdatedAt?: string;
  /** Preferred style for this journal template. */
  referenceStyle: CitationStyleId;
  /** Whether a different consistent style is acceptable at submission. */
  referenceStylePolicy?: 'required' | 'preferred';
  /** Reference families documented by the publisher's general style guide. */
  publisherReferenceStyles?: CitationStyleId[];
  /** Detailed journal-specific citation and bibliography requirements. */
  referenceRules?: string[];
  /** Publisher or journal reference-list guide. */
  referenceGuideUrl?: string;
  abstractStructure: AbstractStructure;
  abstractWordLimit?: number;
  totalWordLimit?: number;
  sections: JournalSection[];
  requiredStatements: RequiredStatement[];
  notes?: string;
}

export type ComplianceSeverity = 'error' | 'warn' | 'info' | 'ok';

export interface ComplianceIssue {
  severity: ComplianceSeverity;
  category: 'word-count' | 'abstract' | 'section' | 'statement' | 'reference-style' | 'structure';
  message: string;
  detail?: string;
  /**
   * 'verified'  — mechanically measurable (word counts, heading presence,
   *               style match). Counts toward the readiness score.
   * 'heuristic' — keyword/pattern guess (statements, structured abstract).
   *               Shown as "needs manual review"; excluded from the score.
   */
  confidence: 'verified' | 'heuristic';
}

export interface ComplianceReport {
  templateId: string;
  templateName: string;
  /** 0-100 readiness score over VERIFIED checks only. */
  score: number;
  issues: ComplianceIssue[];
  passed: number;
  total: number;
  /** Verified (mechanically measurable) checks. */
  verifiedPassed: number;
  verifiedTotal: number;
  /** Heuristic checks the author should confirm by hand. */
  manualReview: number;
}
