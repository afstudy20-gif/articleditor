'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Ref } from '@/store/types';
import { saveProject } from '@/store/db';
import { ArticleEditor, computeRefOrder } from '@/components/Editor/Editor';
import { RefsPanel } from '@/components/RefsPanel/RefsPanel';
import { tiptapToBuildInput } from '@/lib/editor/to-export';
import { buildDocx } from '@/lib/docx/build';
import { refsToRis } from '@/lib/refs/ris';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines } from '@/lib/refs/parse-biblio';
import { detectMarkers } from '@/lib/markers/detect';
import { backupToBlob, buildBackup, projectFilename, parseBackup } from '@/lib/projects/backup';
import { STYLE_LABELS, type CitationStyle } from '@/lib/refs/styles';
import { RefDetail } from '@/components/RefDetail/RefDetail';
import { BibliographyPreview } from '@/components/Bibliography/BibliographyPreview';
import { buildLatex } from '@/lib/tex/build';
import JSZip from 'jszip';
import { CitationPopover } from '@/components/Editor/CitationPopover';
import { FindReplace } from '@/components/Editor/FindReplace';

type Props = {
  project: Project;
  onExit: () => void;
  onSaved: () => void;
};

type ImportPreview = {
  bodyText: string;
  refs: Ref[];
  markerCount: number;
} | null;

