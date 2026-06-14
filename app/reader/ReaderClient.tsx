'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfViewer } from '@/components/PdfReader/Viewer';
import { CitationPanel } from '@/components/PdfReader/CitationPanel';
import { ProjectPicker } from '@/components/PdfReader/ProjectPicker';
import { getProject, saveProject } from '@/store/db';
import type { Ref } from '@/store/types';

type LaunchParams = { files?: FileSystemHandle[] };
type LaunchQueue = { setConsumer: (cb: (params: LaunchParams) => void) => void };
declare global {
  interface Window {
    launchQueue?: LaunchQueue;
  }
}

export function ReaderClient() {
  const [source, setSource] = useState<File | string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    const url = new URL(window.location.href).searchParams.get('url');
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
      window.history.replaceState(null, '', next);
    } catch {
      setToast('Enter a valid http(s) PDF URL');
    }
  }, [urlInput]);

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
      const dup = p.refs.find(
        (r) =>
          (ref.doi && r.doi?.toLowerCase() === ref.doi.toLowerCase()) ||
          (ref.pmid && r.pmid === ref.pmid) ||
          (ref.title && r.title?.toLowerCase() === ref.title.toLowerCase()),
      );
      if (dup) {
        setToast('Already in library');
        return;
      }
      await saveProject({ ...p, refs: [...p.refs, ref], updatedAt: Date.now() });
      setToast(`Added: ${ref.title?.slice(0, 60) ?? ref.doi ?? 'reference'}`);
      window.setTimeout(() => setToast(null), 2500);
    },
    [projectId],
  );

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <Link href="/" className="text-sm font-semibold text-teal-700 hover:underline">
          ← Article Editor
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
        </div>
      </header>

      <main className="grid flex-1 grid-cols-[1fr_360px] overflow-hidden">
        <section className="overflow-hidden">
          {source ? (
            <PdfViewer file={source} onDocLoaded={setDoc} />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-gray-400">
              <div>
                <p className="mb-1 text-sm">No PDF loaded.</p>
                <p className="text-xs">Paste a PDF URL or choose a local file above.</p>
              </div>
            </div>
          )}
        </section>
        <aside className="border-l border-gray-200">
          <CitationPanel doc={doc} onAddRef={handleAddRef} />
        </aside>
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
