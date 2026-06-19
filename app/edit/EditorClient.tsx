'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, ProjectTable, Ref } from '@/store/types';
import { saveProject, getProject, createSnapshot } from '@/store/db';
import type { Snapshot } from '@/store/types';
import { ArticleEditor, computeRefOrder } from '@/components/Editor/Editor';
import { RefsPanel } from '@/components/RefsPanel/RefsPanel';
import { tiptapToBuildInput } from '@/lib/editor/to-export';
import { buildRichDocx } from '@/lib/docx/build-rich';
import { buildTemplateDocx, getDocxTemplate } from '@/lib/docx/template-docx';
import {
  buildPrintDocumentHtml,
  printStylesheet,
  PRINT_STYLE_ID,
  PRINT_HOST_CLASS,
} from '@/lib/export/print-html';
import { refsToRis } from '@/lib/refs/ris';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines } from '@/lib/refs/parse-biblio';
import { detectMarkers } from '@/lib/markers/detect';
import type { MarkerOccurrence } from '@/store/types';
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
import { ManuscriptToolModal } from '@/components/AI/ManuscriptToolModal';
import { IntegrityModal } from '@/components/AI/IntegrityModal';
import type {
  AcademicReviewSuggestionT,
  ScoreResultT,
  EnhanceModeT,
  ClaimT,
  ManuscriptToolModeT,
  ManuscriptToolResultT,
} from '@/lib/ai/schemas';
import {
  chunkReviewBlocks,
  type AcademicReviewIssue,
  type ReviewBlock,
} from '@/lib/ai/academic-review';
import {
  academicReviewPluginKey,
  type AcademicReviewDecoration,
} from '@/components/Editor/extensions/academic-review-plugin';
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
import { ChecklistPanel } from '@/components/Checklist/ChecklistPanel';
import { LettersPanel } from '@/components/Letters/LettersPanel';
import { PhrasebankPanel } from '@/components/Phrasebank/PhrasebankPanel';
import { SupplementaryPanel } from '@/components/Supplementary/SupplementaryPanel';
import { AbbreviationsPanel } from '@/components/Abbreviations/AbbreviationsPanel';
import { StickyNote } from '@/components/StickyNote';
import { AbstractPanel } from '@/components/Abstract/AbstractPanel';
import { DocImportModal, type ImportPreview } from '@/components/Import/DocImportModal';
import { useTabSync } from '@/lib/hooks/useTabSync';
import { useIsDesktop } from '@/lib/hooks/useIsDesktop';
import { computeWritingStats } from '@/lib/stats/writing-stats';
import { scanMedicalStatistics } from '@/lib/stats/medical-reporting';
import {
  buildDocWithCitations,
  parseHtmlToParagraphs,
  type ImportParagraph,
} from '@/lib/editor/import-rich';
import { splitAbstractMetadataFromParagraphs } from '@/lib/editor/abstract';
import { extractProjectTables } from '@/lib/tables/project-tables';
import {
  encodeSelection,
  decodeToTipTapContent,
  encodedToPreview,
  type CitationNodeJSON,
} from '@/lib/editor/mixed-content';
import { useLang } from '@/lib/i18n/hooks';
import { getWorkspaceRoot } from '@/lib/fs/workspace';
import type { FigureCaptionPlacement } from '@/lib/figures/export-layout';

type Props = {
  project: Project;
  onExit: () => void;
  onSaved: () => void;
  onExitToProjects?: () => void;
  onGoToDocuments?: () => void;
};

