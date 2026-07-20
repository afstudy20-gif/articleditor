'use client';

import { getDb } from '@/store/db';
import { newId } from '@/lib/id';
import { findMatchingRef } from '@/lib/refs/dedupe';
import { enrichRefViaServer } from '@/lib/refs/enrich-client';
import { refFromArticleText } from '@/lib/refs/article-metadata';
import { pdfFileToMarkdown } from '@/lib/pdf/pdf-to-markdown';
import { base64ToBytes } from '@/lib/pdf/base64';
import type { Project, Ref, Author } from '@/store/types';

// Type for external ref data coming from RefDown extension
export type ExternalRefData = {
  title?: string;
  authors?: Array<{ family?: string; given?: string; literal?: string }>;
  year?: number;
  doi?: string;
  pmid?: string;
  url?: string;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  abstract?: string;
  publisher?: string;
  type?: string;
  source?: string; // 'refdown-extension'
};

// Maps RefDown's type strings to ArticleEditor's RefType
function mapRefType(t?: string): Ref['type'] {
  const map: Record<string, Ref['type']> = {
    'article-journal': 'journal-article',
    'book': 'book',
    'chapter': 'book-chapter',
    'book-chapter': 'book-chapter',
    'paper-conference': 'conference-paper',
    'thesis': 'thesis',
    'report': 'report',
    'webpage': 'webpage',
    'article': 'journal-article',
  };
  return map[t ?? ''] ?? 'other';
}

function externalToRef(data: ExternalRefData): Ref {
  return {
    id: newId('ref'),
    type: mapRefType(data.type),
    title: data.title,
    authors: (data.authors ?? []).filter(Boolean) as Author[],
    year: data.year,
    doi: data.doi,
    pmid: data.pmid,
    url: data.url,
    containerTitle: data.containerTitle,
    volume: data.volume,
    issue: data.issue,
    pages: data.pages,
    abstract: data.abstract,
    publisher: data.publisher,
    source: data.source ?? 'refdown-extension',
  };
}

const REF_TYPE_TO_EXTERNAL: Partial<Record<Ref['type'], string>> = {
  'journal-article': 'article-journal',
  'book': 'book',
  'book-chapter': 'chapter',
  'conference-paper': 'paper-conference',
  'thesis': 'thesis',
  'report': 'report',
  'webpage': 'webpage',
};

/** Inverse of externalToRef, for metadata ARTED hands back to the extension. */
function refToExternal(ref: Ref): ExternalRefData {
  return {
    title: ref.title,
    authors: ref.authors,
    year: ref.year,
    doi: ref.doi,
    pmid: ref.pmid,
    url: ref.url,
    containerTitle: ref.containerTitle,
    volume: ref.volume,
    issue: ref.issue,
    pages: ref.pages,
    abstract: ref.abstract,
    publisher: ref.publisher,
    type: REF_TYPE_TO_EXTERNAL[ref.type] ?? 'article-journal',
    source: 'arted-pdf',
  };
}

export function setupExtensionBridge(): void {
  if (typeof window === 'undefined') return;

  // List projects (minimal info for picker)
  (window as any).__aeListProjects = async (): Promise<
    Array<{
      id: string;
      title: string;
      refCount: number;
      updatedAt: number;
    }>
  > => {
    const db = getDb();
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();
    return projects.map((p: Project) => ({
      id: p.id,
      title: p.title,
      refCount: p.refs.length,
      updatedAt: p.updatedAt,
    }));
  };

  // Add ref to a specific project
  (window as any).__aeAddRefToProject = async (
    projectId: string,
    refData: ExternalRefData,
  ): Promise<{ success: boolean; refId?: string; error?: string; duplicate?: boolean }> => {
    try {
      const db = getDb();
      const project = await db.projects.get(projectId);
      if (!project) return { success: false, error: 'Project not found' };

      const newRef = externalToRef(refData);

      // Check duplicate
      if (findMatchingRef(project.refs, newRef)) {
        return { success: false, error: 'Reference already exists', duplicate: true };
      }

      const updatedRefs = [...project.refs, newRef];
      await db.projects.put({ ...project, refs: updatedRefs, updatedAt: Date.now() });

      // Dispatch custom event so open editor can react
      window.dispatchEvent(
        new CustomEvent('ae-ref-added', {
          detail: { projectId, ref: newRef },
        }),
      );

      return { success: true, refId: newRef.id };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  };

  /**
   * Reads bibliographic metadata out of a PDF's own text.
   *
   * Chrome renders PDFs in a plugin viewer the extension cannot scrape, so
   * RefDown fetches the bytes itself and hands them over base64-encoded (the
   * only shape that survives the extension/page boundary). Extraction reuses
   * the same pdf.js pipeline as the Library PDF import, then the DOI/title is
   * enriched through the server lookup proxy.
   */
  (window as any).__aeExtractPdfMeta = async (
    base64: string,
    filename = 'document.pdf',
  ): Promise<{ ok: true; ref: ExternalRefData } | { ok: false; error: string }> => {
    try {
      const bytes = base64ToBytes(base64);
      const file = new File([bytes as BlobPart], filename, { type: 'application/pdf' });
      const { text } = await pdfFileToMarkdown(file, undefined, { extractImages: false });
      let ref = refFromArticleText({ filename, text });
      if (ref.doi || ref.title) ref = await enrichRefViaServer(ref);
      return { ok: true, ref: refToExternal(ref) };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Ping -- extension checks if ArticleEditor is ready
  (window as any).__aeReady = true;
}
