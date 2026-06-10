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
const MDPI_ACS: CitationStyleId = 'mdpi-acs';
const MDPI_CHICAGO: CitationStyleId = 'mdpi-chicago';
const MDPI_APA: CitationStyleId = 'mdpi-apa';

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
    rulesUpdatedAt: '2026-06-11',
    name: 'Journal of Clinical Medicine (JCM)',
    publisher: 'MDPI',
    description:
      'Original research article preset for JCM, with a structured abstract, standard research sections, and MDPI back-matter declarations.',
    referenceStyle: MDPI_ACS,
    referenceStylePolicy: 'preferred',
    publisherReferenceStyles: [MDPI_ACS, MDPI_CHICAGO, MDPI_APA],
    referenceGuideUrl: 'https://www.mdpi.com/authors/layout',
    referenceRules: [
      'JCM accepts any consistently formatted reference style at initial submission; MDPI ACS is the recommended final layout.',
      'MDPI provides three house styles: ACS, Chicago author-date, and APA. For lists longer than 10 authors, ACS and Chicago use the first 10 authors followed by et al.; MDPI APA follows the APA 7 author-list rule.',
      'Number references individually in order of first appearance, including citations in figure legends and table captions.',
      'Place citation numbers in square brackets before punctuation; use an en dash for ranges.',
      'Put page locators after the citation, for example [5] (p. 10) or [6] (pp. 101–105).',
      'Include the full article title and use the MDPI ACS bibliography layout.',
      'Include author names, source title, year, volume and pagination; issue numbers are normally omitted in MDPI house style.',
      'Use the official abbreviated journal title where available; verify records that contain only the full journal name.',
      'DOIs are strongly encouraged when available.',
      'Citations used in supplementary files must also appear in the main manuscript and main reference list.',
      'Data, software and other citable research outputs should be cited as formal references where possible.',
    ],
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
      'This preset targets original research articles. JCM sets no maximum manuscript length, but expects concise reporting. Original research and systematic reviews use an approximately 250-word structured abstract with Background/Objectives, Methods, Results, and Conclusions; reviews use a 200-word unstructured abstract. Add 3-10 keywords. Conclusions are optional, and Results and Discussion may be combined. Data Availability is required; ethics approval and informed-consent statements must be supplied when applicable (or handled as instructed by the journal). JCM accepts consistently formatted references at submission but recommends the numbered MDPI ACS full-title layout for the final reference list. A cover letter is required. Systematic/scoping reviews must also follow the relevant PRISMA guidance and include the checklist and flow diagram. Figures should be placed near their first citation and supplied at preferably 600 dpi or higher.',
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
