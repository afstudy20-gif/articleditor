'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfViewer, type CapturedNote } from '@/components/PdfReader/Viewer';
import { BuiltInPdfViewer } from '@/components/PdfReader/BuiltInPdfViewer';
import { CitationPanel } from '@/components/PdfReader/CitationPanel';
import { ProjectPicker } from '@/components/PdfReader/ProjectPicker';
import { NotesPanel } from '@/components/PdfReader/NotesPanel';
import { WorkspaceSaver } from '@/components/PdfReader/WorkspaceSaver';
import { StorageBar } from '@/components/PdfReader/StorageBar';
import {
  derivePdfFilename,
  getWorkspaceRoot,
  hasWritePermission,
  writeProjectJson,
} from '@/lib/fs/workspace';
import { fetchPdfBytes, resolvePdfUrl } from '@/lib/pdf/client-source';
import { findMatchingRef } from '@/lib/refs/dedupe';
import {
  addNoteToProject,
  deleteNoteFromProject,
  getProject,
  saveProject,
} from '@/store/db';
import type { ProjectNote, Ref } from '@/store/types';

type LaunchParams = { files?: FileSystemHandle[] };
type LaunchQueue = { setConsumer: (cb: (params: LaunchParams) => void) => void };
declare global {
  interface Window {
    launchQueue?: LaunchQueue;
  }
}