export function EditorClient({ project, onExit, onSaved, onExitToProjects, onGoToDocuments }: Props) {
  const { t, lang } = useLang();
  const [title, setTitle] = useState(project.title);
  const [refs, setRefs] = useState<Ref[]>(project.refs);
  const [manuscriptTables, setManuscriptTables] = useState<ProjectTable[]>(project.tables ?? []);
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
  const [fontFamily, setFontFamily] = useState<string>(
    project.settings?.fontFamily ?? 'Times New Roman',
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
    issues: AcademicReviewIssue[];
    summary: string | null;
    progress: { completed: number; total: number };
  }>({
    open: false,
    loading: false,
    error: null,
    issues: [],
    summary: null,
    progress: { completed: 0, total: 0 },
  });
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
  const [manuscriptTool, setManuscriptTool] = useState<{
    open: boolean;
    mode: ManuscriptToolModeT;
    loading: boolean;
    error: string | null;
    result: ManuscriptToolResultT | null;
    targetRange: { from: number; to: number } | null;
    citationNodes: CitationNodeJSON[];
    outputEncoded: string;
  }>({
    open: false,
    mode: 'abstract',
    loading: false,
    error: null,
    result: null,
    targetRange: null,
    citationNodes: [],
    outputEncoded: '',
  });
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [figuresOpen, setFiguresOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [tablePanelView, setTablePanelView] = useState<'list' | 'import'>('list');
  const [journalOpen, setJournalOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [lettersOpen, setLettersOpen] = useState(false);
  const [abstractOpen, setAbstractOpen] = useState(false);
  const [includeAbstractExport, setIncludeAbstractExport] = useState(true);
  const [keywords, setKeywords] = useState<string[]>(project.keywords ?? []);
  const [phrasebankOpen, setPhrasebankOpen] = useState(false);
  const [supplementary, setSupplementary] = useState<string>(project.supplementary ?? '');
  const [abstractText, setAbstractText] = useState<string>(project.abstractText ?? '');
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
          abstractText,
          keywords,
          tables: manuscriptTables,
          auto: true,
          wordCount: computeWritingStats(liveDoc).words,
        });
      } catch {
        // snapshotting must not break the user's action
      }
    },
    // editorInstance is a stable ref-like object
    [doc, refs, supplementary, abstractText, keywords, manuscriptTables, project.id],
  );

  const restoreSnapshot = useCallback(
    (snap: Snapshot): void => {
      if (!confirm(t('snap_restore_confirm'))) return;
      setRefs(snap.refs);
      setDoc(snap.doc);
      if (snap.supplementary !== undefined) {
        setSupplementary(snap.supplementary ?? '');
      }
      if (snap.abstractText !== undefined) {
        setAbstractText(snap.abstractText ?? '');
      }
      if (snap.keywords !== undefined) {
        setKeywords(snap.keywords ?? []);
      }
      if (snap.tables !== undefined) {
        setManuscriptTables(snap.tables ?? []);
      }
      const ed = editorInstance.current;
      if (ed && !ed.isDestroyed && snap.doc) {
        ed.commands.setContent(snap.doc as Record<string, unknown>);
      }
      setSnapshotsOpen(false);
    },
    [t],
  );

  // Load workspace root handle once on mount.
  useEffect(() => {
    let alive = true;
    getWorkspaceRoot()
      .then((root) => {
        if (alive) setWorkspaceRoot(root?.handle ?? null);
      })
      .catch(() => {
        if (alive) setWorkspaceRoot(null);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  function getRefCitationCount(refId: string): number {
    const ed = editorInstance.current;
    if (!ed) return 0;
    let count = 0;
    ed.state.doc.descendants((node: any) => {
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        if (ids.includes(refId)) count++;
      }
      return true;
    });
    return count;
  }

  function jumpToRefCitation(refId: string, direction: 1 | -1): void {
    const ed = editorInstance.current;
    if (!ed) return;
    const positions: number[] = [];
    ed.state.doc.descendants((node: any, pos: number) => {
      if (node.type?.name === 'citation') {
        const ids: string[] = node.attrs?.refIds ?? [];
        if (ids.includes(refId)) positions.push(pos);
      }
      return true;
    });
    if (positions.length === 0) {
      setHighlightRefId(refId);
      setOccurrenceCursor(0);
      return;
    }
    const isSameRef = highlightRefId === refId;
    const current = isSameRef ? occurrenceCursor : 0;
    const next = (current + direction + positions.length) % positions.length;
    setHighlightRefId(refId);
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
        abstractText,
        keywords,
        tables: manuscriptTables,
        settings: { ...(project.settings ?? {}), style, figureCaptionPlacement, fontFamily },
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
    abstractText,
    keywords,
    manuscriptTables,
    figureCaptionPlacement,
    fontFamily,
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
      setAbstractText(fresh.abstractText ?? '');
      setKeywords(fresh.keywords ?? []);
      setManuscriptTables(fresh.tables ?? []);
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
      alert(lang === 'tr' ? 'Skor için en az 50 karakterlik metin gerekli.' : 'At least 50 characters of text are required to score.');
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
        alert(lang === 'tr' ? 'İyileştirme için en az 10 karakterlik metin gerekli.' : 'At least 10 characters of text are required to enhance.');
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
      alert(lang === 'tr' ? 'Atıf önerisi için en az 20 karakterlik metin seçmelisin (veya cursor’u bir paragrafa koy).' : 'Select at least 20 characters of text for citation suggestions (or place the cursor in a paragraph).');
      return;
    }
    setAiSuggest({ open: true, loading: true, error: null, query: sel.text, suggestions: [] });
    try {
      const library = await ensureLibraryEmbedded();
      if (library.length === 0) {
        throw new Error(lang === 'tr' ? 'Kütüphane boş. Önce referans ekle.' : 'The library is empty. Add a reference first.');
      }
      const { embeddings } = await embedTexts([sel.text]);
      const query = embeddings[0];
      if (!query) throw new Error(lang === 'tr' ? 'Sorgu gömme başarısız' : 'Query embedding failed');
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
      alert(lang === 'tr' ? 'Belge çok kısa.' : 'The document is too short.');
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
    const savedAbstract = abstractText.trim();
    if (savedAbstract) return savedAbstract;
    const ed = editorInstance.current;
    if (!ed) return '';
    const doc = ed.state.doc;
    let detectedAbstract = '';
    let inAbstract = false;
    let firstParaText = '';
    doc.descendants((node: any) => {
      if (detectedAbstract) return false;
      if (node.type?.name === 'heading') {
        const text = (node.textContent ?? '').toLowerCase();
        if (inAbstract && detectedAbstract === '') {
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
          detectedAbstract = t;
          return false;
        }
      }
      return true;
    });
    return detectedAbstract || firstParaText;
  }, [abstractText]);

  const runAICompare = useCallback(() => {
    if (refs.length === 0) {
      alert(lang === 'tr' ? 'Önce kütüphaneye en az bir referans ekle.' : 'Add at least one reference to the library first.');
      return;
    }
    setCompareOpen(true);
  }, [refs.length]);

  const runAIDeepResearch = useCallback(() => {
    setResearchOpen(true);
  }, []);

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
    const ed = editorInstance.current;
    if (!ed) return;
    const runtimeBlocks = extractAcademicReviewBlocks(ed);
    const blocks = runtimeBlocks.map(({ positions: _positions, ...block }) => block);
    const chunks = chunkReviewBlocks(blocks, 8_000);
    if (chunks.length === 0) {
      alert(lang === 'tr' ? 'İncelenecek metin bulunamadı.' : 'No manuscript text was found.');
      return;
    }

    ed.view.dispatch(
      ed.view.state.tr.setMeta(academicReviewPluginKey, { type: 'clear' }),
    );
    setAiReview({
      open: true,
      loading: true,
      error: null,
      issues: [],
      summary: null,
      progress: { completed: 0, total: chunks.length },
    });

    const sourceById = new Map(runtimeBlocks.map((block) => [block.id, block]));
    const collected: AcademicReviewIssue[] = runtimeBlocks.flatMap((block) =>
      scanMedicalStatistics(block.text).flatMap((statIssue) => {
        const from = block.positions[statIssue.start];
        const last = block.positions[statIssue.end - 1];
        if (from == null || last == null) return [];
        return [{
          id: newId('stat'),
          category: 'statistics' as const,
          severity: statIssue.severity,
          blockId: block.id,
          quote: statIssue.quote,
          explanation: lang === 'tr' ? statIssue.message.tr : statIssue.message.en,
          replacement: statIssue.replacement,
          confidence: 1,
          status: 'open' as const,
          from,
          to: last + 1,
        }];
      }),
    );
    const summaries: string[] = [];
    let completedChunks = 0;

    if (collected.length > 0) {
      ed.view.dispatch(
        ed.view.state.tr.setMeta(academicReviewPluginKey, {
          type: 'set',
          items: collected.map((issue) => ({
            id: issue.id,
            from: issue.from!,
            to: issue.to!,
            category: issue.category,
          })),
        }),
      );
      setAiReview((previous) => ({ ...previous, issues: [...collected] }));
    }

    try {
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunk = chunks[chunkIndex];
        const response = await fetch('/api/ai/academic-review', {
          method: 'POST',
          headers: aiHeaders(),
          body: JSON.stringify({
            blocks: chunk.blocks.map((block) => ({
              id: block.id,
              text: block.text,
              section: block.section,
            })),
            lang,
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          issues: AcademicReviewSuggestionT[];
          summary?: string;
        };
        if (data.summary?.trim()) summaries.push(data.summary.trim());
        completedChunks = chunkIndex + 1;

        const sentById = new Map(chunk.blocks.map((block) => [block.id, block]));
        for (const suggestion of data.issues ?? []) {
          const sentBlock = sentById.get(suggestion.blockId);
          if (!sentBlock) continue;
          const sourceBlock = sourceById.get(sentBlock.sourceId ?? sentBlock.id);
          if (!sourceBlock) continue;
          const range = locateAcademicSuggestion(suggestion, sentBlock, sourceBlock, ed);
          const duplicate = collected.some(
            (issue) =>
              issue.category === suggestion.category &&
              issue.blockId === suggestion.blockId &&
              issue.quote === suggestion.quote &&
              issue.replacement === suggestion.replacement,
          );
          if (duplicate) continue;
          collected.push({
            id: newId('ai'),
            ...suggestion,
            status: range ? 'open' : 'stale',
            from: range?.from,
            to: range?.to,
          });
        }

        const openDecorations: AcademicReviewDecoration[] = collected
          .filter(
            (issue): issue is AcademicReviewIssue & { from: number; to: number } =>
              issue.status === 'open' && issue.from != null && issue.to != null,
          )
          .map((issue) => ({
            id: issue.id,
            from: issue.from,
            to: issue.to,
            category: issue.category,
          }));
        ed.view.dispatch(
          ed.view.state.tr.setMeta(academicReviewPluginKey, {
            type: 'set',
            items: openDecorations,
          }),
        );
        setAiReview({
          open: true,
          loading: chunkIndex + 1 < chunks.length,
          error: null,
          issues: [...collected],
          summary: summaries.at(-1) ?? null,
          progress: { completed: chunkIndex + 1, total: chunks.length },
        });
      }
    } catch (error) {
      setAiReview({
        open: true,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        issues: [...collected],
        summary: summaries.at(-1) ?? null,
        progress: { completed: completedChunks, total: chunks.length },
      });
    }
  }, [lang]);

  const runAIStructureCheck = runAIReview;

  const jumpToIssue = useCallback((issue: AcademicReviewIssue) => {
    const ed = editorInstance.current;
    if (!ed) return;
    const mapped = academicReviewPluginKey
      .getState(ed.state)
      ?.items.find((item) => item.id === issue.id);
    const from = mapped?.from ?? issue.from;
    const to = mapped?.to ?? issue.to;
    if (from == null || to == null) return;
    ed.view.dispatch(
      ed.view.state.tr.setMeta(academicReviewPluginKey, { type: 'active', id: issue.id }),
    );
    ed.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  }, []);

  const dismissAIReviewIssue = useCallback((issue: AcademicReviewIssue) => {
    const ed = editorInstance.current;
    if (ed) {
      ed.view.dispatch(
        ed.view.state.tr.setMeta(academicReviewPluginKey, { type: 'remove', id: issue.id }),
      );
    }
    setAiReview((previous) => ({
      ...previous,
      issues: previous.issues.map((item) =>
        item.id === issue.id ? { ...item, status: 'dismissed' } : item,
      ),
    }));
  }, []);

  const applyAIReviewIssue = useCallback(async (issue: AcademicReviewIssue) => {
    const ed = editorInstance.current;
    if (!ed || !issue.replacement) return;
    const mapped = academicReviewPluginKey
      .getState(ed.state)
      ?.items.find((item) => item.id === issue.id);
    const from = mapped?.from ?? issue.from;
    const to = mapped?.to ?? issue.to;
    if (from == null || to == null) return;
    const currentText = ed.state.doc.textBetween(from, to, '', '');
    if (currentText !== issue.quote) {
      ed.view.dispatch(
        ed.view.state.tr.setMeta(academicReviewPluginKey, { type: 'remove', id: issue.id }),
      );
      setAiReview((previous) => ({
        ...previous,
        issues: previous.issues.map((item) =>
          item.id === issue.id ? { ...item, status: 'stale' } : item,
        ),
      }));
      return;
    }
    await autoSnapshot(t('snap_auto_label'));
    ed.chain()
      .focus()
      .insertContentAt({ from, to }, issue.replacement)
      .run();
    ed.view.dispatch(
      ed.view.state.tr.setMeta(academicReviewPluginKey, { type: 'remove', id: issue.id }),
    );
    setAiReview((previous) => ({
      ...previous,
      issues: previous.issues.map((item) =>
        item.id === issue.id ? { ...item, status: 'accepted' } : item,
      ),
    }));
  }, [autoSnapshot, t]);

  const clearAIReview = useCallback(() => {
    const ed = editorInstance.current;
    if (ed) {
      ed.view.dispatch(
        ed.view.state.tr.setMeta(academicReviewPluginKey, { type: 'clear' }),
      );
    }
    setAiReview({
      open: false,
      loading: false,
      error: null,
      issues: [],
      summary: null,
      progress: { completed: 0, total: 0 },
    });
  }, []);

  const runAIManuscriptTool = useCallback(async (mode: ManuscriptToolModeT) => {
    const ed = editorInstance.current;
    if (!ed) return;
    const fullText = extractFullDocWithCitations().slice(0, 30_000);
    const target = mode === 'titles' ? null : findManuscriptSection(ed, mode);
    if ((mode === 'discussion' || mode === 'conclusion') && !target) {
      alert(
        lang === 'tr'
          ? `${mode === 'discussion' ? 'Discussion' : 'Conclusion'} bölümü bulunamadı.`
          : `No ${mode === 'discussion' ? 'Discussion' : 'Conclusion'} section was found.`,
      );
      return;
    }

    let primaryText = fullText;
    let context: string | undefined;
    let citationNodes: CitationNodeJSON[] = [];
    if (target) {
      const encoded = encodeSelection(ed.state, target.from, target.to);
      primaryText = encoded.encoded;
      citationNodes = encoded.nodes;
      context = mode === 'abstract' ? fullText : detectAbstract() || undefined;
    } else if (mode === 'titles') {
      primaryText = detectAbstract() || fullText.slice(0, 12_000);
    }
    if (primaryText.trim().length < 20) {
      alert(lang === 'tr' ? 'Bu araç için yeterli metin yok.' : 'There is not enough text for this tool.');
      return;
    }

    setManuscriptTool({
      open: true,
      mode,
      loading: true,
      error: null,
      result: null,
      targetRange: target ? { from: target.from, to: target.to } : null,
      citationNodes,
      outputEncoded: '',
    });
    try {
      const response = await fetch('/api/ai/manuscript-tool', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({
          mode,
          text: primaryText,
          context,
          lang,
          preserveCitations: citationNodes.length > 0,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const result = (await response.json()) as ManuscriptToolResultT;
      const outputEncoded = result.output ?? '';
      const displayResult = outputEncoded
        ? {
            ...result,
            output: encodedToPreview(outputEncoded, citationNodes, refOrder),
          }
        : result;
      setManuscriptTool((previous) => ({
        ...previous,
        loading: false,
        result: displayResult,
        outputEncoded,
      }));
    } catch (error) {
      setManuscriptTool((previous) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [detectAbstract, extractFullDocWithCitations, lang, refOrder]);

  const applyManuscriptTool = useCallback(async (text: string) => {
    const ed = editorInstance.current;
    if (!ed || !text.trim()) return;
    await autoSnapshot(t('snap_auto_label'));
    if (manuscriptTool.mode === 'titles') {
      applySuggestedTitle(ed, text.trim());
      setTitle(text.trim());
    } else if (manuscriptTool.targetRange) {
      const content = decodeToTipTapContent(
        manuscriptTool.outputEncoded || text,
        manuscriptTool.citationNodes,
      );
      ed.chain()
        .focus()
        .insertContentAt(manuscriptTool.targetRange, content)
        .run();
    } else {
      insertGeneratedAbstract(ed, text);
    }
    setManuscriptTool((previous) => ({ ...previous, open: false }));
  }, [autoSnapshot, manuscriptTool, t]);

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
      abstractText: includeAbstractExport ? abstractText : undefined,
      keywords: includeAbstractExport ? keywords : undefined,
      figureCaptionPlacement,
      fontFamily,
    });
    download(blob, `${slugify(title)}-${style}-${mode}.docx`);
  }

  /** Export into a bundled journal Word template (styles/headers preserved). */
  async function exportDocxTemplate(templateId: string): Promise<void> {
    const tpl = getDocxTemplate(templateId);
    if (!tpl) return;
    try {
      const res = await fetch(tpl.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const blob = await buildTemplateDocx(bytes, tpl, {
        doc,
        refsById,
        refOrder,
        style,
        mode: 'active',
        title,
        abstractText: includeAbstractExport ? abstractText : undefined,
        keywords: includeAbstractExport ? keywords : undefined,
        figureCaptionPlacement,
        // Template sectPr already carries the journal's line numbering.
        lineNumbers: false,
      });
      download(blob, `${slugify(title)}-${tpl.id}.docx`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportError(`${tpl.name}: ${msg}`);
    }
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
      abstractText: includeAbstractExport ? abstractText : undefined,
      keywords: includeAbstractExport ? keywords : undefined,
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
        `ARTED LaTeX bundle`,
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

  /**
   * "Save as PDF" via the browser print pipeline. A faithful snapshot of the
   * live editor DOM (citation markers, figures, KaTeX, three-line tables are
   * already rendered by the node views) is dropped into a print host in the
   * same document — keeping blob image URLs valid — and printed with an
   * academic stylesheet. The bibliography is appended in the active style.
   */
  function exportPdf(): void {
    const ed = editorInstance.current;
    if (!ed?.view?.dom) return;

    const { orderedRefs } = tiptapToBuildInput(doc as any, refsById, refOrder, style);

    const clone = ed.view.dom.cloneNode(true) as HTMLElement;
    clone.removeAttribute('contenteditable');
    clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
    // Strip editor-only artifacts; unwrap search highlights to keep their text.
    clone.querySelectorAll('.ProseMirror-trailingBreak, .ProseMirror-gapcursor').forEach((el) => el.remove());
    clone.querySelectorAll('.enr-find-match').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));

    const html = buildPrintDocumentHtml({
      title,
      bodyHtml: clone.innerHTML,
      orderedRefs,
      style,
      lang,
      abstractText: includeAbstractExport ? abstractText : undefined,
      keywords: includeAbstractExport ? keywords : undefined,
      bibHeading: 'References',
    });

    if (!document.getElementById(PRINT_STYLE_ID)) {
      const styleEl = document.createElement('style');
      styleEl.id = PRINT_STYLE_ID;
      styleEl.textContent = printStylesheet();
      document.head.appendChild(styleEl);
    }
    let host = document.querySelector(`.${PRINT_HOST_CLASS}`) as HTMLElement | null;
    if (!host) {
      host = document.createElement('div');
      host.className = PRINT_HOST_CLASS;
      document.body.appendChild(host);
    }
    host.innerHTML = html;

    const cleanup = (): void => {
      if (host) host.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  function exportProjectJson(): void {
    const p: Project = { ...project, title, refs, doc, supplementary, abstractText, keywords, tables: manuscriptTables };
    const blob = backupToBlob(buildBackup([p]));
    download(blob, projectFilename(p));
  }

  async function importProjectJson(file: File): Promise<void> {
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      if (!backup.projects?.length) {
        setImportError(lang === 'tr' ? 'Yedek boş.' : 'The backup is empty.');
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
      setAbstractText(p.abstractText ?? '');
      setKeywords(p.keywords ?? []);
      setSupplementary(p.supplementary ?? '');
      setManuscriptTables(p.tables ?? []);

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

      const { bodyParagraphs, abstractText: importedAbstract, keywords: importedKeywords } = splitAbstractMetadataFromParagraphs(
        paragraphs.slice(0, referencesStartIndex),
      );
      const { paragraphs: manuscriptParagraphs, tables } = extractProjectTables(bodyParagraphs, file.name);
      const bodyText = manuscriptParagraphs.map((p) => p.text).join('\n');
      const markers = detectMarkers(bodyText);
      const citationCounts = countCitationsPerRef(parsedRefs.length, markers);

      setImportPreview({
        paragraphs: manuscriptParagraphs,
        bodyText,
        refs: parsedRefs,
        markerCount: markers.length,
        abstractText: importedAbstract,
        keywords: importedKeywords,
        tables,
        citationCounts,
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

      const { bodyParagraphs, abstractText: importedAbstract, keywords: importedKeywords } = splitAbstractMetadataFromParagraphs(
        pastedHtmlParagraphs.slice(0, referencesStartIndex),
      );
      const { paragraphs: manuscriptParagraphs, tables } = extractProjectTables(bodyParagraphs, 'pasted-html');
      const bodyText = manuscriptParagraphs.map((p) => p.text).join('\n');
      const markers = detectMarkers(bodyText);
      const citationCounts = countCitationsPerRef(parsedRefs.length, markers);

      setImportPreview({
        paragraphs: manuscriptParagraphs,
        bodyText,
        refs: parsedRefs,
        markerCount: markers.length,
        abstractText: importedAbstract,
        keywords: importedKeywords,
        tables,
        citationCounts,
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

    const { bodyParagraphs, abstractText: importedAbstract, keywords: importedKeywords } = splitAbstractMetadataFromParagraphs(paragraphs);
    const { paragraphs: manuscriptParagraphs, tables } = extractProjectTables(bodyParagraphs, 'pasted-text');
    const bodyText = manuscriptParagraphs.map((p) => p.text).join('\n');
    const markers = detectMarkers(bodyText);
    const citationCounts = countCitationsPerRef(parsedRefs.length, markers);
    setImportPreview({
      paragraphs: manuscriptParagraphs,
      bodyText,
      refs: parsedRefs,
      markerCount: markers.length,
      abstractText: importedAbstract,
      keywords: importedKeywords,
      tables,
      citationCounts,
    });
  }

  function applyImport(replace: boolean, selectedIndices?: number[]): void {
    if (!importPreview) return;
    const indices =
      selectedIndices && selectedIndices.length > 0
        ? selectedIndices
        : importPreview.refs.map((_, i) => i);
    const newRefs: Ref[] = indices.map((idx) => ({
      ...importPreview.refs[idx],
      id: newRefId(),
    }));
    // Build TipTap doc with citation nodes inserted at [N], [N,M], [N-M] marker positions.
    // Re-map citation markers so only selected references are cited and their
    // numbers are compressed to the new bibliography order.
    const selectedRefNumbers = indices.map((idx) => idx + 1);
    const newDoc = buildDocWithCitations(
      importPreview.paragraphs,
      newRefs,
      selectedRefNumbers,
    );
    if (replace) {
      setRefs(newRefs);
      setDoc(newDoc);
      setAbstractText(importPreview.abstractText ?? '');
      setKeywords(importPreview.keywords ?? []);
      setManuscriptTables(importPreview.tables ?? []);
    } else {
      setRefs((prev) => [...prev, ...newRefs]);
      setDoc((prev: any) => mergeTipTapDocs(prev, newDoc));
      if (importPreview.tables?.length) {
        setManuscriptTables((prev) => [...prev, ...importPreview.tables!]);
      }
      if (!abstractText.trim() && importPreview.abstractText?.trim()) {
        setAbstractText(importPreview.abstractText);
      }
      if (keywords.length === 0 && importPreview.keywords?.length) {
        setKeywords(importPreview.keywords);
      }
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

  function countCitationsPerRef(refCount: number, markers: MarkerOccurrence[]): number[] {
    const counts = new Array(refCount).fill(0);
    for (const marker of markers) {
      for (const n of marker.refNumbers) {
        if (n >= 1 && n <= refCount) {
          counts[n - 1]++;
        }
      }
    }
    return counts;
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
    {
      id: 'tables',
      group: t('cmd_g_view'),
      label: t('tbl_title'),
      run: () => {
        setTablePanelView('list');
        setTablesOpen(true);
      },
    },
    { id: 'journal-check', group: t('cmd_g_doc'), label: t('ed_journal_check'), run: () => setJournalOpen(true) },
    { id: 'checklist', group: t('cmd_g_doc'), label: t('ed_checklist'), run: () => setChecklistOpen(true) },
    { id: 'abstract', group: t('cmd_g_doc'), label: t('ed_abstract'), run: () => setAbstractOpen(true) },
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
    { id: 'export-jcm', group: t('cmd_g_export'), label: t('ed_export_jcm'), run: () => void exportDocxTemplate('jcm') },
    { id: 'export-latex', group: t('cmd_g_export'), label: t('ed_export_latex'), run: exportLatex },
    { id: 'export-pdf', group: t('cmd_g_export'), label: t('ed_export_pdf'), run: exportPdf },
    { id: 'export-json', group: t('cmd_g_export'), label: 'JSON', run: exportProjectJson },
    { id: 'import-docx', group: t('cmd_g_doc'), label: t('ed_import_docx'), run: () => { setShowImportModal(true); setImportPreview(null); setImportError(null); setImportPasteText(''); setPastedHtmlParagraphs(null); setPastedPlainReference(null); } },
    { id: 'lookup-all', group: t('cmd_g_doc'), label: t('rp_scan_all'), run: lookupAllRefs },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className={`border-b border-border bg-surface sticky top-0 z-[80] ${focusMode ? 'hidden' : ''}`}>
        <div className="w-full px-4 sm:px-6 py-3 flex flex-wrap 2xl:flex-nowrap items-start 2xl:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-full 2xl:min-w-0">
            <div className="flex flex-col gap-1 items-start min-w-0 flex-1 mr-2">
              <div className="flex items-center gap-2 flex-wrap text-xs border border-border px-2 py-1 rounded-lg bg-white shadow-xs">
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
                  title={lang === 'tr' ? 'Proje Çalışma Alanı' : 'Project Workspace'}
                >
                  📁 {t('ws_title') || (lang === 'tr' ? 'Çalışma Alanı' : 'Workspace')}
                </button>
              </div>
              <div className="flex items-center gap-1.5 max-w-full flex-wrap">
                <StickyNote />
                <span className="text-muted/30 self-center">|</span>
                <button
                  onClick={() => {
                    setTablesOpen(false);
                    setFiguresOpen(false);
                    setSuppOpen(false);
                    setLettersOpen(false);
                    setAbstractOpen(false);
                    setAbbrOpen(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
                    (!tablesOpen && !figuresOpen && !suppOpen && !lettersOpen && !abstractOpen && !abbrOpen)
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
                    setLettersOpen(false);
                    setAbstractOpen(false);
                    setAbbrOpen(false);
                    setAbstractOpen(true);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
                    abstractOpen
                      ? 'bg-teal text-white shadow-sm'
                      : 'text-secondary hover:text-primary hover:bg-slate-100'
                  }`}
                >
                  A {lang === 'tr' ? 'Abstract' : 'Abstract'}
                </button>
                <button
                  onClick={() => {
                    setTablesOpen(false);
                    setFiguresOpen(false);
                    setSuppOpen(false);
                    setAbbrOpen(false);
                    setAbstractOpen(false);
                    setLettersOpen(true);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
                    lettersOpen
                      ? 'bg-teal text-white shadow-sm'
                      : 'text-secondary hover:text-primary hover:bg-slate-100'
                  }`}
                >
                  📂 {t('ed_letters')}
                </button>
                <button
                  onClick={() => {
                    setFiguresOpen(true);
                    setTablesOpen(false);
                    setSuppOpen(false);
                    setLettersOpen(false);
                    setAbstractOpen(false);
                    setAbbrOpen(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
                    figuresOpen
                      ? 'bg-teal text-white shadow-sm'
                      : 'text-secondary hover:text-primary hover:bg-slate-100'
                  }`}
                >
                  🖼️ Figure Legends
                </button>
                <button
                  onClick={() => {
                    setTablePanelView('list');
                    setTablesOpen(true);
                    setFiguresOpen(false);
                    setSuppOpen(false);
                    setLettersOpen(false);
                    setAbbrOpen(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
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
                    setAbstractOpen(false);
                    setAbbrOpen(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
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
                    setAbstractOpen(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 shrink-0 ${
                    abbrOpen
                      ? 'bg-teal text-white shadow-sm'
                      : 'text-secondary hover:text-primary hover:bg-slate-100'
                  }`}
                >
                  🔤 {lang === 'tr' ? 'Kısaltmalar' : 'Abbreviations'}
                </button>
              </div>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-bold text-primary bg-transparent outline-none border-b border-transparent focus:border-teal min-w-0 flex-1 2xl:flex-none 2xl:w-[22rem] max-w-xs 2xl:max-w-[22rem] truncate"
            />
            <span className="hidden 2xl:inline-block text-xs text-faint shrink-0 w-[8.75rem] text-right tabular-nums whitespace-nowrap">
              {savingState === 'saving'
                ? 'Kaydediliyor…'
                : `Son kayıt ${new Date(savedAt).toLocaleTimeString('tr-TR')}`}
            </span>
          </div>
          <div className="flex gap-1 items-center justify-end text-xs shrink-0 flex-wrap w-full 2xl:w-auto max-w-full 2xl:max-w-[56vw] ml-auto">

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
              <DropItem onClick={(e) => { e.stopPropagation(); setIncludeAbstractExport(!includeAbstractExport); }}>
                {includeAbstractExport ? '☑️' : '☐'} {t('ed_export_include_abstract')}
              </DropItem>
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
              <DropItem onClick={() => void exportDocxTemplate('jcm')}>📰 {t('ed_export_jcm')}</DropItem>
              <DropItem onClick={exportRis}>🗂️ {t('ed_export_ris')}</DropItem>
              <DropItem onClick={exportLatex}>📐 {t('ed_export_latex')}</DropItem>
              <DropItem onClick={exportPdf}>📄 {t('ed_export_pdf')}</DropItem>
              <DropItem onClick={exportProjectJson}>💾 {t('ed_export_json')}</DropItem>
            </HeaderDropdown>
            <HeaderIcon onClick={() => setPaletteOpen(true)} title={`${t('cmd_open')} (⌘K)`} label="⌘K" caption={t('hdr_palette')} />
            <HeaderIcon onClick={openPhrasebank} title={t('pb_title')} label="§" caption={t('hdr_phrasebank')} />
            <HeaderIcon onClick={() => setStatsOpen(true)} title={t('ed_stats')} label="📊" caption={t('hdr_stats')} />
            <HeaderIcon onClick={() => setSnapshotsOpen(true)} title={t('ed_snapshots')} label="🕓" caption={t('hdr_versions')} />
            <HeaderIcon onClick={() => setJournalOpen(true)} title={t('ed_journal_check')} label="📋" caption={t('hdr_journal')} />
            <HeaderIcon onClick={() => setChecklistOpen(true)} title={t('ed_checklist')} label="✅" caption={t('hdr_checklist')} />
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
              onTableInsertRequest={() => {
                setTablePanelView('import');
                setTablesOpen(true);
                setFiguresOpen(false);
                setSuppOpen(false);
                setLettersOpen(false);
                setAbstractOpen(false);
                setAbbrOpen(false);
              }}
              onAIReview={runAIReview}
              onAIScore={runAIScore}
              onAIEnhance={runAIEnhance}
              onAISuggestCitation={runAISuggestCitation}
              onAIDetectGaps={runAIDetectGaps}
              onAICompare={runAICompare}
              onAIDeepResearch={runAIDeepResearch}
              onAIStructureCheck={runAIStructureCheck}
              onAIManuscriptTool={runAIManuscriptTool}
              onIntegrityCheck={() => setIntegrityOpen(true)}
              aiDisabled={aiConfigured === false}
              fontFamily={fontFamily}
              onFontFamilyChange={setFontFamily}
              styleId={style}
              styleOptions={styleOptions}
              onStyleChange={(v) => {
                if (v === '__new__') {
                  setStyleSeed(null);
                  setStyleEditorOpen(true);
                  return;
                }
                setStyle(v as StyleId);
              }}
              onStyleEdit={() => {
                setStyleSeed(null);
                setStyleEditorOpen(true);
              }}
              onFindReplace={() => setShowFind(true)}
              onRenumberCitations={updateAllCitations}
            />
          </div>
        </div>

          {/* Top vertical divider */}
          <div
            onMouseDown={startTopColDrag}
            className={`cursor-col-resize flex items-center justify-center group shrink-0 w-2 ${focusMode ? 'hidden' : ''}`}
            title={lang === 'tr' ? 'Sürükle: üst sütun genişliği' : 'Drag: top column width'}
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
            getRefCitationCount={getRefCitationCount}
            onJumpToRefCitation={jumpToRefCitation}
          />
          </div>
        </div>

        {/* Horizontal row divider — full width */}
        <div
          onMouseDown={startRowDrag}
          className={`cursor-row-resize flex items-center justify-center group shrink-0 h-2 ${focusMode ? 'hidden' : ''}`}
          title={lang === 'tr' ? 'Sürükle: satır yüksekliği' : 'Drag: row height'}
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
            title={lang === 'tr' ? 'Sürükle: alt sütun genişliği' : 'Drag: bottom column width'}
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
          onTableInsertRequest={() => {
            setTablePanelView('import');
            setTablesOpen(true);
            setFiguresOpen(false);
            setSuppOpen(false);
            setLettersOpen(false);
            setAbstractOpen(false);
            setAbbrOpen(false);
          }}
          onAIReview={runAIReview}
          onAIScore={runAIScore}
          onAIEnhance={runAIEnhance}
          onAISuggestCitation={runAISuggestCitation}
          onAIDetectGaps={runAIDetectGaps}
          onAICompare={runAICompare}
          onAIDeepResearch={runAIDeepResearch}
          onAIStructureCheck={runAIStructureCheck}
          onAIManuscriptTool={runAIManuscriptTool}
          onIntegrityCheck={() => setIntegrityOpen(true)}
          aiDisabled={aiConfigured === false}
          fontFamily={fontFamily}
          onFontFamilyChange={setFontFamily}
          styleId={style}
          styleOptions={styleOptions}
          onStyleChange={(v) => {
            if (v === '__new__') {
              setStyleSeed(null);
              setStyleEditorOpen(true);
              return;
            }
            setStyle(v as StyleId);
          }}
          onStyleEdit={() => {
            setStyleSeed(null);
            setStyleEditorOpen(true);
          }}
          onFindReplace={() => setShowFind(true)}
          onRenumberCitations={updateAllCitations}
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
          getRefCitationCount={getRefCitationCount}
          onJumpToRefCitation={jumpToRefCitation}
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
        <DocImportModal
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
            progress={aiReview.progress}
            onClose={() => setAiReview((s) => ({ ...s, open: false }))}
            onJumpTo={jumpToIssue}
            onApply={(issue) => {
              void applyAIReviewIssue(issue);
            }}
            onDismiss={dismissAIReviewIssue}
            onClear={clearAIReview}
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

      {manuscriptTool.open && (
        <ManuscriptToolModal
          mode={manuscriptTool.mode}
          result={manuscriptTool.result}
          loading={manuscriptTool.loading}
          error={manuscriptTool.error}
          onClose={() => setManuscriptTool((previous) => ({ ...previous, open: false }))}
          onApply={(text) => {
            void applyManuscriptTool(text);
          }}
        />
      )}

      {integrityOpen && (
        <IntegrityModal
          text={extractFullDocWithCitations()}
          title={title}
          onClose={() => setIntegrityOpen(false)}
        />
      )}

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
            currentAbstractText={abstractText}
            currentKeywords={keywords}
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
        <div className="fixed right-4 top-24 bottom-4 w-[760px] max-w-[calc(100vw-2rem)] z-40 shadow-2xl">
          <TablePanel
            editor={editorInstance.current}
            storedTables={manuscriptTables}
            onStoredTablesChange={setManuscriptTables}
            onClose={() => setTablesOpen(false)}
            t={t}
            initialView={tablePanelView}
          />
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

      {abstractOpen && (
        <AbstractPanel
          value={abstractText}
          onChange={setAbstractText}
          keywords={keywords}
          onKeywordsChange={setKeywords}
          onClose={() => setAbstractOpen(false)}
          lang={lang}
        />
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
            abstractText={abstractText}
            stats={writingStats}
            referenceStyle={style}
            bibliographyReferenceCount={refs.filter((ref) => refOrder.has(ref.id)).length}
            onReferenceStyleChange={(nextStyle) => setStyle(nextStyle)}
            onClose={() => setJournalOpen(false)}
            t={t}
          />
        </div>
      )}

      {checklistOpen && (
        <div className="fixed right-4 top-24 bottom-4 w-[380px] z-40 shadow-2xl">
          <ChecklistPanel
            docJson={doc}
            projectId={project.id}
            manuscriptTitle={title}
            lang={lang}
            t={t}
            onClose={() => setChecklistOpen(false)}
            onInsertText={(text) => {
              const ed = editorInstance.current;
              if (!ed) return;
              const paragraphs = text
                .split('\n')
                .map((line) => ({ type: 'paragraph', content: line.trim() ? [{ type: 'text', text: line }] : [] }));
              ed.chain().focus('end').insertContent(paragraphs).run();
              setChecklistOpen(false);
            }}
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
      {caption && <span className="mt-0.5 hidden xl:inline text-[9px] text-muted">{caption}</span>}
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
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-2 py-0.5 text-xs rounded border whitespace-nowrap ${primary ? 'border-teal bg-teal text-white hover:bg-teal-dark' : 'border-border text-secondary hover:bg-slate-50'}`}
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

type RuntimeReviewBlock = ReviewBlock & { positions: number[] };

function extractAcademicReviewBlocks(editor: any): RuntimeReviewBlock[] {
  const blocks: RuntimeReviewBlock[] = [];
  let section = 'Manuscript';
  editor.state.doc.forEach((node: any, offset: number, index: number) => {
    const characters: string[] = [];
    const positions: number[] = [];
    node.descendants((child: any, relativePos: number) => {
      if (!child.isText || !child.text) return true;
      for (let charIndex = 0; charIndex < child.text.length; charIndex += 1) {
        characters.push(child.text[charIndex]);
        positions.push(offset + 1 + relativePos + charIndex);
      }
      return true;
    });
    const text = characters.join('');
    if (!text.trim()) return;
    if (node.type?.name === 'heading') section = text.trim();
    blocks.push({
      id: `block-${index}-${offset}`,
      text,
      section,
      from: positions[0],
      to: positions.at(-1) != null ? positions.at(-1)! + 1 : undefined,
      positions,
    });
  });
  return blocks;
}

function locateAcademicSuggestion(
  suggestion: AcademicReviewSuggestionT,
  sentBlock: ReviewBlock,
  sourceBlock: RuntimeReviewBlock,
  editor: any,
): { from: number; to: number } | null {
  const localOffset = nthIndexOf(
    sentBlock.text,
    suggestion.quote,
    suggestion.occurrence ?? 0,
  );
  if (localOffset < 0) return null;
  const sourceOffset = (sentBlock.textOffset ?? 0) + localOffset;
  const first = sourceBlock.positions[sourceOffset];
  const last = sourceBlock.positions[sourceOffset + suggestion.quote.length - 1];
  if (first == null || last == null) return null;
  const range = { from: first, to: last + 1 };
  let containsProtectedNode = false;
  editor.state.doc.nodesBetween(range.from, range.to, (node: any) => {
    if (node.type?.name === 'citation' || node.type?.name === 'equation') {
      containsProtectedNode = true;
      return false;
    }
    return true;
  });
  return containsProtectedNode ? null : range;
}

function nthIndexOf(text: string, query: string, occurrence: number): number {
  if (!query || occurrence < 0) return -1;
  let from = 0;
  let result = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    result = text.indexOf(query, from);
    if (result < 0) return -1;
    from = result + Math.max(1, query.length);
  }
  return result;
}

function findManuscriptSection(
  editor: any,
  mode: Exclude<ManuscriptToolModeT, 'titles'>,
): { from: number; to: number } | null {
  const aliases: Record<Exclude<ManuscriptToolModeT, 'titles'>, RegExp> = {
    abstract: /^(abstract|summary|öz|özet)\b/i,
    discussion: /^(discussion|tartışma)\b/i,
    conclusion: /^(conclusion|conclusions|sonuç|sonuçlar)\b/i,
  };
  let from: number | null = null;
  let to: number | null = null;
  editor.state.doc.forEach((node: any, offset: number) => {
    if (node.type?.name !== 'heading') return;
    const heading = node.textContent.trim();
    if (from == null && aliases[mode].test(heading)) {
      from = offset + node.nodeSize;
      return;
    }
    if (from != null && to == null) to = offset;
  });
  if (from == null) return null;
  const end = to ?? editor.state.doc.content.size;
  return end > from ? { from, to: end } : null;
}

function applySuggestedTitle(editor: any, title: string): void {
  let headingRange: { from: number; to: number } | null = null;
  editor.state.doc.forEach((node: any, offset: number) => {
    if (headingRange || node.type?.name !== 'heading' || node.attrs?.level !== 1) return;
    headingRange = { from: offset + 1, to: offset + node.nodeSize - 1 };
  });
  if (headingRange) {
    editor.chain().focus().insertContentAt(headingRange, title).run();
    return;
  }
  editor.chain().focus().insertContentAt(0, {
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: title }],
  }).run();
}

function insertGeneratedAbstract(editor: any, text: string): void {
  let position = 0;
  editor.state.doc.forEach((node: any, offset: number) => {
    if (node.type?.name === 'heading' && node.attrs?.level === 1) {
      position = offset + node.nodeSize;
    }
  });
  const paragraphs = decodeToTipTapContent(text, []);
  editor.chain().focus().insertContentAt(position, [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Abstract' }],
    },
    ...paragraphs,
  ]).run();
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
