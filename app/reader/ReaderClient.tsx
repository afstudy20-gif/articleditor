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
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!window.launchQueue) return;
    window.launchQueue.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (!handle || handle.kind !== 'file') return;
      const f = await (handle as FileSystemFileHandle).getFile();
      setFile(f);
    });
  }, []);

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
          <label className="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
            Open PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
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
          {file ? (
            <PdfViewer file={file} onDocLoaded={setDoc} />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-center text-gray-400">
              <div>
                <p className="mb-1 text-sm">No PDF loaded.</p>
                <p className="text-xs">Click “Open PDF” above to start.</p>
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
