// Pure pre-submission compliance checker for the academic editor.
//
// Compares a manuscript (writing stats + plain text + detected headings) against
// a journal template and produces a ComplianceReport. No side effects, no logging,
// no external dependencies. All matching is case-insensitive and tolerant of
// empty / malformed input. See ../journals/types for the produced shape.

import type {
  CitationStyleId,
  ComplianceIssue,
  ComplianceReport,
  ComplianceSeverity,
  JournalSection,
  JournalTemplate,
  RequiredStatement,
} from '@/lib/journals/types';
import type { WritingStats } from '@/lib/stats/types';

export interface ComplianceInput {
  template: JournalTemplate;
  stats: WritingStats;
  /** Full manuscript text; lowercased matching is done internally. */
  plainText: string;
  /** Heading texts present in the document (any case). */
  sectionHeadings: string[];
  /** Current project citation style. */
  referenceStyle: CitationStyleId;
  /** Text under the Abstract heading, if extractable (may be undefined). */
  abstractText?: string;
}

/** Human-readable labels for citation styles used in messages. */
const STYLE_LABELS: Readonly<Record<CitationStyleId, string>> = {
  vancouver: 'Vancouver',
  apa: 'APA',
  ama: 'AMA',
  ieee: 'IEEE',
};

/** Synonym groups: a doc heading matching any alias satisfies the canonical name. */
const SECTION_SYNONYMS: ReadonlyArray<readonly string[]> = [
  ['introduction', 'background'],
  ['methods', 'materials and methods', 'patients and methods', 'methodology', 'materials'],
  ['results', 'findings'],
  ['discussion'],
  ['conclusion', 'conclusions'],
  ['abstract', 'summary', 'oz', 'ozet'],
  ['references', 'bibliography'],
];

/** Headings that count as an "abstract" (Turkish included). */
const ABSTRACT_ALIASES: ReadonlyArray<string> = ['abstract', 'oz', 'ozet', 'summary'];

/** Structured-abstract section labels; presence of a few implies structure. */
const STRUCTURE_LABELS: ReadonlyArray<string> = [
  'background',
  'objective',
  'objectives',
  'aim',
  'aims',
  'purpose',
  'methods',
  'materials and methods',
  'results',
  'conclusion',
  'conclusions',
];

/** Rank used to order issues: error first, ok last. */
const SEVERITY_RANK: Readonly<Record<ComplianceSeverity, number>> = {
  error: 0,
  warn: 1,
  info: 2,
  ok: 3,
};

/** Lowercase, fold common Turkish diacritics, and collapse whitespace. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadings(headings: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (const h of headings) {
    if (typeof h !== 'string') continue;
    const n = normalize(h);
    if (n.length > 0) out.push(n);
  }
  return out;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

/** Aliases that should satisfy a given canonical heading (incl. the heading itself). */
function aliasesFor(canonical: string): string[] {
  const aliases = new Set<string>([canonical]);
  for (const group of SECTION_SYNONYMS) {
    if (group.includes(canonical)) {
      for (const alias of group) aliases.add(alias);
    }
  }
  return [...aliases];
}

/** True if any document heading matches the canonical name or a synonym/partial. */
function hasHeading(canonical: string, docHeadings: ReadonlyArray<string>): boolean {
  const targets = aliasesFor(canonical);
  for (const heading of docHeadings) {
    for (const target of targets) {
      if (heading === target) return true;
      // Allow partials in both directions, e.g. "materials and methods" vs "methods".
      if (target.length >= 4 && (heading.includes(target) || target.includes(heading))) {
        return true;
      }
    }
  }
  return false;
}

/** True if a document heading is an abstract heading (short aliases matched exactly). */
function hasAbstractHeading(docHeadings: ReadonlyArray<string>): boolean {
  for (const heading of docHeadings) {
    for (const alias of ABSTRACT_ALIASES) {
      if (heading === alias) return true;
      if (alias.length >= 4 && heading.includes(alias)) return true;
    }
  }
  return false;
}

function checkWordCount(template: JournalTemplate, stats: WritingStats): ComplianceIssue {
  const limit = template.totalWordLimit;
  if (typeof limit !== 'number' || limit <= 0) {
    return {
      severity: 'ok',
      category: 'word-count',
      message: 'No total word limit specified by the journal.',
      detail: `Current: ${stats.words} words.`,
    };
  }
  const detail = `Current: ${stats.words} / limit: ${limit} words.`;
  if (stats.words > limit * 1.1) {
    return {
      severity: 'error',
      category: 'word-count',
      message: `Word count exceeds the limit by more than 10%.`,
      detail,
    };
  }
  if (stats.words > limit) {
    return {
      severity: 'warn',
      category: 'word-count',
      message: `Word count is slightly over the limit (within 10%).`,
      detail,
    };
  }
  return {
    severity: 'ok',
    category: 'word-count',
    message: `Word count is within the limit.`,
    detail,
  };
}

function checkAbstractPresence(
  template: JournalTemplate,
  docHeadings: ReadonlyArray<string>,
): ComplianceIssue {
  const present = hasAbstractHeading(docHeadings);
  const abstractSection = template.sections.find((s) => normalize(s.heading) === 'abstract');
  const required = abstractSection?.required ?? false;
  if (present) {
    return {
      severity: 'ok',
      category: 'abstract',
      message: 'Abstract section is present.',
    };
  }
  if (required) {
    return {
      severity: 'error',
      category: 'abstract',
      message: 'Abstract section is required but missing.',
      detail: 'Add a heading titled "Abstract" (or "Öz"/"Özet").',
    };
  }
  return {
    severity: 'info',
    category: 'abstract',
    message: 'No abstract heading detected.',
    detail: 'The journal does not list it as required.',
  };
}

