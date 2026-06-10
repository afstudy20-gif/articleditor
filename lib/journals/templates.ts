// Curated journal template presets for the academic manuscript editor.
//
// Each template conforms to the contracts in ./types.ts. Section headings use
// canonical English so downstream compliance matching stays uniform, and
// required statements are picked from DEFAULT_REQUIRED_STATEMENTS by reference
// so the keyword lists never drift between templates.

import type {
  AbstractStructure,
  CitationStyleId,
  JournalSection,
  JournalTemplate,
  RequiredStatement,
} from './types';

/**
 * Reusable, lowercased statement definitions. Templates reference these by id
 * via `pickStatements` so the keyword lists stay consistent everywhere.
 */
export const DEFAULT_REQUIRED_STATEMENTS: readonly RequiredStatement[] = [
  {
    id: 'ethics',
    label: 'Ethics Approval',
    keywords: [
      'ethics',
      'ethical approval',
      'irb',
      'institutional review',
      'helsinki',
    ],
  },
  {
    id: 'informed-consent',
    label: 'Informed Consent',
    keywords: ['informed consent', 'consent'],
  },
  {
    id: 'funding',
    label: 'Funding',
    keywords: ['funding', 'financial support', 'grant', 'supported by'],
  },
  {
    id: 'conflict-of-interest',
    label: 'Conflict of Interest',
    keywords: [
      'conflict of interest',
      'competing interest',
      'no conflict',
      'declare',
    ],
  },
  {
    id: 'data-availability',
    label: 'Data Availability',
    keywords: ['data availability', 'data are available', 'data sharing'],
  },
  {
    id: 'author-contributions',
    label: 'Author Contributions',
    keywords: ['author contribution', 'contributed to', 'conceptualization'],
  },
  {
    id: 'acknowledgments',
    label: 'Acknowledgments',
    keywords: ['acknowledg'],
  },
] as const;

const STATEMENTS_BY_ID: ReadonlyMap<string, RequiredStatement> = new Map(
  DEFAULT_REQUIRED_STATEMENTS.map((statement) => [statement.id, statement]),
);

/**
 * Resolve an ordered list of required statements by id. Unknown ids are
 * skipped so a typo never produces an `undefined` entry in a template.
 */
function pickStatements(...ids: readonly string[]): RequiredStatement[] {
  const picked: RequiredStatement[] = [];
  for (const id of ids) {
    const statement = STATEMENTS_BY_ID.get(id);
    if (statement) {
      picked.push(statement);
    }
  }
  return picked;
}

// Citation-style aliases for readability at the call sites below.
const VANCOUVER: CitationStyleId = 'vancouver';
const APA: CitationStyleId = 'apa';

const STRUCTURED: AbstractStructure = 'structured';
const UNSTRUCTURED: AbstractStructure = 'unstructured';

/** Standard IMRaD section spine reused by several templates. */
function imradSections(headings: {
  abstract: string;
  introduction: string;
  methods: string;
  results: string;
  discussion: string;
  conclusion: string;
  references: string;
  conclusionRequired: boolean;
}): JournalSection[] {
  return [
    { heading: headings.abstract, level: 2, required: true },
    { heading: headings.introduction, level: 2, required: true },
    { heading: headings.methods, level: 2, required: true },
    { heading: headings.results, level: 2, required: true },
    { heading: headings.discussion, level: 2, required: true },
    {
      heading: headings.conclusion,
      level: 2,
      required: headings.conclusionRequired,
    },
    { heading: headings.references, level: 2, required: true },
  ];
}

