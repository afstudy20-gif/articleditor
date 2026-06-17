'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { fetchPdfBytes, fetchPdfInBrowser, resolvePdfUrl } from '@/lib/pdf/client-source';
import { loadPdfjs } from '@/lib/pdf/worker';
import { AnnotationCanvas, type AnnotationTool } from './AnnotationCanvas';
import { TextSelectionLayer } from './TextSelectionLayer';
import { SelectionPopup } from './SelectionPopup';
import { docKeyForSource } from '@/lib/pdf/annotations';

export type CapturedNote = {
  text: string;
  translation?: string;
  page: number;
  sourceUrl?: string;
};

type Props = {
  file: File | ArrayBuffer | string;
  onDocLoaded?: (doc: PDFDocumentProxy) => void;
  canAddNote?: boolean;
  onAddNote?: (note: CapturedNote) => void;
};

const TOOLS: { id: AnnotationTool; label: string; key: string }[] = [
  { id: 'select', label: '↖', key: 'V' },
  { id: 'pen', label: '✏', key: 'P' },
  { id: 'highlight', label: '🖍', key: 'H' },
  { id: 'eraser', label: '⌫', key: 'E' },
  { id: 'line', label: '╱', key: 'L' },
  { id: 'arrow', label: '→', key: 'A' },
  { id: 'rect', label: '▭', key: 'R' },
  { id: 'circle', label: '◯', key: 'C' },
  { id: 'text', label: 'T', key: 'T' },
];

const COLORS = [
  '#e94560', '#ff6b35', '#ffc107', '#4caf50', '#2196f3',
  '#9c27b0', '#000000', '#ffffff', '#607d8b', '#795548',
];

type Selection = { text: string; anchor: { x: number; y: number } };

