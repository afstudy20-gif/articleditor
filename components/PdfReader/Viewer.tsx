'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from '@/lib/pdf/worker';

type Props = {
  file: File | ArrayBuffer | string;
  onDocLoaded?: (doc: PDFDocumentProxy) => void;
  scale?: number;
};

export function PdfViewer({ file, onDocLoaded, scale = 1.4 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    async function load() {
      const pdfjsLib = await loadPdfjs();
      setLoading(true);
      setError(null);
      try {
        const data =
          file instanceof File
            ? await file.arrayBuffer()
            : typeof file === 'string'
              ? file
              : file;
        const task = pdfjsLib.getDocument({ data: data as ArrayBuffer });
        doc = await task.promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        onDocLoaded?.(doc);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
          const page = await doc.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 16px';
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,.12)';
          canvas.style.background = 'white';
          container.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          } as Parameters<typeof page.render>[0]).promise;
        }
        setLoading(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (doc) {
        const maybeDestroy = (doc as unknown as { destroy?: () => void }).destroy;
        maybeDestroy?.call(doc);
      }
    };
  }, [file, scale, onDocLoaded]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600">
        {loading ? 'Loading PDF…' : `${pageCount} page${pageCount === 1 ? '' : 's'}`}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 p-4" />
    </div>
  );
}