function dataUrlToFile(dataUrl: string, name: string, type: string): File {
  const [meta, base64] = dataUrl.split(',');
  const mime = type || meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

export function ReaderClient() {
  const [source, setSource] = useState<File | string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [tab, setTab] = useState<'citations' | 'notes'>('citations');
  const [useArtedViewer, setUseArtedViewer] = useState(false);
  const [autoScanCitations, setAutoScanCitations] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setNotes([]);
      return;
    }
    getProject(projectId).then((p) => {
      if (!cancelled) setNotes(p?.notes ?? []);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const flashToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // Best-effort: keep the on-disk project.json fresh after changes, but only
  // when a workspace is set and write access is already granted (no prompt).
  const mirrorProjectToFolder = useCallback(async (id: string) => {
    try {
      const root = await getWorkspaceRoot();
      if (!root || !(await hasWritePermission(root.handle))) return;
      const project = await getProject(id);
      if (project) await writeProjectJson(root.handle, project);
    } catch {
      /* mirroring is optional — ignore failures */
    }
  }, []);

  const handleAddNote = useCallback(
    async (note: CapturedNote) => {
      if (!projectId) {
        flashToast('Önce bir proje seçin');
        return;
      }
      try {
        const saved = await addNoteToProject(projectId, note);
        setNotes((prev) => [...prev, saved]);
        setTab('notes');
        flashToast('Not eklendi');
        void mirrorProjectToFolder(projectId);
      } catch {
        flashToast('Not eklenemedi');
      }
    },
    [projectId, flashToast, mirrorProjectToFolder],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!projectId) return;
      await deleteNoteFromProject(projectId, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      void mirrorProjectToFolder(projectId);
    },
    [projectId, mirrorProjectToFolder],
  );

  useEffect(() => {
    if (!window.launchQueue) return;
    window.launchQueue.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (!handle || handle.kind !== 'file') return;
      const f = await (handle as FileSystemFileHandle).getFile();
      setSource(f);
    });
  }, []);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    setAutoScanCitations(params.get('scan') === '1');
    const assetProjectId = params.get('projectId');
    const assetId = params.get('assetId');
    if (assetProjectId && assetId) {
      setUseArtedViewer(params.get('viewer') === 'arted');
      setProjectId(assetProjectId);
      getProject(assetProjectId)
        .then((project) => {
          const asset = project?.assets?.find((item) => item.id === assetId);
          if (!asset) {
            setToast('PDF bulunamadı');
            return;
          }
          setSource(dataUrlToFile(asset.dataUrl, asset.name, asset.type));
        })
        .catch(() => {
          setToast('PDF açılamadı');
        });
      return;
    }
    const url = params.get('url');
    setUseArtedViewer(params.get('viewer') === 'arted');
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      setUrlInput(parsed.href);
      setSource(parsed.href);
    } catch {
      setToast('Invalid PDF URL');
    }
  }, []);

  const handleOpenUrl = useCallback(() => {
    try {
      const parsed = new URL(urlInput.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Unsupported protocol');
      }
      setDoc(null);
      setSource(parsed.href);
      const next = new URL(window.location.href);
      next.searchParams.set('url', parsed.href);
      if (useArtedViewer) {
        next.searchParams.set('viewer', 'arted');
      } else {
        next.searchParams.delete('viewer');
      }
      window.history.replaceState(null, '', next);
    } catch {
      setToast('Enter a valid http(s) PDF URL');
    }
  }, [urlInput, useArtedViewer]);

  const handleAddRef = useCallback(
    async (ref: Ref) => {
      if (!projectId) {
        setToast('Select a project first');
        return;
      }
      const p = await getProject(projectId);
      if (!p) {
        setToast('Project not found');
        return;
      }
      if (findMatchingRef(p.refs, ref)) {
        setToast('Already in library');
        return;
      }
      await saveProject({ ...p, refs: [...p.refs, ref], updatedAt: Date.now() });
      flashToast(`Added: ${ref.title?.slice(0, 60) ?? ref.doi ?? 'reference'}`);
    },
    [projectId, flashToast],
  );

  const handleDownload = useCallback(async () => {
    if (!source) {
      flashToast('Önce bir PDF açın');
      return;
    }
    try {
      const filename = derivePdfFilename(source);
      const bytes =
        typeof source === 'string'
          ? await fetchPdfBytes(source)
          : new Uint8Array(await source.arrayBuffer());
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      flashToast(`İndirildi: ${filename}`);
    } catch (e) {
      flashToast(e instanceof Error ? e.message : 'İndirilemedi');
    }
  }, [source, flashToast]);

  const handlePrint = useCallback(async () => {
    if (!source) {
      flashToast('Önce bir PDF açın');
      return;
    }
    try {
      const url =
        typeof source === 'string'
          ? await resolvePdfUrl(source)
          : URL.createObjectURL(source);
      const frame = printFrameRef.current;
      if (!frame) return;
      frame.onload = () => {
        try {
          frame.contentWindow?.print();
        } catch {
          flashToast('Yazdırma penceresi açılamadı');
        } finally {
          if (typeof source !== 'string') {
            URL.revokeObjectURL(url);
          }
        }
      };
      frame.src = url;
    } catch (e) {
      flashToast(e instanceof Error ? e.message : 'Yazdırılamadı');
    }
  }, [source, flashToast]);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <Link href="/" className="text-sm font-semibold text-teal-700 hover:underline">
          ← ARTED
        </Link>
        <span className="text-sm font-medium text-gray-700">PDF Reader</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOpenUrl();
            }}
            placeholder="Paste PDF URL"
            aria-label="PDF URL"
            className="w-72 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
          />
          <button
            type="button"
            onClick={handleOpenUrl}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Open URL
          </button>
          <label className="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
            Open file
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setDoc(null);
                  setSource(f);
                }
              }}
            />
          </label>
          <div className="w-56">
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </div>
          <WorkspaceSaver source={source} projectId={projectId} onToast={flashToast} />
          <button
            type="button"
            onClick={handleDownload}
            disabled={!source}
            title="PDF’i indir"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            İndir
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!source}
            title="PDF’i yazdır"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Yazdır
          </button>
        </div>
      </header>

      <main className={`grid flex-1 overflow-hidden ${useArtedViewer ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
        <section className="overflow-hidden">
          {source ? (
            useArtedViewer ? (
              <PdfViewer
                file={source}
                onDocLoaded={setDoc}
                canAddNote={!!projectId}
                onAddNote={handleAddNote}
              />
            ) : (
              <BuiltInPdfViewer source={source} />
            )
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-gray-400">
              <div>
                <p className="mb-1 text-sm">No PDF loaded.</p>
                <p className="text-xs">Paste a PDF URL or choose a local file above.</p>
              </div>
            </div>
          )}
        </section>
        {useArtedViewer && (
          <aside className="flex flex-col overflow-hidden border-l border-gray-200">
            <div className="flex border-b border-gray-200 text-xs font-medium">
              <button
                onClick={() => setTab('citations')}
                className={`flex-1 px-3 py-2 ${tab === 'citations' ? 'border-b-2 border-teal-700 text-teal-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Atıflar
              </button>
              <button
                onClick={() => setTab('notes')}
                className={`flex-1 px-3 py-2 ${tab === 'notes' ? 'border-b-2 border-teal-700 text-teal-700' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Notlar{notes.length > 0 ? ` (${notes.length})` : ''}
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {tab === 'citations' ? (
                <CitationPanel doc={doc} onAddRef={handleAddRef} autoScan={autoScanCitations} />
              ) : (
                <NotesPanel notes={notes} hasProject={!!projectId} onDelete={handleDeleteNote} />
              )}
            </div>
            <StorageBar projectId={projectId} onToast={flashToast} />
          </aside>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      <iframe
        ref={printFrameRef}
        title="Print PDF"
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden="true"
      />
    </div>
  );
}