export function PdfViewer({ file, onDocLoaded, canAddNote = false, onAddNote }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.4);
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  const [bgSize, setBgSize] = useState({ w: 0, h: 0 });
  const [pageView, setPageView] = useState<{ page: PDFPageProxy; viewport: PageViewport } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tool, setTool] = useState<AnnotationTool>('select');
  const [color, setColor] = useState('#e94560');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);

  const [textMode, setTextMode] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);

  const renderCanvas = useRef<HTMLCanvasElement | null>(null);
  const sourceUrl = typeof file === 'string' ? file : undefined;

  // Stable per-document id so annotations persist and never bleed across PDFs.
  const docKey = useMemo(
    () => (file instanceof ArrayBuffer ? `ab:${file.byteLength}` : docKeyForSource(file)),
    [file],
  );

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: PDFDocumentProxy | null = null;

    async function load() {
      const pdfjsLib = await loadPdfjs();
      setLoading(true);
      setError(null);
      try {
        if (typeof file === 'string') {
          const resolved = await resolvePdfUrl(file);
          try {
            const task = pdfjsLib.getDocument({ url: resolved });
            pdfDoc = await task.promise;
          } catch (e: unknown) {
            console.warn('pdf.js URL load failed, trying browser fetch:', e);
            const browserBytes = await fetchPdfInBrowser(resolved);
            if (browserBytes) {
              const task = pdfjsLib.getDocument({ data: browserBytes });
              pdfDoc = await task.promise;
            } else {
              console.warn('Browser fetch failed, falling back to server proxy');
              const bytes = await fetchPdfBytes(resolved);
              const task = pdfjsLib.getDocument({ data: bytes });
              pdfDoc = await task.promise;
            }
          }
        } else {
          const task = pdfjsLib.getDocument({ data: file instanceof File ? await file.arrayBuffer() : file });
          pdfDoc = await task.promise;
        }
        
        if (cancelled) return;
        setDoc(pdfDoc);
        setPageCount(pdfDoc.numPages);
        setPageNum(1);
        onDocLoaded?.(pdfDoc);
        setLoading(false);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(
            typeof file === 'string'
              ? `${message} The PDF host may block cross-origin access; download the file and use "Open file".`
              : message,
          );
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (pdfDoc) {
        const maybeDestroy = (pdfDoc as unknown as { destroy?: () => void }).destroy;
        maybeDestroy?.call(pdfDoc);
      }
    };
  }, [file, onDocLoaded]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;

    async function renderCurrentPage() {
      const page = await doc!.getPage(pageNum);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = renderCanvas.current ?? document.createElement('canvas');
      renderCanvas.current = canvas;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
      if (cancelled) return;
      setBgDataUrl(canvas.toDataURL('image/png'));
      setBgSize({ w: viewport.width, h: viewport.height });
      setPageView({ page, viewport });
    }

    renderCurrentPage();
    return () => { cancelled = true; };
  }, [doc, pageNum, scale]);

  // Selection is page-specific; clear it when the page or zoom changes.
  useEffect(() => { setSelection(null); }, [pageNum, scale]);

  const prevPage = useCallback(() => setPageNum((n) => Math.max(1, n - 1)), []);
  const nextPage = useCallback(() => setPageNum((n) => Math.min(pageCount, n + 1)), [pageCount]);
  const zoomIn = useCallback(() => setScale((s) => Math.min(4, +(s + 0.2).toFixed(1))), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(1))), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toUpperCase() === 'S') { setTextMode((v) => !v); e.preventDefault(); return; }
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t) { setTextMode(false); setTool(t.id); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleAddNote = useCallback(
    (payload: { text: string; translation?: string }) => {
      onAddNote?.({ ...payload, page: pageNum, sourceUrl });
    },
    [onAddNote, pageNum, sourceUrl],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-2 py-1">
        <button
          onClick={() => setTextMode((v) => !v)}
          title="Metin seç / çevir (S)"
          className={`rounded px-2 py-1 text-sm ${textMode ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
        >
          ⌶
        </button>
        <span className="mx-1 h-5 w-px bg-gray-300" />
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTextMode(false); setTool(t.id); }}
            title={`${t.id} (${t.key})`}
            className={`rounded px-2 py-1 text-sm ${!textMode && tool === t.id ? 'bg-teal-700 text-white' : 'hover:bg-gray-100'}`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-gray-300" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-teal-700' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-gray-300" />
        <label className="flex items-center gap-1 text-xs text-gray-600">
          W
          <input
            type="range"
            min={1}
            max={24}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(+e.target.value)}
            className="w-16"
          />
          <span className="w-4 text-center">{strokeWidth}</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          α
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(+e.target.value / 100)}
            className="w-16"
          />
        </label>
        <span className="mx-1 h-5 w-px bg-gray-300" />
        {loading && <span className="text-xs text-gray-500">Loading…</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 overflow-auto bg-gray-100">
        {bgDataUrl && (
          <div className="flex items-start justify-center p-4">
            <div className="relative" style={{ width: bgSize.w, height: bgSize.h }}>
              <AnnotationCanvas
                key={pageNum}
                width={bgSize.w}
                height={bgSize.h}
                backgroundUrl={bgDataUrl}
                tool={tool}
                color={color}
                strokeWidth={strokeWidth}
                opacity={opacity}
                pageNum={pageNum}
                docKey={docKey}
              />
              {textMode && pageView && (
                <TextSelectionLayer
                  key={`tl-${pageNum}-${scale}`}
                  page={pageView.page}
                  viewport={pageView.viewport}
                  onSelect={(text, anchor) => setSelection({ text, anchor })}
                  onClear={() => setSelection(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {selection && (
        <SelectionPopup
          text={selection.text}
          anchor={selection.anchor}
          canAddNote={canAddNote}
          onAddNote={handleAddNote}
          onClose={() => setSelection(null)}
        />
      )}

      {/* Bottom nav */}
      <div className="flex items-center justify-center gap-3 border-t border-gray-200 bg-white px-3 py-1.5 text-xs">
        <button onClick={prevPage} disabled={pageNum <= 1} className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-30">
          ◀ Prev
        </button>
        <span className="text-gray-600">
          {pageNum} / {pageCount}
        </span>
        <button onClick={nextPage} disabled={pageNum >= pageCount} className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-30">
          Next ▶
        </button>
        <span className="h-4 w-px bg-gray-300" />
        <button onClick={zoomOut} className="rounded px-2 py-0.5 hover:bg-gray-100">−</button>
        <span className="text-gray-600">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="rounded px-2 py-0.5 hover:bg-gray-100">+</button>
      </div>
    </div>
  );
}
