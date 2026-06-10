'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Ref } from '@/store/types';
import { saveProject, getProject, createSnapshot } from '@/store/db';
import type { Snapshot } from '@/store/types';
import { ArticleEditor, computeRefOrder } from '@/components/Editor/Editor';
import { RefsPanel } from '@/components/RefsPanel/RefsPanel';
import { tiptapToBuildInput } from '@/lib/editor/to-export';
import { buildRichDocx } from '@/lib/docx/build-rich';
import { refsToRis } from '@/lib/refs/ris';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines } from '@/lib/refs/parse-biblio';
import { detectMarkers } from '@/lib/markers/detect';
import { newId } from '@/lib/id';
import { backupToBlob, buildBackup, projectFilename, parseBackup } from '@/lib/projects/backup';
import { type StyleId, listAllStyles, isNumericStyle } from '@/lib/refs/styles';
import { StyleEditor, type StyleSeed } from '@/components/Style/StyleEditor';
import { RefDetail } from '@/components/RefDetail/RefDetail';
import { BibliographyPreview } from '@/components/Bibliography/BibliographyPreview';
import { buildLatex } from '@/lib/tex/build';
import JSZip from 'jszip';
import { CitationPopover } from '@/components/Editor/CitationPopover';
import { FindReplace } from '@/components/Editor/FindReplace';
import { IssuesPanel } from '@/components/AI/IssuesPanel';
import { ScorePanel } from '@/components/AI/ScorePanel';
import { EnhanceModal, type EnhanceState } from '@/components/AI/EnhanceModal';
import { CitationSuggestionsPanel, type Suggestion } from '@/components/AI/CitationSuggestionsPanel';
import { GapDetectPanel } from '@/components/AI/GapDetectPanel';
import { CompareModal } from '@/components/AI/CompareModal';
import { DeepResearchPanel } from '@/components/AI/DeepResearchPanel';
import type { ReviewIssueT, ScoreResultT, EnhanceModeT, ClaimT } from '@/lib/ai/schemas';
import {
  newHistoryId,
  type HistoryEntry,
  type HistoryOpType,
} from '@/lib/history';
import { embedMissingRefs, embedTexts, embedInputFor } from '@/lib/ai/embed-refs';
import { topK } from '@/lib/ai/cosine';
import { aiHeaders } from '@/lib/ai/user-keys';
import { SettingsModal } from '@/components/AI/SettingsModal';
import { CommandPalette, type Command } from '@/components/CommandPalette/CommandPalette';
import { StatsPanel } from '@/components/Stats/StatsPanel';
import { SnapshotsPanel } from '@/components/Snapshots/SnapshotsPanel';
import { FiguresPanel } from '@/components/Figures/FiguresPanel';
import { TablePanel } from '@/components/Tables/TablePanel';
import { JournalCheckPanel } from '@/components/Journal/JournalCheckPanel';
import { LettersPanel } from '@/components/Letters/LettersPanel';
import { PhrasebankPanel } from '@/components/Phrasebank/PhrasebankPanel';
import { SupplementaryPanel } from '@/components/Supplementary/SupplementaryPanel';
import { AbbreviationsPanel } from '@/components/Abbreviations/AbbreviationsPanel';
import { useTabSync } from '@/lib/hooks/useTabSync';
import { useIsDesktop } from '@/lib/hooks/useIsDesktop';
import { computeWritingStats } from '@/lib/stats/writing-stats';
import {
  buildDocWithCitations,
  parseHtmlToParagraphs,
  type ImportParagraph,
} from '@/lib/editor/import-rich';
import {
  encodeSelection,
  decodeToTipTapContent,
  encodedToPreview,
  type CitationNodeJSON,
} from '@/lib/editor/mixed-content';
import { useLang } from '@/lib/i18n/hooks';
import type { FigureCaptionPlacement } from '@/lib/figures/export-layout';

type Props = {
  project: Project;
  onExit: () => void;
  onSaved: () => void;
  onExitToProjects?: () => void;
  onGoToDocuments?: () => void;
};

type ImportPreview = {
  paragraphs: ImportParagraph[];
  bodyText: string;
  refs: Ref[];
  markerCount: number;
} | null;

