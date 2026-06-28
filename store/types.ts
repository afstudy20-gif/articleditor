export type Author = {
  family?: string;
  given?: string;
  literal?: string;
};

export type RefType =
  | 'journal-article'
  | 'book'
  | 'book-chapter'
  | 'conference-paper'
  | 'thesis'
  | 'webpage'
  | 'report'
  | 'other';

export type Ref = {
  id: string;
  key?: string;
  type: RefType;
  authors: Author[];
  year?: number;
  title?: string;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  pmid?: string;
  url?: string;
  raw?: string;
  abstract?: string;
  userNote?: string;
  confidence?: number;
  enRecNum?: number;
  source?: string;
  /** Legacy import flag; bibliography output is now driven by actual citation nodes. */
  includeInBibliography?: boolean;
  // Cached embedding of (title + abstract + container) for semantic citation
  // suggestion. Regenerated when any of those fields change.
  embedding?: number[];
  embeddingSource?: string; // hash of input used to compute embedding
  // User-placed highlights inside `abstract`. Offsets reference the abstract
  // string as-is; renderer skips ranges that no longer fit (e.g. after abstract
  // text changes).
  abstractHighlights?: Array<{ start: number; end: number; color: string }>;
  // Aspect-level structured extraction (used by Compare My Work + Citation Gap).
  aspects?: {
    goals?: string[];
    methods?: string[];
    datasets?: string[];
    eval_protocols?: string[];
    limitations?: string[];
    contributions?: string[];
    findings?: string[];
  };
};

export type Citation = {
  refIds: string[];
};

export type ProjectTable = {
  id: string;
  rows: string[][];
  hasHeader: boolean;
  title?: string;
  footnote?: string;
  format?: 'html' | 'csv' | 'tsv' | 'text' | 'docx';
  source?: string;
  createdAt: number;
};

/**
 * A passage captured from the PDF reader to reuse while writing. Stored on the
 * owning project so notes follow the article through sync/snapshots.
 */
export type ProjectNote = {
  id: string;
  text: string;
  translation?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  page?: number;
  color?: string;
  createdAt: number;
};

export type ProjectDocument = {
  id: string;
  type: 'cover' | 'title-page' | 'response' | 'contrib' | 'coi' | 'copyright' | 'custom';
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type ProjectAsset = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  createdAt: number;
  updatedAt: number;
  diskPath?: string;
  submissionIncluded?: boolean;
};

export type Project = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  doc?: unknown;
  refs: Ref[];
  bodyText?: string;
  abstractText?: string;
  keywords?: string[];
  tables?: ProjectTable[];
  settings?: {
    // Built-in citation style id or a 'custom:<id>' style.
    style?: string;
    aiProvider?: 'anthropic' | 'openai';
    figureCaptionPlacement?: 'inline' | 'after-bibliography';
    fontFamily?: string;
  };
  deleted?: number | null;
  documents?: ProjectDocument[];
  assets?: ProjectAsset[];
  supplementary?: string;
  /** Passages captured from the PDF reader for use while writing. */
  notes?: ProjectNote[];
};


export type Snapshot = {
  id: string;
  projectId: string;
  label: string;
  createdAt: number;
  /** True when created automatically (e.g. before a large AI edit). */
  auto: boolean;
  doc?: unknown;
  refs: Ref[];
  wordCount?: number;
  supplementary?: string;
  abstractText?: string;
  keywords?: string[];
  tables?: ProjectTable[];
};

export type Phrase = {
  id: string;
  text: string;
  category: string;
  tags?: string[];
};

export type PhraseCategory = {
  id: string;
  name: string;
  phrases: Phrase[];
};

export type UserPhrasebank = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  active: boolean;
  categories: PhraseCategory[];
  sourceFileName?: string;
  /** True when this bank merges the built-in Academic Phrasebank with a user upload. */
  mergedWithBuiltin?: boolean;
};

export type ParsedDocument = {
  bodyText: string;
  refs: Ref[];
  markers: MarkerOccurrence[];
  unparsedRefLines: string[];
};

export type MarkerOccurrence = {
  startIndex: number;
  endIndex: number;
  raw: string;
  refNumbers: number[];
  /** Per-citation options (locator/prefix/suffix/suppressAuthor) when known. */
  cite?: {
    locator?: string;
    prefix?: string;
    suffix?: string;
    suppressAuthor?: boolean;
  };
};
