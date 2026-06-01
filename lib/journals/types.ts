// Shared contracts for journal templates + pre-submission compliance.

export type CitationStyleId = 'vancouver' | 'apa' | 'ama' | 'ieee';

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
  referenceStyle: CitationStyleId;
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
}

export interface ComplianceReport {
  templateId: string;
  templateName: string;
  /** 0-100 readiness score. */
  score: number;
  issues: ComplianceIssue[];
  passed: number;
  total: number;
}
