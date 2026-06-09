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

export type ProjectDocument = {
  id: string;
  type: 'cover' | 'title-page' | 'response' | 'contrib' | 'coi' | 'custom';
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type Project = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  doc?: unknown;
  refs: Ref[];
  bodyText?: string;
  settings?: {
    // Built-in id ('vancouver'|'apa'|'ama'|'ieee') or a 'custom:<id>' style.
    style?: string;
    aiProvider?: 'anthropic' | 'openai';
  };
  deleted?: number | null;
  documents?: ProjectDocument[];
  supplementary?: string;
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
};
