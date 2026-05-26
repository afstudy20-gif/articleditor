'use client';

import { getDb } from '@/store/db';
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
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

// Check if ref with same DOI/PMID/title already exists in project
function isDuplicate(refs: Ref[], newRef: Ref): boolean {
  return refs.some((r) => {
    if (newRef.doi && r.doi && r.doi.toLowerCase() === newRef.doi.toLowerCase()) return true;
    if (newRef.pmid && r.pmid && r.pmid === newRef.pmid) return true;
    if (newRef.title && r.title && r.title.toLowerCase() === newRef.title.toLowerCase()) return true;
    return false;
  });
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
      if (isDuplicate(project.refs, newRef)) {
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

  // Ping -- extension checks if ArticleEditor is ready
  (window as any).__aeReady = true;
}