export function EditorClient({ project, onExit, onSaved, onExitToProjects, onGoToDocuments }: Props) {
  const { t, lang } = useLang();
  const [title, setTitle] = useState(project.title);
  const [refs, setRefs] = useState<Ref[]>(project.refs);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const addHistory = useCallback(
    (type: HistoryOpType, description: string, undo: () => boolean | void): void => {
      setHistory((prev) => [
        { id: newHistoryId(), time: Date.now(), type, description, undo },
        ...prev,
      ].slice(0, 100)); // cap to last 100 ops
    },
    [],
  );

  const undoHistory = useCallback((id: string): void => {
    setHistory((prev) => {
      const entry = prev.find((h) => h.id === id);
      if (!entry || entry.undone) return prev;
      try {
        entry.undo();
      } catch {
        // ignore; mark as undone anyway
      }
      return prev.map((h) => (h.id === id ? { ...h, undone: true } : h));
    });
  }, []);

  const clearHistory = useCallback((): void => {
    setHistory([]);
  }, []);
  const [doc, setDoc] = useState<unknown>(project.doc);
  const [savedAt, setSavedAt] = useState<number>(project.updatedAt);

  // Sync editor Heading 1 to project title automatically
  useEffect(() => {
    const textTitle = findHeading1Text(doc);
    if (textTitle && textTitle !== title) {
      setTitle(textTitle);
    }
  }, [doc, title]);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [style, setStyle] = useState<StyleId>(
    (project.settings?.style as StyleId) ?? 'vancouver',
  );
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [styleSeed, setStyleSeed] = useState<StyleSeed | null>(null);
  const [styleOptions, setStyleOptions] = useState(() => listAllStyles());
  useEffect(() => {
    const refresh = (): void => setStyleOptions(listAllStyles());
    const onEnsStyle = (e: Event): void => {
      const detail = (e as CustomEvent).detail as StyleSeed | undefined;
      if (!detail) return;
      setStyleSeed(detail);
      setStyleEditorOpen(true);
    };
    window.addEventListener('enr-styles-updated', refresh);
    window.addEventListener('enr-open-style-editor', onEnsStyle);
    return () => {
      window.removeEventListener('enr-styles-updated', refresh);
      window.removeEventListener('enr-open-style-editor', onEnsStyle);
    };
  }, []);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportLineNumbers, setExportLineNumbers] = useState(false);
  const [figureCaptionPlacement, setFigureCaptionPlacement] = useState<FigureCaptionPlacement>(
    project.settings?.figureCaptionPlacement ?? 'inline',
  );
  const [importPreview, setImportPreview] = useState<ImportPreview>(null);
  const [importPasteText, setImportPasteText] = useState('');
  const [pastedHtmlParagraphs, setPastedHtmlParagraphs] = useState<ImportParagraph[] | null>(null);
  const [pastedPlainReference, setPastedPlainReference] = useState<string | null>(null);
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
  const [aiReview, setAiReview] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    issues: ReviewIssueT[];
    summary: string | null;
  }>({ open: false, loading: false, error: null, issues: [], summary: null });
  const [aiScore, setAiScore] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    result: ScoreResultT | null;
  }>({ open: false, loading: false, error: null, result: null });
  const [aiEnhance, setAiEnhance] = useState<{
    state: EnhanceState;
    mode: EnhanceModeT | null;
    range: { from: number; to: number } | null;
    nodes: CitationNodeJSON[];
    afterEncoded: string;
  }>({ state: { status: 'idle' }, mode: null, range: null, nodes: [], afterEncoded: '' });
  const [aiSuggest, setAiSuggest] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    query: string;
    suggestions: Suggestion[];
  }>({ open: false, loading: false, error: null, query: '', suggestions: [] });
  const [aiGaps, setAiGaps] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    items: Array<{ claim: ClaimT; suggestions: Suggestion[]; loadingSuggestions: boolean }>;
  }>({ open: false, loading: false, error: null, items: [] });
  const [embedBusy, setEmbedBusy] = useState<{ done: number; total: number } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [figuresOpen, setFiguresOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [lettersOpen, setLettersOpen] = useState(false);
  const [phrasebankOpen, setPhrasebankOpen] = useState(false);
  const [supplementary, setSupplementary] = useState<string>(project.supplementary ?? '');
  const [suppOpen, setSuppOpen] = useState(false);
  const [abbrOpen, setAbbrOpen] = useState(false);
  const [phrasebankSection, setPhrasebankSection] = useState<string | null>(null);
  const [wordGoal, setWordGoal] = useState(0);

  // Word goal persists locally (per browser, not per project).
  useEffect(() => {
    const raw = localStorage.getItem('enr-word-goal');
    if (raw) setWordGoal(Number(raw) || 0);
  }, []);
  const updateWordGoal = useCallback((n: number): void => {
    setWordGoal(n);
    localStorage.setItem('enr-word-goal', String(n));
  }, []);

  const writingStats = useMemo(() => computeWritingStats(doc), [doc]);

  // Capture a restore point before a large, hard-to-undo change (AI rewrites,
  // structure patches). Best-effort: never block the operation on failure.
  const autoSnapshot = useCallback(
    async (label: string): Promise<void> => {
      try {
        const ed = editorInstance.current;
        const liveDoc = ed && !ed.isDestroyed ? ed.getJSON() : doc;
        await createSnapshot(project.id, {
          label,
          doc: liveDoc,
          refs,
          supplementary,
          auto: true,
          wordCount: computeWritingStats(liveDoc).words,
        });
      } catch {
        // snapshotting must not break the user's action
      }
    },
    // editorInstance is a stable ref-like object
    [doc, refs, supplementary, project.id],
  );

  const restoreSnapshot = useCallback(
    (snap: Snapshot): void => {
      if (!confirm(t('snap_restore_confirm'))) return;
      setRefs(snap.refs);
      setDoc(snap.doc);
      if (snap.supplementary !== undefined) {
        setSupplementary(snap.supplementary ?? '');
      }
      const ed = editorInstance.current;
      if (ed && !ed.isDestroyed && snap.doc) {
        ed.commands.setContent(snap.doc as Record<string, unknown>);
      }
      setSnapshotsOpen(false);
    },
    [t],
  );

  // One-shot AI config check on mount — disables AI buttons when no key.
  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      fetch('/api/ai/status', { headers: aiHeaders() })
        .then((r) => r.json())
        .then((d) => {
          if (alive) setAiConfigured(Boolean(d?.configured));
        })
        .catch(() => alive && setAiConfigured(false));
    };
    refresh();
    const onKeyUpdate = (): void => refresh();
    window.addEventListener('enr-keys-updated', onKeyUpdate);
    return () => {
      alive = false;
      window.removeEventListener('enr-keys-updated', onKeyUpdate);
    };
  }, []);
  // Exactly ONE ArticleEditor mounts at a time (desktop OR mobile layout,
  // chosen by useIsDesktop). The registry prunes destroyed instances so a
  // breakpoint switch hands over cleanly to the freshly mounted editor.
  const editorRegistry = useRef<any[]>([]);
  const editorInstance = {
    get current(): any {
      editorRegistry.current = editorRegistry.current.filter((ed) => ed && !ed.isDestroyed);
      const eds = editorRegistry.current;
      for (const ed of eds) {
        if (ed?.view?.dom?.offsetParent) return ed;
      }
      return eds[eds.length - 1] ?? null;
    },
  };
  const registerEditor = (ed: any): void => {
    if (!ed) return;
    if (!editorRegistry.current.includes(ed)) editorRegistry.current.push(ed);
  };
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

  // Cross-tab edit detection — when another tab saved the same project,
  // autosave PAUSES (otherwise last-writer-wins silently destroys the other
  // tab's work) until the user picks "overwrite" or "reload".
  const { conflict: tabConflict, dismiss: dismissTabConflict, notifySaved: notifyTabSaved } = useTabSync(project.id);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (tabConflict) return undefined; // paused until conflict resolved
    const t = setTimeout(async () => {
      setSavingState('saving');
      await saveProject({
        ...project,
        title,
        refs,
        doc,
        supplementary,
        settings: { ...(project.settings ?? {}), style, figureCaptionPlacement },
      });
      setSavedAt(Date.now());
      setSavingState('saved');
      notifyTabSaved();
      onSaved();
      setTimeout(() => setSavingState('idle'), 1200);
    }, 600);
    return () => clearTimeout(t);
  }, [
    title,
    refs,
    doc,
    style,
    supplementary,
    figureCaptionPlacement,
    project,
    onSaved,
    notifyTabSaved,
    tabConflict,
  ]);

  // Conflict resolution: reload the project as saved by the other tab.
  const reloadFromDisk = useCallback(async (): Promise<void> => {
    const fresh = await getProject(project.id);
    if (fresh) {
      setTitle(fresh.title);
      setRefs(fresh.refs);
      setDoc(fresh.doc);
      setSupplementary(fresh.supplementary ?? '');
      const ed = editorInstance.current;
      if (ed && !ed.isDestroyed) {
        ed.commands.setContent(fresh.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] });
      }
    }
    dismissTabConflict();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, dismissTabConflict]);

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

  const lookupDoi = useCallback(async (doi: string): Promise<Ref | null> => {
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'doi', doi }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ref) {
        const msg = data?.error || t('ed_lookup_not_found').replace('{status}', String(res.status));
        throw new Error(msg);
      }
      const enriched: Ref = (await callLookup(data.ref as Ref).catch(() => data.ref as Ref)) ?? (data.ref as Ref);
      return enriched;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }, [t]);

  const addByDoi = useCallback(async (doi: string) => {
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'doi', doi }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ref) {
        const msg = data?.error || t('ed_lookup_not_found').replace('{status}', String(res.status));
        alert(msg);
        return;
      }
      const enriched: Ref = (await callLookup(data.ref as Ref).catch(() => data.ref as Ref)) ?? (data.ref as Ref);
      const r: Ref = { ...enriched, id: newRefId() };
      setRefs((prev) => [...prev, r]);
      addHistory(
        'add-ref',
        t('ed_ref_added_doi').replace('{title}', truncate(r.title ?? r.doi ?? r.pmid ?? doi, 60)),
        () => {
          setRefs((prev) => prev.filter((x) => x.id !== r.id));
        },
      );
    } catch (err) {
      alert(t('ed_lookup_error').replace('{msg}', err instanceof Error ? err.message : String(err)));
    }
  }, [addHistory, t]);

  const search = useCallback(async (
    query: string,
    opts?: { fromYear?: number; toYear?: number },
  ): Promise<Ref[]> => {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'search',
        query,
        fromYear: opts?.fromYear,
        toYear: opts?.toYear,
      }),
    });
    const data = await res.json();
    return (data?.refs ?? []) as Ref[];
  }, []);

  const addRef = useCallback(
    (ref: Ref) => {
      const r: Ref = { ...ref, id: newRefId() };
      setRefs((prev) => [...prev, r]);
      addHistory(
        'add-ref',
        t('ed_ref_added').replace('{title}', truncate(r.title ?? r.raw ?? r.id, 60)),
        () => {
          setRefs((prev) => prev.filter((x) => x.id !== r.id));
        },
      );
    },
    [addHistory, t],
  );

  const updateRef = useCallback(
    (id: string, patch: Partial<Ref>) => {
      let snapshot: Ref | null = null;
      setRefs((prev) => {
        const target = prev.find((r) => r.id === id);
        if (target) snapshot = { ...target };
        return prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
      });
      if (snapshot) {
        const refTitle = (snapshot as Ref).title ?? (snapshot as Ref).raw ?? id;
        addHistory(
          'update-ref',
          t('ed_ref_updated').replace('{title}', truncate(refTitle, 60)),
          () => {
            setRefs((prev) => prev.map((r) => (r.id === id ? (snapshot as Ref) : r)));
          },
        );
      }
    },
    [addHistory, t],
  );

  const deleteRef = useCallback(
    (id: string) => {
      if (!confirm(t('ed_delete_ref_confirm'))) return;
      let snapshot: Ref | null = null;
      let index = -1;
      setRefs((prev) => {
        index = prev.findIndex((r) => r.id === id);
        if (index >= 0) snapshot = { ...prev[index] };
        return prev.filter((r) => r.id !== id);
      });
      if (snapshot) {
        const refTitle = (snapshot as Ref).title ?? (snapshot as Ref).raw ?? id;
        addHistory(
          'delete-ref',
          t('ed_ref_deleted').replace('{title}', truncate(refTitle, 60)),
          () => {
            setRefs((prev) => {
              const next = [...prev];
              const safeIndex = Math.min(index, next.length);
              next.splice(safeIndex < 0 ? next.length : safeIndex, 0, snapshot as Ref);
              return next;
            });
          },
        );
      }
    },
    [addHistory, t],
  );

  // After an insertCitation chain runs, briefly tint the new citation yellow
  // so users can spot where it landed. We wait two animation frames so
  // ProseMirror finishes painting the node before we look it up via nodeDOM,
  // and resolve the inner .enr-citation span (nodeDOM returns the
  // .react-renderer.node-citation wrapper, which doesn't match our CSS rule).
  function flashCitationAt(ed: any, pos: number): void {
    if (typeof window === 'undefined') return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          const dom = ed.view.nodeDOM(pos);
          if (!dom) return;
          const inner: HTMLElement | null =
            dom.classList && dom.classList.contains('enr-citation')
              ? dom
              : dom.querySelector && dom.querySelector('.enr-citation');
          if (!inner) return;
          inner.classList.add('enr-citation-fresh');
          setTimeout(() => inner.classList.remove('enr-citation-fresh'), 3000);
        } catch {
          // ignore — DOM not ready
        }
      }),
    );
  }

  function runInsertCitation(ed: any, refIds: string[]): void {
    if (refIds.length === 0) return;
    const fromPos = ed.state.selection.from;
    const ok = ed.chain().focus().insertCitation(refIds).run();
    if (!ok) return;
    flashCitationAt(ed, fromPos);
    // Record op + undo. Atom citation occupies [fromPos, fromPos+1].
    const refsMap = new Map(refs.map((r) => [r.id, r]));
    const previewIds = refIds
      .map((id) => {
        const r = refsMap.get(id);
        return r?.title ? truncate(r.title, 30) : id;
      })
      .slice(0, 3);
    const desc =
      refIds.length === 1
        ? t('ed_citation_added').replace('{title}', previewIds[0])
        : t('ed_citation_added_multi').replace('{count}', String(refIds.length));
    addHistory('insert-citation', desc, () => {
      try {
        ed.chain().focus().deleteCitationAt(fromPos).run();
      } catch {
        // ignore — node may have moved or already removed
      }
    });
  }

  const insertCitation = useCallback((refId: string) => {
    const ed = editorInstance.current;
    if (!ed) return;
    runInsertCitation(ed, [refId]);
  }, []);

  const insertCitationMulti = useCallback((refIds: string[]) => {
    const ed = editorInstance.current;
    if (!ed) return;
    runInsertCitation(ed, refIds);
  }, []);

  const insertFromLibrary = useCallback((): void => {
    const ed = editorInstance.current;
    if (!ed) return;
    const ids = Array.from(librarySelectedIds);
    if (ids.length === 0) {
      alert(t('ed_citation_picker_hint'));
      return;
    }
    const orderedIds = refs.filter((r) => librarySelectedIds.has(r.id)).map((r) => r.id);
    runInsertCitation(ed, orderedIds);
    setLibrarySelectedIds(new Set());
  }, [librarySelectedIds, refs]);

  const insertAcademicPhrase = useCallback((text: string): void => {
    const ed = editorInstance.current;
    if (!ed) return;
    ed.chain().focus().insertContent(text).run();
  }, []);

  function detectCurrentHeading(): string | null {
    const ed = editorInstance.current;
    if (!ed || ed.isDestroyed) return null;
    const cursor = ed.state.selection.from;
    let heading: string | null = null;
    ed.state.doc.descendants((node: any, pos: number) => {
      if (pos > cursor) return false;
      if (node.type?.name === 'heading') {
        const text = node.textContent?.trim();
        if (text) heading = text;
      }
      return true;
    });
    return heading;
  }

  function openPhrasebank(): void {
    setPhrasebankSection(detectCurrentHeading());
    setPhrasebankOpen(true);
  }

  const bulkDeleteRefs = useCallback(
    (ids: string[]) => {
      let snapshots: Array<{ ref: Ref; index: number }> = [];
      setRefs((prev) => {
        snapshots = ids
          .map((id) => {
            const i = prev.findIndex((r) => r.id === id);
            return i >= 0 ? { ref: { ...prev[i] }, index: i } : null;
          })
          .filter((x): x is { ref: Ref; index: number } => x !== null)
          .sort((a, b) => a.index - b.index);
        return prev.filter((r) => !ids.includes(r.id));
      });
      addHistory(
        'bulk-delete-ref',
        `${ids.length} referans silindi`,
        () => {
          setRefs((prev) => {
            const next = [...prev];
            for (const s of snapshots) {
              const idx = Math.min(s.index, next.length);
              next.splice(idx, 0, s.ref);
            }
            return next;
          });
        },
      );
    },
    [addHistory],
  );

  // Enrich refs in-place (no add) — used by plaintext import to fetch DOI/PMID.
  const enrichRefs = useCallback(async (input: Ref[]): Promise<Ref[]> => {
    const concurrency = 2;
    const out: Ref[] = input.map((r) => ({ ...r }));
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < input.length) {
        const i = cursor++;
        try {
          const updated = await callLookup(input[i]);
          if (updated) out[i] = { ...updated, id: input[i].id };
        } catch {
          // ignore individual failures
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return out;
  }, []);

  // Extract selection text with [N] citation markers preserved. Falls back to
  // the surrounding paragraph (or doc start..1500 chars) if nothing is selected.
  const extractSelectionWithCitations = useCallback((): {
    text: string;
    context: string;
  } | null => {
    const ed = editorInstance.current;
    if (!ed) return null;
    const { state } = ed;
    const { from, to, empty } = state.selection;

    const order = refOrder;
    const renderNode = (node: any, fragText: string[]): void => {
      if (!node) return;
      if (node.isText) {
        fragText.push(node.text ?? '');
        return;
      }
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        const nums = ids
          .map((id) => order.get(id) ?? 0)
          .filter((n) => n > 0)
          .sort((a, b) => a - b);
        fragText.push(nums.length > 0 ? `[${nums.join(',')}]` : '[?]');
        return;
      }
      if (node.content && node.content.forEach) {
        node.content.forEach((child: any) => renderNode(child, fragText));
      }
    };

    const sliceText = (a: number, b: number): string => {
      const out: string[] = [];
      const slice = state.doc.slice(a, b);
      slice.content.forEach((node: any) => renderNode(node, out));
      return out.join('').trim();
    };

    if (!empty) {
      const text = sliceText(from, to);
      // Pull a 200-char window of context on either side for the reviewer.
      const ctxStart = Math.max(0, from - 200);
      const ctxEnd = Math.min(state.doc.content.size, to + 200);
      const context = sliceText(ctxStart, ctxEnd);
      return { text, context };
    }
    // Empty selection: use the current paragraph (or surrounding block).
    const $pos = state.doc.resolve(from);
    const blockStart = $pos.start($pos.depth);
    const blockEnd = $pos.end($pos.depth);
    const text = sliceText(blockStart, blockEnd);
    return { text, context: text };
  }, [refOrder]);

  // Whole-document plaintext with citation markers (uses same renderer as selection).
  const extractFullDocWithCitations = useCallback((): string => {
    const ed = editorInstance.current;
    if (!ed) return '';
    const { doc } = ed.state;
    const order = refOrder;
    const out: string[] = [];
    const walk = (node: any): void => {
      if (!node) return;
      if (node.isText) {
        out.push(node.text ?? '');
        return;
      }
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        const nums = ids
          .map((id) => order.get(id) ?? 0)
          .filter((n) => n > 0)
          .sort((a, b) => a - b);
        out.push(nums.length > 0 ? `[${nums.join(',')}]` : '[?]');
        return;
      }
      if (node.type?.isBlock) {
        if (node.content && node.content.forEach) node.content.forEach(walk);
        out.push('\n\n');
        return;
      }
      if (node.content && node.content.forEach) node.content.forEach(walk);
    };
    doc.content.forEach(walk);
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
  }, [refOrder]);

  const runAIScore = useCallback(async () => {
    const text = extractFullDocWithCitations();
    if (text.length < 50) {
      alert('Skor için en az 50 karakterlik metin gerekli.');
      return;
    }
    setAiScore({ open: true, loading: true, error: null, result: null });
    try {
      const res = await fetch('/api/ai/score', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({ text, scope: 'document', lang }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const result = (await res.json()) as ScoreResultT;
      setAiScore({ open: true, loading: false, error: null, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiScore({ open: true, loading: false, error: msg, result: null });
    }
  }, [extractFullDocWithCitations]);

  const runAIEnhance = useCallback(
    async (mode: EnhanceModeT, retryRange?: { from: number; to: number }) => {
      const ed = editorInstance.current;
      if (!ed) return;
      const { state } = ed;
      let from: number;
      let to: number;
      if (retryRange) {
        ({ from, to } = retryRange);
      } else if (!state.selection.empty) {
        from = state.selection.from;
        to = state.selection.to;
      } else {
        // Use current block as fallback.
        const $pos = state.doc.resolve(state.selection.from);
        from = $pos.start($pos.depth);
        to = $pos.end($pos.depth);
      }
      const sel = encodeSelection(state, from, to);
      const beforePreview = encodedToPreview(sel.encoded, sel.nodes, refOrder);
      if (beforePreview.length < 10) {
        alert('İyileştirme için en az 10 karakterlik metin gerekli.');
        return;
      }
      setAiEnhance({
        state: { status: 'loading', before: beforePreview },
        mode,
        range: { from: sel.from, to: sel.to },
        nodes: sel.nodes,
        afterEncoded: '',
      });
      try {
        const res = await fetch('/api/ai/enhance', {
          method: 'POST',
          headers: aiHeaders(),
          body: JSON.stringify({ text: sel.encoded, mode, lang }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          after: string;
          rationale?: string;
          citationCheck: { total: number; missing: number[]; extras: number[] };
        };
        const afterPreview = encodedToPreview(data.after, sel.nodes, refOrder);
        setAiEnhance({
          state: {
            status: 'ready',
            before: beforePreview,
            after: afterPreview,
            rationale: data.rationale,
            citationCheck: data.citationCheck,
          },
          mode,
          range: { from: sel.from, to: sel.to },
          nodes: sel.nodes,
          afterEncoded: data.after,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAiEnhance({
          state: { status: 'error', before: beforePreview, error: msg },
          mode,
          range: { from: sel.from, to: sel.to },
          nodes: sel.nodes,
          afterEncoded: '',
        });
      }
    },
    [refOrder],
  );

  const acceptEnhance = useCallback(() => {
    const ed = editorInstance.current;
    if (!ed || !aiEnhance.range || aiEnhance.state.status !== 'ready') return;
    const content = decodeToTipTapContent(aiEnhance.afterEncoded, aiEnhance.nodes);
    if (content.length === 0) return;
    void autoSnapshot(t('snap_auto_label'));
    ed.chain()
      .focus()
      .insertContentAt({ from: aiEnhance.range.from, to: aiEnhance.range.to }, content)
      .run();
    setAiEnhance({ state: { status: 'idle' }, mode: null, range: null, nodes: [], afterEncoded: '' });
  }, [aiEnhance, autoSnapshot, t]);

  const closeEnhance = useCallback(() => {
    setAiEnhance({ state: { status: 'idle' }, mode: null, range: null, nodes: [], afterEncoded: '' });
  }, []);

  const retryEnhance = useCallback(() => {
    if (!aiEnhance.mode || !aiEnhance.range) return;
    void runAIEnhance(aiEnhance.mode, aiEnhance.range);
  }, [aiEnhance.mode, aiEnhance.range, runAIEnhance]);

  // ── Aspect extractor (Faz B) ────────────────────────────────────────────
  const extractAspectsFor = useCallback(
    async (id: string): Promise<void> => {
      const ref = refs.find((r) => r.id === id);
      if (!ref) return;
      const body = {
        title: ref.title,
        abstract: ref.abstract,
        authors: ref.authors
          .map((a) => (a.literal ? a.literal : [a.family, a.given].filter(Boolean).join(', ')))
          .join('; '),
        year: ref.year,
        containerTitle: ref.containerTitle,
        raw: ref.raw,
        lang,
      };
      try {
        const res = await fetch('/api/ai/extract-aspects', {
          method: 'POST',
          headers: aiHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const aspects = await res.json();
        setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, aspects } : r)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`Aspect çıkarımı başarısız: ${msg}`);
      }
    },
    [refs],
  );

  // ── Embedding library + citation suggestions (Faz B) ────────────────────
  const ensureLibraryEmbedded = useCallback(async (): Promise<Ref[]> => {
    const needs = refs.filter((r) => !r.embedding || !r.embeddingSource);
    if (needs.length === 0) return refs;
    setEmbedBusy({ done: 0, total: needs.length });
    try {
      const updated = await embedMissingRefs(refs, {
        onProgress: (done, total) => setEmbedBusy({ done, total }),
      });
      setRefs(updated);
      return updated;
    } finally {
      setEmbedBusy(null);
    }
  }, [refs]);

  const runAISuggestCitation = useCallback(async () => {
    const ed = editorInstance.current;
    if (!ed) return;
    const sel = extractSelectionWithCitations();
    if (!sel || sel.text.length < 20) {
      alert('Atıf önerisi için en az 20 karakterlik metin seçmelisin (veya cursor’u bir paragrafa koy).');
      return;
    }
    setAiSuggest({ open: true, loading: true, error: null, query: sel.text, suggestions: [] });
    try {
      const library = await ensureLibraryEmbedded();
      if (library.length === 0) {
        throw new Error('Kütüphane boş. Önce referans ekle.');
      }
      const { embeddings } = await embedTexts([sel.text]);
      const query = embeddings[0];
      if (!query) throw new Error('Sorgu gömme başarısız');
      const matches = topK(library, query, (r) => r.embedding, 8);
      setAiSuggest({
        open: true,
        loading: false,
        error: null,
        query: sel.text,
        suggestions: matches.map((m) => ({ ref: m.item, score: m.score })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiSuggest({ open: true, loading: false, error: msg, query: sel.text, suggestions: [] });
    }
  }, [ensureLibraryEmbedded, extractSelectionWithCitations]);

  const insertSuggestedCitation = useCallback(
    (refIds: string[]) => {
      const ed = editorInstance.current;
      if (!ed) return;
      runInsertCitation(ed, refIds);
    },
    [],
  );

  // ── Citation gap detection ──────────────────────────────────────────────
  const runAIDetectGaps = useCallback(async () => {
    const text = extractFullDocWithCitations();
    if (text.length < 50) {
      alert('Belge çok kısa.');
      return;
    }
    setAiGaps({ open: true, loading: true, error: null, items: [] });
    try {
      const res = await fetch('/api/ai/gap-detect', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({ text, scope: 'document', lang }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { claims: ClaimT[] };
      setAiGaps({
        open: true,
        loading: false,
        error: null,
        items: data.claims.map((c) => ({ claim: c, suggestions: [], loadingSuggestions: false })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiGaps({ open: true, loading: false, error: msg, items: [] });
    }
  }, [extractFullDocWithCitations]);

  const loadSuggestionsForClaim = useCallback(
    async (claim: ClaimT) => {
      setAiGaps((s) => ({
        ...s,
        items: s.items.map((it) =>
          it.claim === claim ? { ...it, loadingSuggestions: true } : it,
        ),
      }));
      try {
        const library = await ensureLibraryEmbedded();
        const { embeddings } = await embedTexts([claim.quote]);
        const query = embeddings[0];
        if (!query) throw new Error('Embed failed');
        const matches = topK(library, query, (r) => r.embedding, 5);
        const suggestions: Suggestion[] = matches.map((m) => ({ ref: m.item, score: m.score }));
        setAiGaps((s) => ({
          ...s,
          items: s.items.map((it) =>
            it.claim === claim ? { ...it, suggestions, loadingSuggestions: false } : it,
          ),
        }));
      } catch {
        setAiGaps((s) => ({
          ...s,
          items: s.items.map((it) =>
            it.claim === claim ? { ...it, loadingSuggestions: false } : it,
          ),
        }));
      }
    },
    [ensureLibraryEmbedded],
  );

  const jumpToClaim = useCallback((claim: ClaimT) => {
    const ed = editorInstance.current;
    if (!ed || !claim.quote) return;
    let found = -1;
    ed.state.doc.descendants((node: any, pos: number) => {
      if (found >= 0) return false;
      if (node.isText) {
        const i = (node.text ?? '').indexOf(claim.quote);
        if (i >= 0) {
          found = pos + i;
          return false;
        }
      }
      return true;
    });
    if (found >= 0) {
      ed.chain().focus().setTextSelection({ from: found, to: found + claim.quote.length }).scrollIntoView().run();
    }
  }, []);

  // Try to detect abstract (paragraph after first heading containing "abstract"/"özet").
  const detectAbstract = useCallback((): string => {
    const ed = editorInstance.current;
    if (!ed) return '';
    const doc = ed.state.doc;
    let abstractText = '';
    let inAbstract = false;
    let firstParaText = '';
    doc.descendants((node: any) => {
      if (abstractText) return false;
      if (node.type?.name === 'heading') {
        const text = (node.textContent ?? '').toLowerCase();
        if (inAbstract && abstractText === '') {
          // Found a new heading after abstract; stop accumulation.
          return false;
        }
        if (/(abstract|özet)/i.test(text)) {
          inAbstract = true;
        } else if (inAbstract) {
          return false;
        }
        return true;
      }
      if (node.type?.name === 'paragraph') {
        const t = node.textContent ?? '';
        if (!firstParaText && t.length > 20) firstParaText = t;
        if (inAbstract && t.length > 20) {
          abstractText = t;
          return false;
        }
      }
      return true;
    });
    return abstractText || firstParaText;
  }, []);

  const runAICompare = useCallback(() => {
    if (refs.length === 0) {
      alert('Önce kütüphaneye en az bir referans ekle.');
      return;
    }
    setCompareOpen(true);
  }, [refs.length]);

  const runAIDeepResearch = useCallback(() => {
    setResearchOpen(true);
  }, []);

  // C3: doc-scope structural review reuses Reviewer with full doc text.
  // The reviewer prompt is generic enough to surface structural/coherence issues
  // when given the whole manuscript.
  const runAIStructureCheck = useCallback(async () => {
    const text = extractFullDocWithCitations();
    if (text.length < 100) {
      alert('Yapı kontrolü için belge çok kısa.');
      return;
    }
    setAiReview({ open: true, loading: true, error: null, issues: [], summary: null });
    try {
      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({
          text,
          lang,
          section: lang === 'tr' ? 'Tüm belge (yapı kontrolü)' : 'Whole document (structure check)',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAiReview({
        open: true,
        loading: false,
        error: null,
        issues: data.issues ?? [],
        summary: data.summary ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiReview({ open: true, loading: false, error: msg, issues: [], summary: null });
    }
  }, [extractFullDocWithCitations]);

  const insertCitationForClaim = useCallback((claim: ClaimT, refIds: string[]) => {
    const ed = editorInstance.current;
    if (!ed || !claim.quote) return;
    let endPos = -1;
    ed.state.doc.descendants((node: any, pos: number) => {
      if (endPos >= 0) return false;
      if (node.isText) {
        const i = (node.text ?? '').indexOf(claim.quote);
        if (i >= 0) {
          endPos = pos + i + claim.quote.length;
          return false;
        }
      }
      return true;
    });
    if (endPos >= 0) {
      const ok = ed
        .chain()
        .focus()
        .setTextSelection({ from: endPos, to: endPos })
        .insertCitation(refIds)
        .run();
      if (ok) flashCitationAt(ed, endPos);
    } else {
      runInsertCitation(ed, refIds);
    }
  }, []);

  const runAIReview = useCallback(async () => {
    const sel = extractSelectionWithCitations();
    if (!sel || sel.text.length < 20) {
      alert('AI eleştirisi için en az 20 karakterlik metin seçmelisin (veya cursor’u bir paragrafa koy).');
      return;
    }
    setAiReview({ open: true, loading: true, error: null, issues: [], summary: null });
    try {
      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({ text: sel.text, context: sel.context, lang }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setAiReview({
        open: true,
        loading: false,
        error: null,
        issues: data.issues ?? [],
        summary: data.summary ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiReview({ open: true, loading: false, error: msg, issues: [], summary: null });
    }
  }, [extractSelectionWithCitations]);

  const jumpToIssue = useCallback((issue: ReviewIssueT) => {
    const ed = editorInstance.current;
    if (!ed || !issue.quote) return;
    const plain = ed.getText() as string;
    const idx = plain.indexOf(issue.quote);
    if (idx < 0) return;
    // ProseMirror positions don't equal plain-text indices exactly; use a
    // best-effort textBetween scan over the doc.
    const { doc } = ed.state;
    let found = -1;
    doc.descendants((node: any, pos: number) => {
      if (found >= 0) return false;
      if (node.isText) {
        const i = (node.text ?? '').indexOf(issue.quote);
        if (i >= 0) {
          found = pos + i;
          return false;
        }
      }
      return true;
    });
    if (found >= 0) {
      const to = found + issue.quote.length;
      ed.chain().focus().setTextSelection({ from: found, to }).scrollIntoView().run();
    }
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

  // Listen for refs added via the RefDown Chrome extension bridge.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail;
      if (detail?.projectId === project.id) {
        getProject(project.id).then((p) => {
          if (p) setRefs(p.refs);
        });
      }
    };
    window.addEventListener('ae-ref-added', handler);
    return () => window.removeEventListener('ae-ref-added', handler);
  }, [project.id]);

  // Global keyboard shortcuts: Ctrl/Cmd+F (find), Ctrl/Cmd+H (replace).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowFind(true);
      } else if (mod && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setShowFind(true);
      } else if (mod && e.key === '.') {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if (e.key === 'Escape') {
        setFocusMode(false);
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

  function updateCitationOptsAt(
    pos: number,
    opts: { locator?: string; prefix?: string; suffix?: string; suppressAuthor?: boolean },
  ): void {
    const ed = editorInstance.current;
    if (!ed) return;
    ed.chain().focus().updateCitationOpts(pos, opts).run();
    setCitationPopover(null);
  }

  /** Current locator/prefix/suffix attrs of the citation node at pos. */
  function citationOptsAt(pos: number): { locator: string; prefix: string; suffix: string; suppressAuthor: boolean } {
    const ed = editorInstance.current;
    const node = ed && !ed.isDestroyed ? ed.state.doc.nodeAt(pos) : null;
    const attrs = node?.type?.name === 'citation' ? node.attrs : {};
    return {
      locator: attrs.locator ?? '',
      prefix: attrs.prefix ?? '',
      suffix: attrs.suffix ?? '',
      suppressAuthor: Boolean(attrs.suppressAuthor),
    };
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
    const blob = await buildRichDocx({
      doc,
      refsById,
      refOrder,
      style,
      mode,
      title,
      lineNumbers: exportLineNumbers,
      bibHeading: 'References',
      figureCaptionPlacement,
    });
    download(blob, `${slugify(title)}-${style}-${mode}.docx`);
  }

  function exportRis(): void {
    const { orderedRefs } = tiptapToBuildInput(doc as any, refsById, refOrder, style);
    const blob = new Blob([refsToRis(orderedRefs)], { type: 'application/x-research-info-systems' });
    download(blob, `${slugify(title)}.ris`);
  }

  async function exportLatex(): Promise<void> {
    const { orderedRefs } = tiptapToBuildInput(doc as any, refsById, refOrder, style);
    const { tex, bib, bibFilename, assets, warnings } = buildLatex({
      doc: doc as any,
      refs: orderedRefs,
      title,
      style,
      language: lang,
      bibliographyTitle: 'References',
      figureCaptionPlacement,
    });
    const slug = slugify(title);
    const zip = new JSZip();
    zip.file(`${slug}.tex`, tex);
    zip.file(bibFilename, bib);
    for (const asset of assets) {
      zip.file(asset.filename, asset.base64, { base64: true });
    }
    zip.file(
      'README.txt',
      [
        `Article Editor LaTeX bundle`,
        `Style: ${style}`,
        `Engine: LuaLaTeX`,
        ``,
        `Files:`,
        `  ${slug}.tex  — main LaTeX source`,
        `  ${bibFilename}  — BibTeX bibliography database`,
        ...(assets.length > 0 ? [`  assets/  — embedded manuscript images`] : []),
        ``,
        `TeXworks 0.6.11+:`,
        `  1. Open ${slug}.tex. The first mode line selects LuaLaTeX.`,
        `  2. Typeset once with LuaLaTeX.`,
        `  3. Select Biber from the TeXworks engine list and typeset once.`,
        `  4. Select LuaLaTeX again and typeset twice.`,
        `  TeXworks supplies -synctex=1 automatically for source/PDF synchronization.`,
        ``,
        `Command line alternative:`,
        `  lualatex ${slug}`,
        `  biber ${slug}`,
        `  lualatex ${slug}`,
        `  lualatex ${slug}`,
        ``,
        `Or, when latexmk is installed:`,
        `  latexmk -lualatex ${slug}.tex`,
        ...(warnings.length > 0
          ? [
              ``,
              `Export warnings:`,
              ...warnings.map((warning) => `  - ${warning}`),
            ]
          : []),
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

      editorRegistry.current.forEach((ed) => {
        if (ed && !ed.isDestroyed && p.doc) {
          ed.commands.setContent(p.doc);
        }
      });

      setImportError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportError(t('ed_import_error').replace('{msg}', msg));
    }
  }

  async function previewDocx(file: File): Promise<void> {
    setImportError(null);
    try {
      const buf = await file.arrayBuffer();
      const { paragraphs, plainText } = await parseDocx(buf);

      const split = splitBodyAndBiblio(plainText);
      const { refs: parsedRefs } = parseBiblioLines(split.refLines);

      let referencesStartIndex = paragraphs.length;
      for (let i = 0; i < paragraphs.length; i++) {
        const lower = paragraphs[i].text.trim().toLowerCase();
        if (lower === 'references' || lower === 'kaynaklar' || lower === 'bibliography' || lower === 'literatür') {
          referencesStartIndex = i;
          break;
        }
      }

      const bodyParagraphs = paragraphs.slice(0, referencesStartIndex);
      const markers = detectMarkers(bodyParagraphs.map((p) => p.text).join('\n'));

      setImportPreview({
        paragraphs: bodyParagraphs,
        bodyText: bodyParagraphs.map((p) => p.text).join('\n'),
        refs: parsedRefs,
        markerCount: markers.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportError(t('ed_import_error').replace('{msg}', msg));
    }
  }

  function processImportText(text: string): void {
    const split = splitBodyAndBiblio(text);
    const { refs: parsedRefs } = parseBiblioLines(split.refLines);

    if (pastedHtmlParagraphs && pastedPlainReference && text.trim() === pastedPlainReference.trim()) {
      let referencesStartIndex = pastedHtmlParagraphs.length;
      for (let i = 0; i < pastedHtmlParagraphs.length; i++) {
        const lower = pastedHtmlParagraphs[i].text.trim().toLowerCase();
        if (
          lower === 'references' ||
          lower === 'kaynaklar' ||
          lower === 'bibliography' ||
          lower === 'literatür'
        ) {
          referencesStartIndex = i;
          break;
        }
      }

      const bodyParagraphs = pastedHtmlParagraphs.slice(0, referencesStartIndex);
      const markers = detectMarkers(bodyParagraphs.map((p) => p.text).join('\n'));

      setImportPreview({
        paragraphs: bodyParagraphs,
        bodyText: bodyParagraphs.map((p) => p.text).join('\n'),
        refs: parsedRefs,
        markerCount: markers.length,
      });
      return;
    }

    const lines = split.bodyText.split(/\r?\n+/).filter((l) => l.trim().length > 0);
    const paragraphs = lines.map((line, idx) => {
      const headingLevel = isCommonHeading(line, idx);
      return {
        text: line,
        style: headingLevel ? `Heading${headingLevel}` : undefined,
      };
    });

    const markers = detectMarkers(split.bodyText);
    setImportPreview({
      paragraphs,
      bodyText: split.bodyText,
      refs: parsedRefs,
      markerCount: markers.length,
    });
  }

  function applyImport(replace: boolean): void {
    if (!importPreview) return;
    const newRefs: Ref[] = importPreview.refs.map((r) => ({ ...r, id: newRefId() }));
    // Build TipTap doc with citation nodes inserted at [N], [N,M], [N-M] marker positions.
    const newDoc = buildDocWithCitations(importPreview.paragraphs, newRefs);
    if (replace) {
      setRefs(newRefs);
      setDoc(newDoc);
    } else {
      setRefs((prev) => [...prev, ...newRefs]);
      setDoc((prev: any) => mergeTipTapDocs(prev, newDoc));
    }

    editorRegistry.current.forEach((ed) => {
      if (ed && !ed.isDestroyed) {
        if (replace) {
          ed.commands.setContent(newDoc);
        } else {
          const currentDoc = ed.getJSON();
          const merged = mergeTipTapDocs(currentDoc, newDoc);
          ed.commands.setContent(merged);
        }
      }
    });

    setShowImportModal(false);
    setImportPreview(null);
    setImportPasteText('');
    setPastedHtmlParagraphs(null);
    setPastedPlainReference(null);
  }

  const aiOff = aiConfigured === false;
  const commands: Command[] = [
    { id: 'insert-citation', group: t('cmd_g_editor'), label: t('ed_insert_citation'), hint: '', run: insertFromLibrary },
    { id: 'insert-academic-phrase', group: t('cmd_g_editor'), label: t('pb_cmd_insert'), keywords: 'phrasebank academic phrase', run: openPhrasebank },
    { id: 'search-phrasebank', group: t('cmd_g_editor'), label: t('pb_cmd_search'), keywords: 'phrasebank search phrases', run: openPhrasebank },
    { id: 'find', group: t('cmd_g_editor'), label: t('find_title'), hint: '⌘F', run: () => setShowFind(true) },
    { id: 'update-citations', group: t('cmd_g_editor'), label: t('ed_update_citations'), run: updateAllCitations },
    { id: 'focus', group: t('cmd_g_view'), label: t('ed_focus_mode'), hint: '⌘.', run: () => setFocusMode((v) => !v) },
    { id: 'stats', group: t('cmd_g_view'), label: t('ed_stats'), run: () => setStatsOpen(true) },
    { id: 'snapshots', group: t('cmd_g_view'), label: t('ed_snapshots'), run: () => setSnapshotsOpen(true) },
    { id: 'figures', group: t('cmd_g_view'), label: t('ed_figures'), run: () => setFiguresOpen(true) },
    { id: 'tables', group: t('cmd_g_view'), label: t('tbl_title'), run: () => setTablesOpen(true) },
    { id: 'journal-check', group: t('cmd_g_doc'), label: t('ed_journal_check'), run: () => setJournalOpen(true) },
    { id: 'letters', group: t('cmd_g_doc'), label: t('ed_letters'), run: () => { if (onGoToDocuments) onGoToDocuments(); else setLettersOpen(true); } },
    { id: 'snapshot-now', group: t('cmd_g_doc'), label: t('snap_create'), run: () => { void autoSnapshot(t('snap_manual_label')); setSnapshotsOpen(true); } },
    { id: 'settings', group: t('cmd_g_view'), label: t('ai_settings_title'), run: () => setSettingsOpen(true) },
    { id: 'ai-review', group: t('cmd_g_ai'), label: t('ed_ai_review'), disabled: aiOff, run: runAIReview },
    { id: 'ai-score', group: t('cmd_g_ai'), label: t('ed_ai_score'), disabled: aiOff, run: runAIScore },
    { id: 'ai-suggest', group: t('cmd_g_ai'), label: t('ed_ai_suggest_citation'), disabled: aiOff, run: runAISuggestCitation },
    { id: 'ai-gaps', group: t('cmd_g_ai'), label: t('ed_ai_gap_detect'), disabled: aiOff, run: runAIDetectGaps },
    { id: 'ai-compare', group: t('cmd_g_ai'), label: t('ed_ai_compare'), disabled: aiOff, run: runAICompare },
    { id: 'ai-research', group: t('cmd_g_ai'), label: t('ed_ai_deep_research'), disabled: aiOff, run: runAIDeepResearch },
    { id: 'ai-structure', group: t('cmd_g_ai'), label: t('ed_ai_structure_check'), disabled: aiOff, run: runAIStructureCheck },
    { id: 'export-docx', group: t('cmd_g_export'), label: t('ed_export_docx_active'), run: () => exportDocx('active') },
    { id: 'export-docx-ph', group: t('cmd_g_export'), label: t('ed_export_docx_placeholder'), run: () => exportDocx('placeholder') },
    { id: 'export-ris', group: t('cmd_g_export'), label: t('ed_export_ris'), run: exportRis },
    { id: 'export-latex', group: t('cmd_g_export'), label: t('ed_export_latex'), run: exportLatex },
    { id: 'export-json', group: t('cmd_g_export'), label: 'JSON', run: exportProjectJson },
    { id: 'import-docx', group: t('cmd_g_doc'), label: t('ed_import_docx'), run: () => { setShowImportModal(true); setImportPreview(null); setImportError(null); setImportPasteText(''); setPastedHtmlParagraphs(null); setPastedPlainReference(null); } },
    { id: 'lookup-all', group: t('cmd_g_doc'), label: t('rp_scan_all'), run: lookupAllRefs },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className={`border-b border-border bg-surface sticky top-0 z-50 ${focusMode ? 'hidden' : ''}`}>
        <div className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap shrink-0 text-xs mr-2 border border-border px-2 py-1 rounded-lg bg-white shadow-xs">
              <button
                onClick={onExitToProjects || onExit}
                className="text-secondary hover:text-primary font-bold flex items-center gap-1 transition"
                title="Ana Proje Listesi"
              >
                🏠 {lang === 'tr' ? 'Projelerim' : 'Projects'}
              </button>
              <span className="text-muted/30">|</span>
              <button
                onClick={onExit}
                className="text-secondary hover:text-primary font-bold flex items-center gap-1 transition"
                title="Proje Çalışma Alanı"
              >
                📁 {t('ws_title') || 'Çalışma Alanı'}
              </button>
            </div>
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
          <div className="flex gap-1 items-center text-xs">
            <select
              value={style}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__new__') {
                  setStyleSeed(null);
                  setStyleEditorOpen(true);
                  return;
                }
                setStyle(v as StyleId);
              }}
              className="border border-border rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-teal"
              title="Atıf ve kaynakça stili"
            >
              {styleOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.custom ? `★ ${s.label}` : s.label}
                </option>
              ))}
              <option value="__new__">＋ {t('style_new')}…</option>
            </select>
            <HeaderIcon
              onClick={() => {
                setStyleSeed(null);
                setStyleEditorOpen(true);
              }}
              title={t('style_edit')}
              label="🎨"
              caption={t('hdr_style')}
            />
            <HeaderIcon
              onClick={() => setShowFind(true)}
              title="Bul ve Değiştir (Ctrl+F / Ctrl+H)"
              label="🔍"
              caption={t('hdr_find')}
            />
            <HeaderIcon
              onClick={updateAllCitations}
              title="Atıfları yeniden numaralandır + orphan'ları temizle"
              label="↻"
              caption={t('hdr_renumber')}
            />
            <HeaderDropdown label={`📥 ${t('ed_import')} ▾`}>
              <DropItem
                onClick={() => {
                  setShowImportModal(true);
                  setImportPreview(null);
                  setImportError(null);
                  setImportPasteText('');
                }}
              >
                📄 {t('ed_import_docx')}
              </DropItem>
              <DropItem onClick={() => projectImportRef.current?.click()}>📂 {t('ed_import_json')}</DropItem>
            </HeaderDropdown>
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
            <HeaderDropdown label={`📤 ${t('ed_export')} ▾`} primary>
              <DropItem onClick={(e) => { e.stopPropagation(); setExportLineNumbers(!exportLineNumbers); }}>
                {exportLineNumbers ? '☑️' : '☐'} {lang === 'tr' ? 'Sürekli Satır Numaraları' : 'Continuous Line Numbers'}
              </DropItem>
              <DropItem
                onClick={(e) => {
                  e.stopPropagation();
                  setFigureCaptionPlacement((current) =>
                    current === 'inline' ? 'after-bibliography' : 'inline',
                  );
                }}
              >
                {figureCaptionPlacement === 'after-bibliography' ? '☑️' : '☐'}{' '}
                {lang === 'tr' ? 'Figure Legends, References sonrasında' : 'Figure Legends after References'}
              </DropItem>
              <hr className="border-border my-1" />
              <DropItem onClick={() => exportDocx('active')}>📝 {t('ed_export_docx_active')}</DropItem>
              <DropItem onClick={() => exportDocx('placeholder')}>📝 {t('ed_export_docx_placeholder')}</DropItem>
              <DropItem onClick={exportRis}>🗂️ {t('ed_export_ris')}</DropItem>
              <DropItem onClick={exportLatex}>📐 {t('ed_export_latex')}</DropItem>
              <DropItem onClick={exportProjectJson}>💾 {t('ed_export_json')}</DropItem>
            </HeaderDropdown>
            <HeaderIcon onClick={() => setPaletteOpen(true)} title={`${t('cmd_open')} (⌘K)`} label="⌘K" caption={t('hdr_palette')} />
            <HeaderIcon onClick={openPhrasebank} title={t('pb_title')} label="§" caption={t('hdr_phrasebank')} />
            <HeaderIcon onClick={() => setStatsOpen(true)} title={t('ed_stats')} label="📊" caption={t('hdr_stats')} />
            <HeaderIcon onClick={() => setSnapshotsOpen(true)} title={t('ed_snapshots')} label="🕓" caption={t('hdr_versions')} />
            <HeaderIcon onClick={() => setJournalOpen(true)} title={t('ed_journal_check')} label="📋" caption={t('hdr_journal')} />
            <HeaderIcon onClick={() => setFocusMode(true)} title={`${t('ed_focus_mode')} (⌘.)`} label="🎯" caption={t('hdr_focus')} />
            <HeaderIcon
              onClick={() => setSettingsOpen(true)}
              title={aiConfigured ? 'AI ayarlanmış — API anahtarlarını düzenle' : 'AI servisi yapılandırılmamış — API anahtarı gir'}
              label="⚙️"
              caption={t('hdr_settings')}
              accent={!!aiConfigured}
              badge={aiConfigured === false}
            />
          </div>
        </div>
        <div className="w-full border-t border-border bg-slate-50 px-4 sm:px-6 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-none text-xs">
          <span className="text-muted/60 font-semibold mr-1 shrink-0 uppercase tracking-wider text-[9px]">{lang === 'tr' ? 'Bölümler:' : 'Sub-groups:'}</span>
          <button
            onClick={() => {
              setTablesOpen(false);
              setFiguresOpen(false);
              setSuppOpen(false);
              setLettersOpen(false);
              setAbbrOpen(false);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              (!tablesOpen && !figuresOpen && !suppOpen && !lettersOpen && !abbrOpen)
                ? 'bg-teal text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-slate-100'
            }`}
          >
            📝 {lang === 'tr' ? 'Ana Yazı' : 'Main Text'}
          </button>
          <button
            onClick={() => {
              setTablesOpen(false);
              setFiguresOpen(false);
              setSuppOpen(false);
              setAbbrOpen(false);
              if (onGoToDocuments) onGoToDocuments();
              else setLettersOpen(true);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              lettersOpen
                ? 'bg-teal text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-slate-100'
            }`}
          >
            ✉️ {lang === 'tr' ? 'Diğer Yazılar' : 'Letters'}
          </button>
          <button
            onClick={() => {
              setFiguresOpen(true);
              setTablesOpen(false);
              setSuppOpen(false);
              setLettersOpen(false);
              setAbbrOpen(false);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              figuresOpen
                ? 'bg-teal text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-slate-100'
            }`}
          >
            🖼️ Figure Legends
          </button>
          <button
            onClick={() => {
              setTablesOpen(true);
              setFiguresOpen(false);
              setSuppOpen(false);
              setLettersOpen(false);
              setAbbrOpen(false);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              tablesOpen
                ? 'bg-teal text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-slate-100'
            }`}
          >
            ⊞ {lang === 'tr' ? 'Tablolar' : 'Tables'}
          </button>
          <button
            onClick={() => {
              setSuppOpen(true);
              setTablesOpen(false);
              setFiguresOpen(false);
              setLettersOpen(false);
              setAbbrOpen(false);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              suppOpen
                ? 'bg-teal text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-slate-100'
            }`}
          >
            📎 {lang === 'tr' ? 'Ek Materyaller' : 'Supplementary'}
          </button>
          <button
            onClick={() => {
              setAbbrOpen(true);
              setSuppOpen(false);
              setTablesOpen(false);
              setFiguresOpen(false);
              setLettersOpen(false);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shrink-0 ${
              abbrOpen
                ? 'bg-teal text-white shadow-sm'
                : 'text-secondary hover:text-primary hover:bg-slate-100'
            }`}
          >
            🔤 {lang === 'tr' ? 'Kısaltmalar' : 'Abbreviations'}
          </button>
        </div>
      </header>

      {importError && (
        <div className="w-full px-4 sm:px-6 mt-2">
          <div className="card bg-red-bg border-red-200 text-red text-sm p-3 flex items-center justify-between">
            <span>{importError}</span>
            <button className="text-red hover:underline text-xs" onClick={() => setImportError(null)}>
              {t('app_close')}
            </button>
          </div>
        </div>
      )}

      {tabConflict && (
        <div className="w-full px-4 sm:px-6 mt-2">
          <div className="card bg-amber-50 border-amber-200 text-amber-800 text-sm p-3 flex items-center justify-between gap-3">
            <span>⚠️ {t('tab_conflict_msg')}</span>
            <div className="flex items-center gap-3 shrink-0">
              <button
                className="px-2 py-1 rounded border border-amber-300 hover:bg-amber-100 text-xs font-semibold"
                onClick={() => void reloadFromDisk()}
              >
                {t('tab_conflict_reload')}
              </button>
              <button
                className="px-2 py-1 rounded border border-amber-300 hover:bg-amber-100 text-xs font-semibold"
                onClick={dismissTabConflict}
                title={t('tab_conflict_overwrite_hint')}
              >
                {t('tab_conflict_overwrite')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDesktop && (
      <main
        ref={gridRef}
        className="flex-1 w-full px-4 sm:px-6 py-4 hidden lg:flex flex-col min-h-0 overflow-hidden"
      >
        {/* TOP ROW */}
        <div
          className={`flex min-w-0 overflow-hidden ${focusMode ? 'flex-1' : ''}`}
          style={{ height: focusMode ? undefined : topRowHeight }}
        >
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
                registerEditor(ed);
              }}
              onInsertRequest={insertFromLibrary}
              onAIReview={runAIReview}
              onAIScore={runAIScore}
              onAIEnhance={runAIEnhance}
              onAISuggestCitation={runAISuggestCitation}
              onAIDetectGaps={runAIDetectGaps}
              onAICompare={runAICompare}
              onAIDeepResearch={runAIDeepResearch}
              onAIStructureCheck={runAIStructureCheck}
              aiDisabled={aiConfigured === false}
            />
          </div>
        </div>

          {/* Top vertical divider */}
          <div
            onMouseDown={startTopColDrag}
            className={`cursor-col-resize flex items-center justify-center group shrink-0 w-2 ${focusMode ? 'hidden' : ''}`}
            title="Sürükle: üst sütun genişliği"
          >
            <div className="w-0.5 h-12 bg-border group-hover:bg-teal rounded-full transition" />
          </div>

          {/* Top-right: Atıf kütüphanesi (citation library) */}
          <div className={`min-h-0 min-w-0 pl-2 overflow-hidden shrink-0 ${focusMode ? 'hidden' : ''}`} style={{ width: focusMode ? 0 : topColWidth }}>
            <RefsPanel
            refs={refs}
            refOrder={refOrder}
            onAddByDoi={addByDoi}
            onLookupDoi={lookupDoi}
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
            onExtractAspects={extractAspectsFor}
            onEnrichRefs={enrichRefs}
            history={history}
            onUndoHistory={undoHistory}
            onClearHistory={clearHistory}
            onInsertText={(text) => {
              const ed = editorInstance.current;
              if (ed && !ed.isDestroyed) {
                ed.chain().focus().insertContent(text).run();
              }
            }}
          />
          </div>
        </div>

        {/* Horizontal row divider — full width */}
        <div
          onMouseDown={startRowDrag}
          className={`cursor-row-resize flex items-center justify-center group shrink-0 h-2 ${focusMode ? 'hidden' : ''}`}
          title="Sürükle: satır yüksekliği"
        >
          <div className="h-0.5 w-24 bg-border group-hover:bg-teal rounded-full transition" />
        </div>

        {/* BOTTOM ROW */}
        <div className={`flex flex-1 min-h-0 min-w-0 overflow-hidden ${focusMode ? 'hidden' : ''}`}>
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
              onUpdate={updateRef}
            />
          </div>
        </div>
      </main>
      )}

      {/* Mobile / narrow screen fallback: stacked layout */}
      {!isDesktop && (
      <main className="flex-1 w-full px-3 sm:px-4 py-3 lg:hidden flex flex-col gap-3 min-h-0">
        <ArticleEditor
          initialContent={doc}
          refs={refs}
          onChange={(json) => setDoc(json)}
          onReady={(ed) => {
            registerEditor(ed);
          }}
          onInsertRequest={insertFromLibrary}
          onAIReview={runAIReview}
              onAIScore={runAIScore}
              onAIEnhance={runAIEnhance}
              onAISuggestCitation={runAISuggestCitation}
              onAIDetectGaps={runAIDetectGaps}
              onAICompare={runAICompare}
              onAIDeepResearch={runAIDeepResearch}
              onAIStructureCheck={runAIStructureCheck}
              aiDisabled={aiConfigured === false}
        />
        <RefsPanel
          refs={refs}
          refOrder={refOrder}
          onAddByDoi={addByDoi}
          onLookupDoi={lookupDoi}
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
          onExtractAspects={extractAspectsFor}
          onEnrichRefs={enrichRefs}
          history={history}
          onUndoHistory={undoHistory}
          onClearHistory={clearHistory}
          onInsertText={(text) => {
            const ed = editorInstance.current;
            if (ed && !ed.isDestroyed) {
              ed.chain().focus().insertContent(text).run();
            }
          }}
        />
        <BibliographyPreview refs={refs} refOrder={refOrder} style={style} selectedId={highlightRefId} onSelect={selectRef} />
        <RefDetail
          reference={highlightRefId ? refs.find((r) => r.id === highlightRefId) ?? null : null}
          number={highlightRefId ? refOrder.get(highlightRefId) ?? refs.findIndex((r) => r.id === highlightRefId) + 1 : undefined}
          onUpdate={updateRef}
        />
      </main>
      )}

      {showImportModal && (
        <ImportModal
          onClose={() => {
            setShowImportModal(false);
            setImportPreview(null);
            setImportPasteText('');
            setPastedHtmlParagraphs(null);
            setPastedPlainReference(null);
          }}
          docxInputRef={docxInputRef}
          onSelectDocx={async (file) => {
            await previewDocx(file);
          }}
          pasteText={importPasteText}
          setPasteText={setImportPasteText}
          onProcessPaste={() => processImportText(importPasteText)}
          onPasteHtml={(html, plain) => {
            const parsed = parseHtmlToParagraphs(html);
            if (parsed.length > 0) {
              setPastedHtmlParagraphs(parsed);
              setPastedPlainReference(plain);
            }
          }}
          preview={importPreview}
          onApply={applyImport}
        />
      )}

      {citationPopover && (
        <CitationPopover
          pos={citationPopover.pos}
          refIds={citationPopover.refIds}
          allRefs={refs}
          initialOpts={citationOptsAt(citationPopover.pos)}
          authorYearStyle={!isNumericStyle(style)}
          onClose={() => setCitationPopover(null)}
          onReplace={replaceCitationRef}
          onDelete={deleteCitationAtPos}
          onUpdateOpts={updateCitationOptsAt}
        />
      )}

      {showFind && editorInstance.current && (
        <FindReplace editor={editorInstance.current} onClose={() => setShowFind(false)} />
      )}

      {aiReview.open && (
        <div className="fixed left-4 top-24 bottom-4 w-[380px] z-40 shadow-2xl">
          <IssuesPanel
            issues={aiReview.issues}
            summary={aiReview.summary ?? undefined}
            loading={aiReview.loading}
            error={aiReview.error}
            onClose={() => setAiReview((s) => ({ ...s, open: false }))}
            onJumpTo={jumpToIssue}
          />
        </div>
      )}

      <EnhanceModal
        state={aiEnhance.state}
        mode={aiEnhance.mode}
        onAccept={acceptEnhance}
        onClose={closeEnhance}
        onRetry={retryEnhance}
      />

      {aiSuggest.open && (
        <div className="fixed left-4 top-24 bottom-4 w-[400px] z-40 shadow-2xl">
          <CitationSuggestionsPanel
            query={aiSuggest.query}
            suggestions={aiSuggest.suggestions}
            loading={aiSuggest.loading}
            error={aiSuggest.error}
            onClose={() => setAiSuggest((s) => ({ ...s, open: false }))}
            onInsert={(refIds) => {
              insertSuggestedCitation(refIds);
              setAiSuggest((s) => ({ ...s, open: false }));
            }}
            refOrder={refOrder}
          />
        </div>
      )}

      {aiGaps.open && (
        <div className="fixed left-4 top-24 bottom-4 w-[400px] z-40 shadow-2xl">
          <GapDetectPanel
            claims={aiGaps.items}
            loading={aiGaps.loading}
            error={aiGaps.error}
            onClose={() => setAiGaps((s) => ({ ...s, open: false }))}
            onJumpTo={jumpToClaim}
            onInsertCitation={insertCitationForClaim}
            onLoadSuggestions={loadSuggestionsForClaim}
            refOrder={refOrder}
          />
        </div>
      )}

      {embedBusy && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-border rounded-lg shadow-lg px-4 py-2 text-xs text-secondary">
          Referanslar gömülüyor: {embedBusy.done} / {embedBusy.total}
        </div>
      )}

      {compareOpen && (
        <CompareModal
          myAbstract={detectAbstract()}
          refs={refs}
          onClose={() => setCompareOpen(false)}
          onInsertSnippet={(snippet) => {
            const ed = editorInstance.current;
            if (!ed) return;
            ed.chain().focus().insertContent(snippet).run();
            setCompareOpen(false);
          }}
          onExtractAspects={extractAspectsFor}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            // status hook re-fetches via 'enr-keys-updated' event
          }}
        />
      )}

      {researchOpen && (
        <div className="fixed left-4 top-24 bottom-4 w-[440px] z-40 shadow-2xl">
          <DeepResearchPanel
            initialAbstract={detectAbstract()}
            onClose={() => setResearchOpen(false)}
            onAddRef={(r) => {
              const newRef: Ref = { ...r, id: newRefId() };
              setRefs((prev) => [...prev, newRef]);
            }}
          />
        </div>
      )}

      {aiScore.open && (
        <div className="fixed left-4 top-24 bottom-4 w-[380px] z-40 shadow-2xl">
          <ScorePanel
            result={aiScore.result}
            loading={aiScore.loading}
            error={aiScore.error}
            onClose={() => setAiScore((s) => ({ ...s, open: false }))}
            onRescore={runAIScore}
          />
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} t={t} />

      {statsOpen && (
        <div className="fixed right-4 top-24 w-[320px] z-40 shadow-2xl">
          <StatsPanel
            stats={writingStats}
            goal={wordGoal}
            onSetGoal={updateWordGoal}
            t={t}
            onClose={() => setStatsOpen(false)}
          />
        </div>
      )}

      {snapshotsOpen && (
        <div className="fixed right-4 top-24 bottom-4 w-[360px] z-40 shadow-2xl">
          <SnapshotsPanel
            projectId={project.id}
            currentDoc={doc}
            currentRefs={refs}
            currentWordCount={writingStats.words}
            onRestore={restoreSnapshot}
            onClose={() => setSnapshotsOpen(false)}
            t={t}
          />
        </div>
      )}

      {figuresOpen && editorInstance.current && (
        <div className="fixed right-4 top-24 bottom-4 w-[400px] z-40 shadow-2xl">
          <FiguresPanel
            editor={editorInstance.current}
            onClose={() => setFiguresOpen(false)}
            t={t}
            captionPlacement={figureCaptionPlacement}
            onCaptionPlacementChange={setFigureCaptionPlacement}
          />
        </div>
      )}

      {tablesOpen && editorInstance.current && (
        <div className="fixed right-4 top-24 bottom-4 w-[380px] z-40 shadow-2xl">
          <TablePanel editor={editorInstance.current} onClose={() => setTablesOpen(false)} t={t} />
        </div>
      )}

      {suppOpen && (
        <div className="fixed right-4 top-24 bottom-4 w-[360px] z-40 shadow-2xl">
          <SupplementaryPanel
            value={supplementary}
            onChange={setSupplementary}
            refs={refs}
            refOrder={refOrder}
            onClose={() => setSuppOpen(false)}
            lang={lang}
          />
        </div>
      )}

      {abbrOpen && editorInstance.current && (
        <div className="fixed right-4 top-24 bottom-4 w-[360px] z-40 shadow-2xl">
          <AbbreviationsPanel
            editor={editorInstance.current}
            onClose={() => setAbbrOpen(false)}
            lang={lang}
          />
        </div>
      )}

      {journalOpen && (
        <div className="fixed right-4 top-24 bottom-4 w-[360px] z-40 shadow-2xl">
          <JournalCheckPanel
            docJson={doc}
            stats={writingStats}
            referenceStyle={style}
            bibliographyReferenceCount={refs.filter((ref) => refOrder.has(ref.id)).length}
            onReferenceStyleChange={(nextStyle) => setStyle(nextStyle)}
            onClose={() => setJournalOpen(false)}
            t={t}
          />
        </div>
      )}

      {lettersOpen && (
        <LettersPanel
          defaultTitle={title}
          lang={lang}
          aiEnabled={aiConfigured !== false}
          onClose={() => setLettersOpen(false)}
          t={t}
        />
      )}

      {styleEditorOpen && (
        <StyleEditor
          editId={styleSeed ? null : typeof style === 'string' && style.startsWith('custom_') ? style : null}
          seed={styleSeed}
          lang={lang}
          aiEnabled={aiConfigured !== false}
          onClose={() => {
            setStyleEditorOpen(false);
            setStyleSeed(null);
          }}
          onSaved={(id) => {
            setStyleOptions(listAllStyles());
            setStyle(id);
            setStyleEditorOpen(false);
            setStyleSeed(null);
          }}
          t={t}
        />
      )}

      {phrasebankOpen && (
        <div className="fixed right-4 top-24 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] z-40 shadow-2xl">
          <PhrasebankPanel
            onInsert={insertAcademicPhrase}
            onClose={() => setPhrasebankOpen(false)}
            currentSection={phrasebankSection}
            t={t}
          />
        </div>
      )}

      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed top-3 right-3 z-50 text-xs px-3 py-1.5 rounded-lg bg-primary text-white shadow-lg hover:opacity-90"
          title="Esc"
        >
          ✕ {t('ed_exit_focus')}
        </button>
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
  onPasteHtml,
  preview,
  onApply,
}: {
  onClose: () => void;
  docxInputRef: React.RefObject<HTMLInputElement | null>;
  onSelectDocx: (file: File) => Promise<void>;
  pasteText: string;
  setPasteText: (v: string) => void;
  onProcessPaste: () => void;
  onPasteHtml?: (html: string, plain: string) => void;
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
                  onPaste={(e) => {
                    const html = e.clipboardData.getData('text/html');
                    const plain = e.clipboardData.getData('text/plain');
                    if (html && onPasteHtml) {
                      onPasteHtml(html, plain);
                    }
                  }}
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

function isCommonHeading(line: string, index: number): number | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return null;

  // First paragraph is likely a Title (Heading 1) if it's not too long and doesn't end with a period
  if (index === 0 && !/[.?!]$/.test(trimmed)) {
    return 1;
  }

  const lower = trimmed.toLowerCase();
  const commonHeadings = [
    'abstract', 'özet', 'introduction', 'giriş', 'background', 'arka plan',
    'methods', 'yöntem', 'yöntemler', 'methodology', 'materials and methods', 'gereç ve yöntem',
    'results', 'bulgular', 'discussion', 'tartışma', 'conclusion', 'sonuç',
    'conclusions', 'sonuçlar', 'limitations', 'kısıtlılıklar', 'acknowledgments', 'teşekkür',
    'funding', 'finansman', 'conflict of interest', 'çıkar çatışması', 'ethics', 'etik',
    'author contributions', 'yazar katkıları', 'data availability', 'veri erişimi',
    'references', 'kaynaklar', 'supplementary', 'ek materyaller',
  ];

  if (commonHeadings.includes(lower)) {
    return 2;
  }

  // Custom numbered headings: e.g. "1. Introduction", "2. Methods", "2.1 Study Design"
  if (/^\d+(\.\d+)*\s+[A-Z\u00C0-\u00DC]/.test(trimmed) && !/[.?!]$/.test(trimmed) && trimmed.length < 60) {
    return 3;
  }

  return null;
}

function mergeTipTapDocs(prev: any, incoming: any): unknown {
  if (!prev || !prev.content) return incoming;
  if (!incoming || !incoming.content) return prev;
  return { type: 'doc', content: [...prev.content, ...incoming.content] };
}

function newRefId(): string {
  return newId('r');
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

function HeaderIcon({
  onClick,
  title,
  label,
  caption,
  accent,
  badge,
}: {
  onClick: () => void;
  title: string;
  label: string;
  caption?: string;
  accent?: boolean;
  badge?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center justify-center leading-none px-1.5 py-1 rounded border min-w-[2.6rem] transition ${
        accent ? 'border-teal text-teal' : 'border-border text-secondary'
      } hover:bg-slate-50 hover:text-primary`}
    >
      <span className="text-sm">
        {label}
        {badge && <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" />}
      </span>
      {caption && <span className="mt-0.5 text-[9px] text-muted">{caption}</span>}
    </button>
  );
}

function HeaderDropdown({
  label,
  primary,
  children,
}: {
  label: string;
  primary?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-2 py-0.5 text-xs rounded border ${primary ? 'border-teal bg-teal text-white hover:bg-teal-dark' : 'border-border text-secondary hover:bg-slate-50'}`}
      >
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full right-0 mt-1 z-50 bg-white border border-border rounded-lg shadow-lg w-56 py-1"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function DropItem({
  onClick,
  children,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
    >
      {children}
    </button>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function findHeading1Text(doc: any): string | null {
  if (!doc || !doc.content || !Array.isArray(doc.content)) return null;
  for (const node of doc.content) {
    if (node.type === 'heading' && node.attrs?.level === 1) {
      if (Array.isArray(node.content)) {
        return node.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text || '')
          .join('')
          .trim();
      }
    }
  }
  return null;
}