export const JOURNAL_TEMPLATES: readonly JournalTemplate[] = [
  {
    id: 'imrad-generic',
    name: 'Generic IMRaD',
    description:
      'Standard Introduction-Methods-Results-and-Discussion layout suitable for most general-purpose journals.',
    referenceStyle: VANCOUVER,
    abstractStructure: STRUCTURED,
    abstractWordLimit: 250,
    totalWordLimit: 3500,
    sections: imradSections({
      abstract: 'Abstract',
      introduction: 'Introduction',
      methods: 'Methods',
      results: 'Results',
      discussion: 'Discussion',
      conclusion: 'Conclusion',
      references: 'References',
      conclusionRequired: false,
    }),
    requiredStatements: pickStatements(
      'funding',
      'conflict-of-interest',
      'ethics',
    ),
  },
  {
    id: 'icmje',
    sourceUrl: 'https://www.icmje.org/recommendations/',
    rulesUpdatedAt: '2026-01-01',
    name: 'ICMJE Recommendations',
    publisher: 'International Committee of Medical Journal Editors',
    description:
      'Uniform requirements for manuscripts submitted to biomedical journals, including full disclosure statements.',
    referenceStyle: VANCOUVER,
    abstractStructure: STRUCTURED,
    abstractWordLimit: 250,
    totalWordLimit: 4000,
    sections: imradSections({
      abstract: 'Abstract',
      introduction: 'Introduction',
      methods: 'Methods',
      results: 'Results',
      discussion: 'Discussion',
      conclusion: 'Conclusion',
      references: 'References',
      conclusionRequired: true,
    }),
    requiredStatements: pickStatements(
      'ethics',
      'informed-consent',
      'funding',
      'conflict-of-interest',
      'author-contributions',
      'data-availability',
    ),
  },
  {
    id: 'plos-one',
    sourceUrl: 'https://journals.plos.org/plosone/s/submission-guidelines',
    rulesUpdatedAt: '2026-01-01',
    name: 'PLOS ONE',
    publisher: 'Public Library of Science',
    description:
      'Multidisciplinary open-access journal with numbered references and a mandatory data availability statement.',
    referenceStyle: VANCOUVER,
    abstractStructure: UNSTRUCTURED,
    abstractWordLimit: 300,
    sections: [
      { heading: 'Abstract', level: 2, required: true },
      { heading: 'Introduction', level: 2, required: true },
      { heading: 'Materials and Methods', level: 2, required: true },
      { heading: 'Results', level: 2, required: true },
      { heading: 'Discussion', level: 2, required: true },
      { heading: 'Conclusion', level: 2, required: false },
      { heading: 'References', level: 2, required: true },
    ],
    requiredStatements: pickStatements(
      'ethics',
      'funding',
      'conflict-of-interest',
      'data-availability',
    ),
    notes:
      'References are numbered in order of appearance. A Data Availability Statement is required at submission.',
  },
  {
    id: 'nature-letter',
    sourceUrl: 'https://www.nature.com/nature/for-authors/formatting-guide',
    rulesUpdatedAt: '2026-01-01',
    name: 'Nature (Letter)',
    publisher: 'Nature Portfolio',
    description:
      'Short-format Letter with superscript numbered citations and minimal in-text headings.',
    // Nature uses superscript numbered citations, mapped to the Vancouver style.
    referenceStyle: VANCOUVER,
    abstractStructure: UNSTRUCTURED,
    abstractWordLimit: 150,
    totalWordLimit: 2500,
    sections: [
      { heading: 'Introduction', level: 2, required: false },
      { heading: 'Methods', level: 2, required: true },
      { heading: 'Results', level: 2, required: false },
      { heading: 'Discussion', level: 2, required: false },
      { heading: 'References', level: 2, required: true },
    ],
    requiredStatements: pickStatements(
      'conflict-of-interest',
      'data-availability',
    ),
    notes:
      'Letters follow a continuous narrative with few explicit headings; citations appear as superscript numbers.',
  },
  {
    id: 'bmj',
    sourceUrl: 'https://www.bmj.com/about-bmj/resources-authors',
    rulesUpdatedAt: '2026-01-01',
    name: 'BMJ',
    publisher: 'BMJ Publishing Group',
    description:
      'Structured abstract with the standard BMJ headings and full reporting statements.',
    referenceStyle: VANCOUVER,
    abstractStructure: STRUCTURED,
    abstractWordLimit: 300,
    totalWordLimit: 4000,
    sections: [
      { heading: 'Abstract', level: 2, required: true },
      { heading: 'Introduction', level: 2, required: true },
      { heading: 'Methods', level: 2, required: true },
      { heading: 'Results', level: 2, required: true },
      { heading: 'Discussion', level: 2, required: true },
      { heading: 'Conclusion', level: 2, required: false },
      { heading: 'References', level: 2, required: true },
    ],
    requiredStatements: pickStatements(
      'ethics',
      'funding',
      'conflict-of-interest',
      'author-contributions',
      'data-availability',
    ),
    notes:
      'Structured abstract headings: Objectives, Design, Setting, Participants, Interventions, Main outcome measures, Results, Conclusions.',
  },
  {
    id: 'jcm',
    sourceUrl: 'https://www.mdpi.com/journal/jcm/instructions',
    rulesUpdatedAt: '2026-06-10',
    name: 'Journal of Clinical Medicine (JCM)',
    publisher: 'MDPI',
    description:
      'Original research article preset for JCM, with a structured abstract, standard research sections, and MDPI back-matter declarations.',
    // JCM uses numbered square-bracket citations in order of appearance.
    // Vancouver is the closest built-in style; MDPI bibliography punctuation
    // still needs manual verification before submission.
    referenceStyle: VANCOUVER,
    abstractStructure: STRUCTURED,
    abstractWordLimit: 250,
    sections: [
      { heading: 'Abstract', level: 2, required: true },
      { heading: 'Keywords', level: 2, required: true },
      { heading: 'Introduction', level: 2, required: true },
      { heading: 'Materials and Methods', level: 2, required: true },
      { heading: 'Results', level: 2, required: true },
      { heading: 'Discussion', level: 2, required: true },
      { heading: 'Conclusions', level: 2, required: false },
      { heading: 'References', level: 2, required: true },
    ],
    requiredStatements: pickStatements(
      'author-contributions',
      'funding',
      'ethics',
      'informed-consent',
      'data-availability',
      'conflict-of-interest',
    ),
    notes:
      'This preset targets original research articles. JCM sets no maximum manuscript length, but expects concise reporting. Original research and systematic reviews use an approximately 250-word structured abstract with Background/Objectives, Methods, Results, and Conclusions; reviews use a 200-word unstructured abstract. Add 3-10 keywords. Conclusions are optional, and Results and Discussion may be combined. Data Availability is required; ethics approval and informed-consent statements must be supplied when applicable (or handled as instructed by the journal). References are numbered by first appearance, cited in square brackets before punctuation, and should include full article titles. A cover letter is required. Systematic/scoping reviews must also follow the relevant PRISMA guidance and include the checklist and flow diagram. Figures should be placed near their first citation and supplied at preferably 600 dpi or higher.',
  },
  {
    id: 'apa-psych',
    sourceUrl: 'https://apastyle.apa.org/style-grammar-guidelines',
    rulesUpdatedAt: '2026-01-01',
    name: 'APA (Psychology)',
    publisher: 'American Psychological Association',
    description:
      'APA-style psychology manuscript with IMRaD structure and APA section naming.',
    referenceStyle: APA,
    abstractStructure: STRUCTURED,
    abstractWordLimit: 250,
    sections: imradSections({
      abstract: 'Abstract',
      introduction: 'Introduction',
      methods: 'Method',
      results: 'Results',
      discussion: 'Discussion',
      conclusion: 'Conclusion',
      references: 'References',
      conclusionRequired: false,
    }),
    requiredStatements: pickStatements(
      'ethics',
      'conflict-of-interest',
      'funding',
    ),
    notes:
      'Follows APA 7th edition formatting; the Methods section is titled "Method".',
  },
  {
    id: 'turk-dergi',
    name: 'Türk Tıp Dergisi (Genel)',
    description:
      'General-purpose Turkish medical journal template with bilingual abstracts and Vancouver-style references.',
    referenceStyle: VANCOUVER,
    abstractStructure: STRUCTURED,
    abstractWordLimit: 250,
    totalWordLimit: 3500,
    sections: imradSections({
      abstract: 'Abstract',
      introduction: 'Introduction',
      methods: 'Methods',
      results: 'Results',
      discussion: 'Discussion',
      conclusion: 'Conclusion',
      references: 'References',
      conclusionRequired: false,
    }),
    requiredStatements: pickStatements(
      'ethics',
      'informed-consent',
      'funding',
      'conflict-of-interest',
      'author-contributions',
    ),
    notes: 'Türkçe ve İngilizce öz gereklidir. Vancouver stili.',
  },
] as const;

/** Look up a template by its stable id. */
export function getJournalTemplate(id: string): JournalTemplate | undefined {
  return JOURNAL_TEMPLATES.find((template) => template.id === id);
}
