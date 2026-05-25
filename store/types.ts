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

export type Project = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  doc?: unknown;
  refs: Ref[];
  bodyText?: string;
  settings?: {
    style?: 'vancouver' | 'apa' | 'ama' | 'ieee';
    aiProvider?: 'anthropic' | 'openai';
  };
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