export function EditorClient({ project, onExit, onSaved }: Props) {
  const [title, setTitle] = useState(project.title);
  const [refs, setRefs] = useState<Ref[]>(project.refs);
  const [doc, setDoc] = useState<unknown>(project.doc);
  const [savedAt, setSavedAt] = useState<number>(project.updatedAt);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [style, setStyle] = useState<CitationStyle>(
    (project.settings?.style as CitationStyle) ?? 'vancouver',
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview>(null);
  const [importPasteText, setImportPasteText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [lookupBusyId, setLookupBusyId] = useState<string | null>(null);
  const [lookupAllBusy, setLookupAllBusy] = useState(false);
  const [highlightRefId, setHighlightRefId] = useState<string | null>(null);
  const [occurrenceCursor, setOccurrenceCursor] = useState(0);
  const [topColWidth, setTopColWidth] = useState<number>(380);
  const [bottomColWidth, setBottomColWidth] = useState<number>(380);
  const [topRowHeight, setTopRowHeight] = useState<number>(560);
  const [citationPopover, setCitationPopover] = useState<{ pos: number; refIds: string[] } | null>(null);
  const [showFind, setShowFind] = useState(false);
  const [librarySelectedIds, setLibrarySelectedIds] = useState<Set<string>>(new Set());
  const editorInstance = useRef<any>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<'topCol' | 'bottomCol' | 'row' | null>(null);

  function startTopColDrag(e: React.MouseEvent): void {
    e.preventDefault();
    dragMode.current = 'topCol';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function startBottomColDrag(e: React.MouseEvent): void {
    e.preventDefault();
    dragMode.current = 'bottomCol';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function startRowDrag(e: React.MouseEvent): void {
    e.preventDefault();
    dragMode.current = 'row';
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  useEffect(() => {
    function onMove(e: MouseEvent): void {
      if (!dragMode.current) return;
      const g = gridRef.current;
      if (!g) return;
      const rect = g.getBoundingClientRect();
      if (dragMode.current === 'topCol') {
        const fromRight = rect.right - e.clientX;
        const clamped = Math.max(260, Math.min(rect.width - 320, fromRight));
        setTopColWidth(clamped);
      } else if (dragMode.current === 'bottomCol') {
        const fromRight = rect.right - e.clientX;
        const clamped = Math.max(260, Math.min(rect.width - 320, fromRight));
        setBottomColWidth(clamped);
      } else {
        const fromTop = e.clientY - rect.top;
        const clamped = Math.max(280, Math.min(rect.height - 220, fromTop));
        setTopRowHeight(clamped);
      }
    }
    function onUp(): void {
      if (!dragMode.current) return;
      dragMode.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Drop highlight when ref no longer exists.
  useEffect(() => {
    if (highlightRefId && !refs.some((r) => r.id === highlightRefId)) {
      setHighlightRefId(null);
    }
  }, [refs, highlightRefId]);

  // Highlight propagation: combined approach.
  // 1. Set global + dispatch CustomEvent so NodeView React components re-render.
  // 2. Update each citation node's `highlighted` attr via transaction.
  // 3. Direct DOM style toggle (CSS-bypass fallback).
  useEffect(() => {
    window.__enrHighlightRefId = highlightRefId;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enr:highlight'));
    }
    const ed = editorInstance.current;
    if (!ed || ed.isDestroyed) return;
    const tr = ed.view.state.tr;
    let changed = false;
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        const shouldHighlight = highlightRefId != null && ids.includes(highlightRefId);
        const currentlyHighlighted = node.attrs?.highlighted === true;
        if (shouldHighlight !== currentlyHighlighted) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, highlighted: shouldHighlight });
          changed = true;
        }
      }
      return true;
    });
    if (changed) {
      tr.setMeta('addToHistory', false);
      ed.view.dispatch(tr);
    }

    // Direct DOM fallback via ProseMirror's nodeDOM API.
    const applyDom = (): void => {
      try {
        const view = ed.view;
        view.state.doc.descendants((node: any, pos: number) => {
          if (node.type?.name === 'citation') {
            const ids: string[] = node.attrs?.refIds ?? [];
            const dom = view.nodeDOM(pos);
            if (!dom) return true;
            // dom can be Text node or Element; find the wrapping element
            let el: HTMLElement | null =
              dom instanceof HTMLElement
                ? dom
                : (dom as Node).parentElement;
            // Walk up until we find the .enr-citation node or stop
            while (el && !el.classList?.contains('enr-citation')) {
              el = el.parentElement;
            }
            if (!el) return true;
            const shouldHighlight = highlightRefId != null && ids.includes(highlightRefId);
            if (shouldHighlight) {
              el.classList.add('enr-citation-active');
              el.setAttribute('data-highlighted', 'true');
              el.style.backgroundColor = '#dc2626';
              el.style.color = '#ffffff';
              el.style.fontWeight = '700';
            } else {
              el.classList.remove('enr-citation-active');
              el.removeAttribute('data-highlighted');
              el.style.backgroundColor = '';
              el.style.color = '';
              el.style.fontWeight = '';
            }
          }
          return true;
        });
      } catch {
        // ignore
      }
    };
    applyDom();
    const t1 = setTimeout(applyDom, 30);
    const t2 = setTimeout(applyDom, 150);
    const t3 = setTimeout(applyDom, 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [highlightRefId, doc]);

  // Find positions of citation nodes that include the given ref id.
  function findCitationsForRef(refId: string | null): number[] {
    const ed = editorInstance.current;
    if (!ed || !refId) return [];
    const positions: number[] = [];
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        if (ids.includes(refId)) positions.push(pos);
      }
      return true;
    });
    return positions;
  }

  function scrollToPosition(pos: number): void {
    const ed = editorInstance.current;
    if (!ed) return;
    ed.commands.focus();
    ed.commands.setNodeSelection(pos);
    const dom = ed.view.nodeDOM(pos) as HTMLElement | null;
    dom?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  function jumpToCitation(direction: 1 | -1): void {
    const positions = findCitationsForRef(highlightRefId);
    if (positions.length === 0) return;
    const next = (occurrenceCursor + direction + positions.length) % positions.length;
    setOccurrenceCursor(next);
    scrollToPosition(positions[next]);
  }

  function selectRef(id: string): void {
    if (id === highlightRefId) {
      setHighlightRefId(null);
      setOccurrenceCursor(0);
      return;
    }
    setHighlightRefId(id);
    setOccurrenceCursor(0);
    // Use id directly — don't depend on stale highlightRefId closure.
    setTimeout(() => {
      const positions = findCitationsForRef(id);
      if (positions.length > 0) scrollToPosition(positions[0]);
    }, 80);
  }

  const activeCitationCount = refs.length > 0 && highlightRefId
    ? (() => {
        let count = 0;
        const walk = (n: any): void => {
          if (!n) return;
          if (n.type === 'citation') {
            const ids: string[] = n.attrs?.refIds ?? [];
            if (ids.includes(highlightRefId)) count++;
          }
          if (Array.isArray(n.content)) n.content.forEach(walk);
        };
        walk(doc);
        return count;
      })()
    : 0;

  const refsById = useMemo(() => {
    const m = new Map<string, Ref>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);

  const refOrder = useMemo(() => {
    const order = computeRefOrder(doc as any, refs.map((r) => r.id));
    const m = new Map<string, number>();
    order.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [doc, refs]);

  useEffect(() => {
    window.__enrRefOrder = refOrder;
    window.__enrRefs = refsById;
    window.__enrStyle = style;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enr:refresh'));
    }
    // Also dispatch a no-op tr to nudge ProseMirror.
    const ed = editorInstance.current;
    if (ed && !ed.isDestroyed) {
      ed.view.dispatch(ed.view.state.tr.setMeta('forceUpdate', Date.now()));
    }
  }, [refOrder, refsById, style]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setSavingState('saving');
      await saveProject({
        ...project,
        title,
        refs,
        doc,
        settings: { ...(project.settings ?? {}), style },
      });
      setSavedAt(Date.now());
      setSavingState('saved');
      onSaved();
      setTimeout(() => setSavingState('idle'), 1200);
    }, 600);
    return () => clearTimeout(t);
  }, [title, refs, doc, style, project, onSaved]);

  async function callLookup(ref: Ref): Promise<Ref | null> {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'enrich', ref }),
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { ref?: Ref; error?: string };
    if (data.error) throw new Error(data.error);
    return data.ref ?? null;
  }

  const addByDoi = useCallback(async (doi: string) => {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'doi', doi }),
    });
    const data = await res.json();
    if (data?.ref) {
      // After fetching by DOI, also enrich (to pull abstract/PMID).
      const enriched: Ref = (await callLookup(data.ref as Ref).catch(() => data.ref as Ref)) ?? (data.ref as Ref);
      const r: Ref = { ...enriched, id: newRefId() };
      setRefs((prev) => [...prev, r]);
    }
  }, []);

  const search = useCallback(async (query: string): Promise<Ref[]> => {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'search', query }),
    });
    const data = await res.json();
    return (data?.refs ?? []) as Ref[];
  }, []);

  const addRef = useCallback((ref: Ref) => {
    const r: Ref = { ...ref, id: newRefId() };
    setRefs((prev) => [...prev, r]);
  }, []);

  const updateRef = useCallback((id: string, patch: Partial<Ref>) => {
    setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const deleteRef = useCallback((id: string) => {
    if (!confirm('Bu referansı silmek, makale içindeki atıfları boş bırakacak. Devam edilsin mi?')) return;
    setRefs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const insertCitation = useCallback((refId: string) => {
    const ed = editorInstance.current;
    if (!ed) return;
    ed.chain().focus().insertCitation([refId]).run();
  }, []);

  const insertCitationMulti = useCallback((refIds: string[]) => {
    const ed = editorInstance.current;
    if (!ed || refIds.length === 0) return;
    ed.chain().focus().insertCitation(refIds).run();
  }, []);

  const insertFromLibrary = useCallback((): void => {
    const ed = editorInstance.current;
    if (!ed) return;
    const ids = Array.from(librarySelectedIds);
    if (ids.length === 0) {
      alert('Kütüphaneden checkbox ile bir veya daha fazla referans seç, sonra "+ Atıf ekle"ye tıkla. Cursor’un olduğu yere yerleşir.');
      return;
    }
    // Preserve refs panel order
    const orderedIds = refs.filter((r) => librarySelectedIds.has(r.id)).map((r) => r.id);
    if (orderedIds.length === 1) {
      ed.chain().focus().insertCitation(orderedIds).run();
    } else {
      ed.chain().focus().insertCitation(orderedIds).run();
    }
    setLibrarySelectedIds(new Set());
  }, [librarySelectedIds, refs]);

  const bulkDeleteRefs = useCallback((ids: string[]) => {
    setRefs((prev) => prev.filter((r) => !ids.includes(r.id)));
  }, []);

  // Install click handler on window so Citation NodeView can call it.
  useEffect(() => {
    window.__enrOnCitationClick = (pos, ids) => {
      setCitationPopover({ pos, refIds: ids });
    };
    return () => {
      delete window.__enrOnCitationClick;
    };
  }, []);

  // Global keyboard shortcuts: Ctrl/Cmd+F (find), Ctrl/Cmd+H (replace).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowFind(true);
      } else if (mod && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setShowFind(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function replaceCitationRef(pos: number, newRefIds: string[]): void {
    const ed = editorInstance.current;
    if (!ed) return;
    if (newRefIds.length === 0) {
      ed.chain().focus().deleteCitationAt(pos).run();
    } else {
      ed.chain().focus().updateCitationRefIds(pos, newRefIds).run();
    }
    setCitationPopover(null);
  }

  function deleteCitationAtPos(pos: number): void {
    const ed = editorInstance.current;
    if (!ed) return;
    ed.chain().focus().deleteCitationAt(pos).run();
    setCitationPopover(null);
  }

  function updateAllCitations(): void {
    const ed = editorInstance.current;
    if (!ed || ed.isDestroyed) return;
    const validIds = new Set(refs.map((r) => r.id));
    const tr = ed.view.state.tr;
    let updated = 0;
    let removed = 0;
    const toDelete: Array<[number, number]> = [];
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        const validRefIds = ids.filter((id) => validIds.has(id));
        if (validRefIds.length === 0) {
          toDelete.push([pos, pos + node.nodeSize]);
          removed++;
        } else if (validRefIds.length !== ids.length) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, refIds: validRefIds });
          updated++;
        }
      }
      return true;
    });
    // Delete orphans in reverse order to preserve positions.
    for (const [from, to] of toDelete.reverse()) {
      tr.delete(from, to);
    }
    if (updated > 0 || removed > 0) {
      ed.view.dispatch(tr);
    }
    alert(`Atıflar güncellendi. ${updated} ref temizlendi, ${removed} orphan citation silindi.`);
  }

  const lookupRef = useCallback(async (id: string) => {
    setLookupBusyId(id);
    try {
      const target = refs.find((r) => r.id === id);
      if (!target) return;
      const updated = await callLookup(target);
      if (updated) {
        setRefs((prev) => prev.map((r) => (r.id === id ? { ...updated, id: r.id } : r)));
      }
    } finally {
      setLookupBusyId(null);
    }
  }, [refs]);

  const lookupAllRefs = useCallback(async () => {
    setLookupAllBusy(true);
    const snapshot = [...refs];
    const concurrency = 2;
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < snapshot.length) {
        const i = cursor++;
        const target = snapshot[i];
        setLookupBusyId(target.id);
        try {
          const updated = await callLookup(target);
          if (updated) {
            setRefs((prev) => prev.map((r) => (r.id === target.id ? { ...updated, id: r.id } : r)));
          }
        } catch {
          // ignore per-ref errors; continue
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } finally {
      setLookupBusyId(null);
      setLookupAllBusy(false);
    }
  }, [refs]);

  async function exportDocx(mode: 'active' | 'placeholder'): Promise<void> {
    const { bodyText, markers, orderedRefs } = tiptapToBuildInput(doc as any, refsById, refOrder, style);
    const blob = await buildDocx({ bodyText, markers, refs: orderedRefs, mode, title, style });
    download(blob, `${slugify(title)}-${style}-${mode}.docx`);
  }

  function exportRis(): void {
    const { orderedRefs } = tiptapToBuildInput(doc as any, refsById, refOrder, style);
    const blob = new Blob([refsToRis(orderedRefs)], { type: 'application/x-research-info-systems' });
    download(blob, `${slugify(title)}.ris`);
  }

  async function exportLatex(): Promise<void> {
    const { orderedRefs } = tiptapToBuildInput(doc as any, refsById, refOrder, style);
    const { tex, bib, bibFilename } = buildLatex({
      doc: doc as any,
      refs: orderedRefs,
      title,
      style,
    });
    const slug = slugify(title);
    const zip = new JSZip();
    zip.file(`${slug}.tex`, tex);
    zip.file(bibFilename, bib);
    zip.file(
      'README.txt',
      [
        `Article Editor LaTeX bundle`,
        `Style: ${style}`,
        ``,
        `Files:`,
        `  ${slug}.tex  — main LaTeX source`,
        `  ${bibFilename}  — BibTeX bibliography database`,
        ``,
        `Build with biber + pdflatex:`,
        `  pdflatex ${slug}`,
        `  biber ${slug}`,
        `  pdflatex ${slug}`,
        `  pdflatex ${slug}`,
        ``,
        `Or use latexmk:`,
        `  latexmk -pdf -bibtex ${slug}`,
      ].join('\n'),
    );
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    download(blob, `${slug}-latex.zip`);
  }

  function exportProjectJson(): void {
    const p: Project = { ...project, title, refs, doc };
    const blob = backupToBlob(buildBackup([p]));
    download(blob, projectFilename(p));
  }

  async function importProjectJson(file: File): Promise<void> {
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      if (!backup.projects?.length) {
        setImportError('Yedek boş.');
        return;
      }
      const p = backup.projects[0];
      if (
        !confirm(
          `"${p.title}" projesini şu anki çalışmanın üzerine yüklemek istiyor musun? Bu işlem geri alınamaz.`,
        )
      )
        return;
      setTitle(p.title ?? title);
      setRefs(p.refs ?? []);
      setDoc(p.doc ?? null);
      setImportError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportError(`Yedek yüklenemedi: ${msg}`);
    }
  }

  async function previewDocx(file: File): Promise<void> {
    setImportError(null);
    try {
      const buf = await file.arrayBuffer();
      const { plainText } = await parseDocx(buf);
      processImportText(plainText);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportError(`.docx açılamadı: ${msg}`);
    }
  }

  function processImportText(text: string): void {
    const split = splitBodyAndBiblio(text);
    const { refs: parsedRefs } = parseBiblioLines(split.refLines);
    const markers = detectMarkers(split.bodyText);
    setImportPreview({
      bodyText: split.bodyText,
      refs: parsedRefs,
      markerCount: markers.length,
    });
  }

  function applyImport(replace: boolean): void {
    if (!importPreview) return;
    const newRefs: Ref[] = importPreview.refs.map((r) => ({ ...r, id: newRefId() }));
    // Build TipTap doc with citation nodes inserted at [N], [N,M], [N-M] marker positions.
    const newDoc = buildDocWithCitations(importPreview.bodyText, newRefs);
    if (replace) {
      setRefs(newRefs);
      setDoc(newDoc);
    } else {
      setRefs((prev) => [...prev, ...newRefs]);
      setDoc((prev: any) => mergeTipTapDocs(prev, newDoc));
    }
    setShowImportModal(false);
    setImportPreview(null);
    setImportPasteText('');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={onExit} className="text-sm text-teal hover:underline shrink-0">
              ← Projelerim
            </button>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-bold text-primary bg-transparent outline-none border-b border-transparent focus:border-teal min-w-0 flex-1 max-w-xs"
            />
            <span className="text-xs text-faint shrink-0">
              {savingState === 'saving'
                ? 'Kaydediliyor…'
                : `Son kayıt ${new Date(savedAt).toLocaleTimeString('tr-TR')}`}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <label className="flex items-center gap-1.5 text-xs">
              <span className="text-muted font-semibold">Stil</span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as CitationStyle)}
                className="border border-border rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:border-teal"
                title="Atıf ve kaynakça stili"
              >
                {(Object.keys(STYLE_LABELS) as CitationStyle[]).map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <span className="w-px h-6 bg-border self-center mx-1" />
            <button
              className="btn-secondary text-xs"
              onClick={() => {
                setShowImportModal(true);
                setImportPreview(null);
                setImportError(null);
                setImportPasteText('');
              }}
            >
              İçeri aktar
            </button>
            <button className="btn-secondary text-xs" onClick={exportProjectJson}>
              Projeyi indir (.json)
            </button>
            <button className="btn-secondary text-xs" onClick={() => projectImportRef.current?.click()}>
              Proje yükle (.json)
            </button>
            <input
              ref={projectImportRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) await importProjectJson(f);
              }}
            />
            <span className="w-px h-6 bg-border self-center mx-1" />
            <button
              className="btn-secondary text-xs"
              onClick={() => setShowFind(true)}
              title="Bul ve Değiştir (Ctrl+F / Ctrl+H)"
            >
              🔍 Bul
            </button>
            <button className="btn-secondary text-xs" onClick={updateAllCitations} title="Atıfları yeniden numaralandır + orphan'ları temizle">
              ↻ Update Citations
            </button>
            <span className="w-px h-6 bg-border self-center mx-1" />
            <button className="btn-secondary text-xs" onClick={exportRis}>
              .ris
            </button>
            <button className="btn-secondary text-xs" onClick={exportLatex}>
              LaTeX (.zip)
            </button>
            <button className="btn-secondary text-xs" onClick={() => exportDocx('placeholder')}>
              Placeholder .docx
            </button>
            <button className="btn-primary text-xs" onClick={() => exportDocx('active')}>
              Aktif EndNote .docx
            </button>
          </div>
        </div>
      </header>

      {importError && (
        <div className="max-w-7xl w-full mx-auto px-6 mt-2">
          <div className="card bg-red-bg border-red-200 text-red text-sm p-3 flex items-center justify-between">
            <span>{importError}</span>
            <button className="text-red hover:underline text-xs" onClick={() => setImportError(null)}>
              kapat
            </button>
          </div>
        </div>
      )}

      <main
        ref={gridRef}
        className="flex-1 max-w-7xl w-full mx-auto px-6 py-4 hidden lg:flex flex-col min-h-0 overflow-hidden"
      >
        {/* TOP ROW */}
        <div className="flex min-w-0 overflow-hidden" style={{ height: topRowHeight }}>
          {/* Top-left: Editor */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-2 pr-2 overflow-hidden">
          {highlightRefId && activeCitationCount > 0 && (
            <div className="card flex items-center justify-between gap-2 px-3 py-2 bg-red-bg border-red-200">
              <span className="text-xs text-red font-semibold">
                Ref {refOrder.get(highlightRefId) ?? '?'}: {occurrenceCursor + 1}/{activeCitationCount} atıf
                yerleştirilmiş
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => jumpToCitation(-1)}
                  disabled={activeCitationCount < 2}
                  className="px-2 py-0.5 rounded border border-border hover:bg-white disabled:opacity-40"
                  title="Önceki atıf"
                >
                  ↑
                </button>
                <button
                  onClick={() => jumpToCitation(1)}
                  disabled={activeCitationCount < 2}
                  className="px-2 py-0.5 rounded border border-border hover:bg-white disabled:opacity-40"
                  title="Sonraki atıf"
                >
                  ↓
                </button>
                <button
                  onClick={() => setHighlightRefId(null)}
                  className="text-xs text-muted hover:text-primary ml-1"
                >
                  vurguyu kapat
                </button>
              </div>
            </div>
          )}
          {highlightRefId && activeCitationCount === 0 && (
            <div className="card flex items-center justify-between gap-2 px-3 py-2 bg-slate-50">
              <span className="text-xs text-muted">
                Ref {refOrder.get(highlightRefId) ?? '?'} henüz metne yerleştirilmemiş.
              </span>
              <button
                onClick={() => setHighlightRefId(null)}
                className="text-xs text-muted hover:text-primary"
              >
                kapat
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ArticleEditor
              initialContent={doc}
              refs={refs}
              onChange={(json) => setDoc(json)}
              onReady={(ed) => {
                editorInstance.current = ed;
              }}
              onInsertRequest={insertFromLibrary}
            />
          </div>
        </div>

          {/* Top vertical divider */}
          <div
            onMouseDown={startTopColDrag}
            className="cursor-col-resize flex items-center justify-center group shrink-0 w-2"
            title="Sürükle: üst sütun genişliği"
          >
            <div className="w-0.5 h-12 bg-border group-hover:bg-teal rounded-full transition" />
          </div>

          {/* Top-right: Atıf kütüphanesi (citation library) */}
          <div className="min-h-0 min-w-0 pl-2 overflow-hidden shrink-0" style={{ width: topColWidth }}>
            <RefsPanel
            refs={refs}
            refOrder={refOrder}
            onAddByDoi={addByDoi}
            onSearch={search}
            onAddRef={addRef}
            onInsertCitation={insertCitation}
            onInsertCitationMulti={insertCitationMulti}
            onUpdateRef={updateRef}
            onDeleteRef={deleteRef}
            onLookupRef={lookupRef}
            onLookupAll={lookupAllRefs}
            lookupBusyId={lookupBusyId}
            lookupAllBusy={lookupAllBusy}
            selectedId={highlightRefId}
            onSelectRef={selectRef}
            selectedIds={librarySelectedIds}
            onSelectedIdsChange={setLibrarySelectedIds}
            onBulkDelete={bulkDeleteRefs}
          />
          </div>
        </div>

        {/* Horizontal row divider — full width */}
        <div
          onMouseDown={startRowDrag}
          className="cursor-row-resize flex items-center justify-center group shrink-0 h-2"
          title="Sürükle: satır yüksekliği"
        >
          <div className="h-0.5 w-24 bg-border group-hover:bg-teal rounded-full transition" />
        </div>

        {/* BOTTOM ROW */}
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* Bottom-left: Kaynakça (bibliography preview) */}
          <div className="flex-1 min-h-0 min-w-0 pr-2 overflow-hidden">
            <BibliographyPreview
              refs={refs}
              refOrder={refOrder}
              style={style}
              selectedId={highlightRefId}
              onSelect={selectRef}
            />
          </div>

          {/* Bottom vertical divider */}
          <div
            onMouseDown={startBottomColDrag}
            className="cursor-col-resize flex items-center justify-center group shrink-0 w-2"
            title="Sürükle: alt sütun genişliği"
          >
            <div className="w-0.5 h-12 bg-border group-hover:bg-teal rounded-full transition" />
          </div>

          {/* Bottom-right: Detay / özet */}
          <div className="min-h-0 min-w-0 pl-2 overflow-hidden shrink-0" style={{ width: bottomColWidth }}>
            <RefDetail
              reference={highlightRefId ? refs.find((r) => r.id === highlightRefId) ?? null : null}
              number={
                highlightRefId
                  ? refOrder.get(highlightRefId) ?? refs.findIndex((r) => r.id === highlightRefId) + 1
                  : undefined
              }
            />
          </div>
        </div>
      </main>

      {/* Mobile / narrow screen fallback: stacked layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-4 lg:hidden flex flex-col gap-4 min-h-0">
        <ArticleEditor
          initialContent={doc}
          refs={refs}
          onChange={(json) => setDoc(json)}
          onReady={(ed) => {
            editorInstance.current = ed;
          }}
          onInsertRequest={insertFromLibrary}
        />
        <RefsPanel
          refs={refs}
          refOrder={refOrder}
          onAddByDoi={addByDoi}
          onSearch={search}
          onAddRef={addRef}
          onInsertCitation={insertCitation}
          onInsertCitationMulti={insertCitationMulti}
          onUpdateRef={updateRef}
          onDeleteRef={deleteRef}
          onLookupRef={lookupRef}
          onLookupAll={lookupAllRefs}
          lookupBusyId={lookupBusyId}
          lookupAllBusy={lookupAllBusy}
          selectedId={highlightRefId}
          onSelectRef={selectRef}
        />
        <BibliographyPreview refs={refs} refOrder={refOrder} style={style} selectedId={highlightRefId} onSelect={selectRef} />
        <RefDetail
          reference={highlightRefId ? refs.find((r) => r.id === highlightRefId) ?? null : null}
          number={highlightRefId ? refOrder.get(highlightRefId) ?? refs.findIndex((r) => r.id === highlightRefId) + 1 : undefined}
        />
      </main>

      {showImportModal && (
        <ImportModal
          onClose={() => {
            setShowImportModal(false);
            setImportPreview(null);
            setImportPasteText('');
          }}
          docxInputRef={docxInputRef}
          onSelectDocx={async (file) => {
            await previewDocx(file);
          }}
          pasteText={importPasteText}
          setPasteText={setImportPasteText}
          onProcessPaste={() => processImportText(importPasteText)}
          preview={importPreview}
          onApply={applyImport}
        />
      )}

      {citationPopover && (
        <CitationPopover
          pos={citationPopover.pos}
          refIds={citationPopover.refIds}
          allRefs={refs}
          onClose={() => setCitationPopover(null)}
          onReplace={replaceCitationRef}
          onDelete={deleteCitationAtPos}
        />
      )}

      {showFind && editorInstance.current && (
        <FindReplace editor={editorInstance.current} onClose={() => setShowFind(false)} />
      )}

    </div>
  );
}

function ImportModal({
  onClose,
  docxInputRef,
  onSelectDocx,
  pasteText,
  setPasteText,
  onProcessPaste,
  preview,
  onApply,
}: {
  onClose: () => void;
  docxInputRef: React.RefObject<HTMLInputElement>;
  onSelectDocx: (file: File) => Promise<void>;
  pasteText: string;
  setPasteText: (v: string) => void;
  onProcessPaste: () => void;
  preview: ImportPreview;
  onApply: (replace: boolean) => void;
}): JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-primary">İçeri aktar</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!preview && (
            <>
              <div>
                <p className="text-sm text-muted mb-2">
                  Word belgesi yükle veya metin yapıştır. Belge tarayıcıda işlenir, sunucuya yüklenmez.
                </p>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => docxInputRef.current?.click()}
                >
                  .docx seç…
                </button>
                <input
                  ref={docxInputRef}
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) await onSelectDocx(f);
                  }}
                />
              </div>
              <div>
                <label className="tool-label block mb-1">Veya metin yapıştır</label>
                <textarea
                  className="w-full min-h-[200px] font-mono text-sm border border-border rounded-lg p-3 outline-none focus:border-teal"
                  placeholder="Belge metnini yapıştır. Kaynakça otomatik algılanır."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    className="btn-primary text-sm"
                    onClick={onProcessPaste}
                    disabled={pasteText.trim().length < 20}
                  >
                    Önizle
                  </button>
                </div>
              </div>
            </>
          )}

          {preview && (
            <>
              <div className="text-sm text-secondary">
                <strong>{preview.refs.length}</strong> referans, <strong>{preview.markerCount}</strong> atıf işareti
                bulundu.
              </div>
              <div className="card p-3 max-h-[200px] overflow-auto bg-slate-50 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {preview.bodyText.slice(0, 1500)}
                {preview.bodyText.length > 1500 ? '\n…' : ''}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-teal hover:underline">
                  Algılanan referanslar ({preview.refs.length})
                </summary>
                <ol className="mt-2 space-y-1">
                  {preview.refs.map((r, i) => (
                    <li key={i} className="text-secondary">
                      <span className="font-bold">{i + 1}.</span>{' '}
                      {r.title || r.raw?.slice(0, 80) || '(başlıksız)'}
                    </li>
                  ))}
                </ol>
              </details>
              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <button className="btn-secondary text-sm" onClick={onClose}>
                  İptal
                </button>
                <button className="btn-secondary text-sm" onClick={() => onApply(false)}>
                  Mevcut çalışmaya ekle
                </button>
                <button className="btn-primary text-sm" onClick={() => onApply(true)}>
                  Üzerine yaz
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function bodyTextToTipTap(text: string): unknown {
  const paragraphs = text.split(/\r?\n+/).filter((l) => l.trim().length > 0);
  const content = paragraphs.map((p) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: p }],
  }));
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

function buildDocWithCitations(text: string, refs: Ref[]): unknown {
  const paragraphs = text.split(/\r?\n+/).filter((l) => l.trim().length > 0);
  const content = paragraphs.map((para) => ({
    type: 'paragraph',
    content: paragraphToCitationInline(para, refs),
  }));
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

function paragraphToCitationInline(para: string, refs: Ref[]): Array<Record<string, unknown>> {
  const markers = detectMarkers(para);
  if (markers.length === 0) {
    return para.length > 0 ? [{ type: 'text', text: para }] : [];
  }
  const out: Array<Record<string, unknown>> = [];
  let cursor = 0;
  for (const m of markers) {
    if (m.startIndex > cursor) {
      out.push({ type: 'text', text: para.slice(cursor, m.startIndex) });
    }
    const refIds = m.refNumbers
      .map((n) => refs[n - 1]?.id)
      .filter((id): id is string => Boolean(id));
    if (refIds.length > 0) {
      out.push({ type: 'citation', attrs: { refIds } });
    } else {
      out.push({ type: 'text', text: m.raw });
    }
    cursor = m.endIndex;
  }
  if (cursor < para.length) {
    out.push({ type: 'text', text: para.slice(cursor) });
  }
  return out;
}

function mergeTipTapDocs(prev: any, incoming: any): unknown {
  if (!prev || !prev.content) return incoming;
  if (!incoming || !incoming.content) return prev;
  return { type: 'doc', content: [...prev.content, ...incoming.content] };
}

function newRefId(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'makale'
  );
}