function checkAbstractLength(
  template: JournalTemplate,
  abstractText: string | undefined,
): ComplianceIssue {
  const limit = template.abstractWordLimit;
  if (typeof limit !== 'number' || limit <= 0) {
    return {
      severity: 'ok',
      category: 'abstract',
      message: 'No abstract word limit specified by the journal.',
    };
  }
  if (typeof abstractText !== 'string') {
    return {
      severity: 'info',
      category: 'abstract',
      message: "Couldn't measure abstract length.",
      detail: `Journal limit is ${limit} words; abstract text was not available.`,
    };
  }
  const words = countWords(abstractText);
  const detail = `Abstract: ${words} / limit: ${limit} words.`;
  if (words > limit) {
    return {
      severity: 'warn',
      category: 'abstract',
      message: 'Abstract exceeds the word limit.',
      detail,
    };
  }
  return {
    severity: 'ok',
    category: 'abstract',
    message: 'Abstract length is within the limit.',
    detail,
  };
}

function checkSection(
  section: JournalSection,
  docHeadings: ReadonlyArray<string>,
): ComplianceIssue {
  const canonical = normalize(section.heading);
  const present = hasHeading(canonical, docHeadings);
  if (present) {
    return {
      severity: 'ok',
      category: 'section',
      message: `Section "${section.heading}" is present.`,
    };
  }
  return {
    severity: 'error',
    category: 'section',
    message: `Required section "${section.heading}" is missing.`,
    detail: 'Add this heading or an accepted synonym.',
  };
}

function checkStatement(statement: RequiredStatement, haystack: string): ComplianceIssue {
  const found = statement.keywords.some(
    (kw) => typeof kw === 'string' && kw.length > 0 && haystack.includes(kw.toLowerCase()),
  );
  if (found) {
    return {
      severity: 'ok',
      category: 'statement',
      message: `"${statement.label}" statement appears to be present.`,
    };
  }
  return {
    severity: 'warn',
    category: 'statement',
    message: `"${statement.label}" statement may be missing.`,
    detail: 'These are often placed near the end of the manuscript.',
  };
}

function checkReferenceStyle(
  template: JournalTemplate,
  referenceStyle: CitationStyleId,
): ComplianceIssue {
  if (template.referenceStyle === referenceStyle) {
    return {
      severity: 'ok',
      category: 'reference-style',
      message: `Reference style matches the journal (${STYLE_LABELS[referenceStyle]}).`,
    };
  }
  const expected = STYLE_LABELS[template.referenceStyle];
  const current = STYLE_LABELS[referenceStyle];
  return {
    severity: 'warn',
    category: 'reference-style',
    message: `Reference style mismatch.`,
    detail: `Journal expects ${expected}, project is set to ${current}.`,
  };
}

function checkStructure(
  template: JournalTemplate,
  abstractText: string | undefined,
): ComplianceIssue {
  if (template.abstractStructure !== 'structured') {
    return {
      severity: 'ok',
      category: 'structure',
      message: 'No structured-abstract requirement.',
    };
  }
  if (typeof abstractText !== 'string' || abstractText.trim().length === 0) {
    return {
      severity: 'info',
      category: 'structure',
      message: 'Structured abstract required, but abstract text was not available to check.',
    };
  }
  const normalized = normalize(abstractText);
  const matched = STRUCTURE_LABELS.filter((label) => normalized.includes(normalize(label)));
  if (matched.length >= 2) {
    return {
      severity: 'ok',
      category: 'structure',
      message: 'Abstract appears to be structured.',
      detail: `Found labels: ${matched.slice(0, 5).join(', ')}.`,
    };
  }
  return {
    severity: 'info',
    category: 'structure',
    message: 'Abstract may be unstructured.',
    detail: 'Journal expects a structured abstract (e.g. Background, Methods, Results, Conclusion).',
  };
}

/** Stable sort by severity (error → warn → info → ok), preserving insertion order. */
function orderBySeverity(issues: ReadonlyArray<ComplianceIssue>): ComplianceIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const rankDiff = SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity];
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    })
    .map((entry) => entry.issue);
}

/**
 * Run all compliance checks for a manuscript against a journal template.
 * Pure and total: tolerates empty headings / text without throwing.
 */
export function checkCompliance(input: ComplianceInput): ComplianceReport {
  const { template, stats, plainText, sectionHeadings, referenceStyle, abstractText } = input;

  const docHeadings = normalizeHeadings(sectionHeadings ?? []);
  const haystack = typeof plainText === 'string' ? plainText.toLowerCase() : '';

  const collected: ComplianceIssue[] = [];

  collected.push(checkWordCount(template, stats));
  collected.push(checkAbstractPresence(template, docHeadings));
  collected.push(checkAbstractLength(template, abstractText));

  for (const section of template.sections) {
    if (section.required) collected.push(checkSection(section, docHeadings));
  }

  for (const statement of template.requiredStatements) {
    collected.push(checkStatement(statement, haystack));
  }

  collected.push(checkReferenceStyle(template, referenceStyle));
  collected.push(checkStructure(template, abstractText));

  const issues = orderBySeverity(collected);
  const total = issues.length;
  const passed = issues.filter((issue) => issue.severity === 'ok').length;
  const score = total > 0 ? Math.round((100 * passed) / total) : 100;

  return {
    templateId: template.id,
    templateName: template.name,
    score,
    issues,
    passed,
    total,
  };
}
