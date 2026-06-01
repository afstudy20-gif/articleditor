'use client';

import { useRef, useState } from 'react';
import type { Ref, RefType } from '@/store/types';
import { newId } from '@/lib/id';
import { useLang } from '@/lib/i18n/hooks';
import { importByAutoDetect, importByExtension, FORMAT_LABELS, type ImportFormat } from '@/lib/refs/import-auto';
import { parseEns, looksLikeEns } from '@/lib/refs/ens';
import {
  HISTORY_LABELS,
  formatHistoryTime,
  type HistoryEntry,
} from '@/lib/history';

type Props = {
  refs: Ref[];
  refOrder: Map<string, number>;
  onAddByDoi: (doi: string) => Promise<void>;
  onLookupDoi?: (doi: string) => Promise<Ref | null>;
  onSearch: (query: string, opts?: { fromYear?: number; toYear?: number }) => Promise<Ref[]>;
  onAddRef: (ref: Ref) => void;
  onInsertCitation: (refId: string) => void;
  onInsertCitationMulti?: (refIds: string[]) => void;
  onUpdateRef: (id: string, patch: Partial<Ref>) => void;
  onDeleteRef: (id: string) => void;
  onLookupRef?: (id: string) => Promise<void>;
  onExtractAspects?: (id: string) => Promise<void>;
  onLookupAll?: () => Promise<void>;
  lookupBusyId?: string | null;
  lookupAllBusy?: boolean;
  selectedId?: string | null;
  onSelectRef?: (id: string) => void;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  onBulkDelete?: (ids: string[]) => void;
  onEnrichRefs?: (refs: Ref[]) => Promise<Ref[]>;
  history?: HistoryEntry[];
  onUndoHistory?: (id: string) => void;
  onClearHistory?: () => void;
};

export function RefsPanel({
  refs,
  refOrder,
  onAddByDoi,
  onLookupDoi,
  onSearch,
  onAddRef,
  onInsertCitation,
  onInsertCitationMulti,
  onUpdateRef,
  onDeleteRef,
  onLookupRef,
  onExtractAspects,
  onLookupAll,
  lookupBusyId,
  lookupAllBusy,
  selectedId,
  onSelectRef,
  selectedIds: extSelectedIds,
  onSelectedIdsChange,
  onBulkDelete,
  onEnrichRefs,
  history,
  onUndoHistory,
  onClearHistory,
}: Props) {
  const { t } = useLang();
  const [tab, setTab] = useState<'list' | 'add' | 'history'>('list');
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const selectedIds = extSelectedIds ?? internalSelectedIds;
  const setSelectedIds = (next: Set<string>): void => {
    if (onSelectedIdsChange) onSelectedIdsChange(next);
    else setInternalSelectedIds(next);
  };

  function toggleSelect(id: string): void {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }
  function clearSelection(): void {
    setSelectedIds(new Set());
  }
  function bulkDelete(): void {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const msg = `${ids.length} ${t('rp_bulk_delete_confirm')}`;
    if (!confirm(msg)) return;
    if (onBulkDelete) onBulkDelete(ids);
    clearSelection();
  }
  return (
    <div className="card flex flex-col h-full">
      <div className="flex border-b border-border">
        <button
          className={`flex-1 px-2 py-2 text-xs font-semibold ${
            tab === 'list' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('list')}
        >
          {t('rp_tab_library')} ({refs.length})
        </button>
        <button
          className={`flex-1 px-2 py-2 text-xs font-semibold ${
            tab === 'add' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('add')}
        >
          {t('rp_tab_add')}
        </button>
        <button
          className={`flex-1 px-2 py-2 text-xs font-semibold ${
            tab === 'history' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('history')}
        >
          🕒 {t('rp_tab_history')}{history && history.length > 0 ? ` (${history.filter((h) => !h.undone).length})` : ''}
        </button>
      </div>
      {tab === 'list' && onLookupAll && refs.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {refs.filter((r) => r.doi).length}/{refs.length} {t('rp_doi_with_count')} · {refs.filter((r) => r.abstract).length}{' '}
            {t('rp_abstract_count')}
          </span>
          <button
            onClick={onLookupAll}
            disabled={lookupAllBusy}
            className="btn-secondary text-xs px-2 py-1"
          >
            {lookupAllBusy ? t('rp_scanning') : t('rp_scan_all')}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {tab === 'list' ? (
          <RefList
            refs={refs}
            refOrder={refOrder}
            onInsert={onInsertCitation}
            onUpdate={onUpdateRef}
            onDelete={onDeleteRef}
            onLookup={onLookupRef}
            onExtractAspects={onExtractAspects}
            lookupBusyId={lookupBusyId}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            highlightedId={selectedId}
            onHighlight={onSelectRef}
            t={t}
          />
        ) : tab === 'add' ? (
          <AddPanel onAddByDoi={onAddByDoi} onLookupDoi={onLookupDoi} onSearch={onSearch} onAddRef={onAddRef} onEnrichRefs={onEnrichRefs} t={t} />
        ) : (
          <HistoryPanel
            history={history ?? []}
            onUndo={onUndoHistory}
            onClear={onClearHistory}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

type ContextMenuState = {
  refId: string;
  x: number;
  y: number;
};

function RefList({
  refs,
  refOrder,
  onInsert,
  onDelete,
  onLookup,
  onExtractAspects,
  lookupBusyId,
  selectedIds,
  onToggleSelect,
  highlightedId,
  onHighlight,
  onUpdate,
  t,
}: {
  refs: Ref[];
  refOrder: Map<string, number>;
  onInsert: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Ref>) => void;
  onDelete: (id: string) => void;
  onLookup?: (id: string) => Promise<void>;
  onExtractAspects?: (id: string) => Promise<void>;
  lookupBusyId?: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  highlightedId?: string | null;
  onHighlight?: (id: string) => void;
  t: (k: string) => string;
}): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const useExternalHighlight = !!onHighlight;

  function toggleExpand(id: string): void {
    setExpandedId(expandedId === id ? null : id);
  }

  function openContext(e: React.MouseEvent, refId: string): void {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ refId, x: e.clientX, y: e.clientY });
  }
  function closeContext(): void {
    setContextMenu(null);
  }

  const ctxRef = contextMenu ? refs.find((r) => r.id === contextMenu.refId) : null;

  if (refs.length === 0)
    return (
      <p className="text-sm text-muted text-center py-8">
        — <strong>{t('rp_tab_add')}</strong>
      </p>
    );
  return (
    <ol className="space-y-2">
      {refs.map((r) => {
        const n = refOrder.get(r.id) ?? 0;
        const expanded = expandedId === r.id;
        const isSelected = selectedIds?.has(r.id) ?? false;
        const isHighlighted = useExternalHighlight && highlightedId === r.id;
        return (
          <li
            key={r.id}
            onContextMenu={(e) => openContext(e, r.id)}
            className={`border rounded-lg p-2.5 text-sm transition ${
              isHighlighted
                ? 'border-teal bg-teal-bg shadow-card'
                : isSelected
                  ? 'border-teal bg-teal-bg/50'
                  : 'border-border'
            }`}
          >
            <div className="flex items-start gap-2">
              {onToggleSelect && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(r.id)}
                  className="mt-1.5 shrink-0 accent-teal cursor-pointer"
                  title={t('rp_select_for_multi')}
                />
              )}
              <span
                className={`shrink-0 w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center ${
                  n > 0 ? 'bg-teal text-white' : 'bg-slate-100 text-muted'
                }`}
              >
                {n > 0 ? n : '—'}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="font-medium text-primary leading-snug cursor-pointer hover:text-teal"
                  title={r.title}
                  onClick={() => {
                    if (useExternalHighlight) onHighlight?.(r.id);
                    else toggleExpand(r.id);
                  }}
                >
                  {r.title || r.raw?.slice(0, 60) || t('rp_no_title')}
                </div>
                <div className="text-xs text-muted truncate">
                  {r.authors[0]?.family || r.authors[0]?.literal || '—'}
                  {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                </div>
                {r.doi && (
                  <a
                    href={`https://doi.org/${r.doi}`}
                    target="_blank"
                    rel="noopener"
                    className="block text-[11px] text-teal font-mono truncate mt-0.5 hover:underline"
                    title={r.doi}
                  >
                    {r.doi}
                  </a>
                )}
                <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                  {r.doi && (
                    <a
                      href={`https://doi.org/${r.doi}`}
                      target="_blank"
                      rel="noopener"
                      className="bg-teal-bg text-teal px-1.5 py-0.5 rounded hover:underline"
                    >
                      DOI
                    </a>
                  )}
                  {r.pmid && (
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}`}
                      target="_blank"
                      rel="noopener"
                      className="bg-teal-bg text-teal px-1.5 py-0.5 rounded hover:underline"
                    >
                      PMID
                    </a>
                  )}
                  {r.abstract && (
                    <span className="bg-slate-100 text-muted px-1.5 py-0.5 rounded">{t('rp_doi_abstract')}</span>
                  )}
                  {r.userNote && (
                    <span className="bg-teal-bg text-teal px-1.5 py-0.5 rounded" title={t('rp_edit_note')}>
                      📝 {t('rp_edit_note')}
                    </span>
                  )}
                  <button
                    onClick={() => toggleExpand(r.id)}
                    className="text-muted hover:text-teal ml-auto"
                    title={t('rp_doi_abstract')}
                  >
                    {expandedId === r.id ? '▼' : '▶'}
                  </button>
                  {onLookup && (
                    <button
                      onClick={() => onLookup(r.id)}
                      disabled={lookupBusyId === r.id}
                      className="text-teal hover:underline"
                    >
                      {lookupBusyId === r.id ? t('rp_looking_up') : t('rp_lookup_doi')}
                    </button>
                  )}
                  <button onClick={() => onInsert(r.id)} className="text-teal font-semibold hover:underline">
                    {t('rp_insert_citation')} →
                  </button>
                  <button onClick={() => onDelete(r.id)} className="text-red hover:underline">
                    {t('rp_context_delete')}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2 text-xs">
                    {r.authors.length > 0 && (
                      <div>
                        <div className="tool-label">{t('rp_edit_authors')}</div>
                        <div className="text-secondary leading-relaxed">
                          {r.authors
                            .map((a) => {
                              if (a.literal) return a.literal;
                              return [a.family, a.given].filter(Boolean).join(', ');
                            })
                            .join('; ')}
                        </div>
                      </div>
                    )}
                    {(r.volume || r.issue || r.pages) && (
                      <div className="flex gap-3 text-muted">
                        {r.volume && (
                          <span>
                            <span className="tool-label inline">{t('rp_edit_volume')}</span>{' '}
                            <span className="text-primary font-semibold">{r.volume}</span>
                          </span>
                        )}
                        {r.issue && (
                          <span>
                            <span className="tool-label inline">{t('rp_edit_issue')}</span>{' '}
                            <span className="text-primary font-semibold">{r.issue}</span>
                          </span>
                        )}
                        {r.pages && (
                          <span>
                            <span className="tool-label inline">{t('rp_edit_pages')}</span>{' '}
                            <span className="text-primary font-semibold">{r.pages}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {r.abstract ? (
                      <div>
                        <div className="tool-label mb-1">{t('rp_doi_abstract')}</div>
                        <p className="text-secondary leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-auto">
                          {r.abstract}
                        </p>
                      </div>
                    ) : (
                      <p className="text-faint italic">
                        — <strong>{t('rp_lookup_doi')}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
      {contextMenu && ctxRef && (
        <ContextMenu
          reference={ctxRef}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContext}
          onInsert={() => {
            onInsert(ctxRef.id);
            closeContext();
          }}
          onDelete={() => {
            onDelete(ctxRef.id);
            closeContext();
          }}
          onLookup={onLookup ? () => onLookup(ctxRef.id).then(closeContext) : undefined}
          onExtractAspects={
            onExtractAspects ? () => onExtractAspects(ctxRef.id).then(closeContext) : undefined
          }
          onShowAbstract={
            onHighlight
              ? () => {
                  onHighlight(ctxRef.id);
                  closeContext();
                }
              : undefined
          }
          onSaveNote={(note: string) => {
            onUpdate(ctxRef.id, { userNote: note });
          }}
          onEdit={() => {
            setEditingId(ctxRef.id);
            closeContext();
          }}
          t={t}
        />
      )}
      {editingId && (() => {
        const target = refs.find((r) => r.id === editingId);
        if (!target) return null;
        return (
          <RefEditModal
            reference={target}
            onClose={() => setEditingId(null)}
            onSave={(patch) => {
              onUpdate(target.id, patch);
              setEditingId(null);
            }}
            t={t}
          />
        );
      })()}
    </ol>
  );
}

function RefEditModal({
  reference: r,
  onClose,
  onSave,
  t,
}: {
  reference: Ref;
  onClose: () => void;
  onSave: (patch: Partial<Ref>) => void;
  t: (k: string) => string;
}): JSX.Element {
  const authorsToText = (rr: Ref): string =>
    rr.authors
      .map((a) => (a.literal ? a.literal : [a.family, a.given].filter(Boolean).join(', ')))
      .join('; ');
  const [title, setTitle] = useState(r.title ?? '');
  const [authorsText, setAuthorsText] = useState(authorsToText(r));
  const [year, setYear] = useState<string>(r.year ? String(r.year) : '');
  const [container, setContainer] = useState(r.containerTitle ?? '');
  const [volume, setVolume] = useState(r.volume ?? '');
  const [issue, setIssue] = useState(r.issue ?? '');
  const [pages, setPages] = useState(r.pages ?? '');
  const [doi, setDoi] = useState(r.doi ?? '');
  const [pmid, setPmid] = useState(r.pmid ?? '');
  const [url, setUrl] = useState(r.url ?? '');
  const [type, setType] = useState<string>(r.type ?? 'journal-article');
  const [abstractText, setAbstractText] = useState(r.abstract ?? '');

  function parseAuthorsField(text: string): Ref['authors'] {
    return text
      .split(/;\s*|\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        // "Family, Given" or "literal text"
        const m = entry.match(/^([^,]+),\s*(.+)$/);
        if (m) return { family: m[1].trim(), given: m[2].trim() };
        // Single token w/ space: assume "Given Family" → split last word as family.
        const parts = entry.split(/\s+/);
        if (parts.length >= 2) {
          const fam = parts[parts.length - 1];
          const given = parts.slice(0, -1).join(' ');
          return { family: fam, given };
        }
        return { literal: entry };
      });
  }

  function handleSave(): void {
    const patch: Partial<Ref> = {
      title: title.trim() || undefined,
      authors: parseAuthorsField(authorsText),
      year: year.trim() ? parseInt(year, 10) : undefined,
      containerTitle: container.trim() || undefined,
      volume: volume.trim() || undefined,
      issue: issue.trim() || undefined,
      pages: pages.trim() || undefined,
      doi: doi.trim() || undefined,
      pmid: pmid.trim() || undefined,
      url: url.trim() || undefined,
      type: type as Ref['type'],
      abstract: abstractText.trim() || undefined,
    };
    onSave(patch);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(640px,95vw)] max-h-[90vh] flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary">{t('rp_edit')}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-3 space-y-3 text-sm">
          <Field label={t('rp_edit_title')}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
            />
          </Field>
          <Field
            label={t('rp_edit_authors')}
            hint='Format: "Family, Given" — Smith, John A; Doe, Jane B'
          >
            <textarea
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              rows={2}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal font-mono text-xs"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t('rp_edit_year')}>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                maxLength={4}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label={t('rp_manual_type')}>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              >
                <option value="journal-article">{t('rp_type_journal')}</option>
                <option value="book">{t('rp_type_book')}</option>
                <option value="book-chapter">{t('rp_type_chapter')}</option>
                <option value="conference-paper">{t('rp_type_conference')}</option>
                <option value="thesis">{t('rp_type_thesis')}</option>
                <option value="webpage">{t('rp_type_webpage')}</option>
                <option value="report">{t('rp_type_report')}</option>
                <option value="other">{t('rp_type_other')}</option>
              </select>
            </Field>
            <Field label={t('rp_edit_doi')}>
              <input
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal font-mono text-xs"
              />
            </Field>
          </div>
          <Field label={t('rp_edit_journal')}>
            <input
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
            />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <Field label={t('rp_edit_volume')}>
              <input
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label={t('rp_edit_issue')}>
              <input
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label={t('rp_edit_pages')}>
              <input
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label={t('rp_edit_pmid')}>
              <input
                value={pmid}
                onChange={(e) => setPmid(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
          </div>
          <Field label={t('rp_edit_url')}>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal font-mono text-xs"
            />
          </Field>
          <Field label={t('rp_doi_abstract')}>
            <textarea
              value={abstractText}
              onChange={(e) => setAbstractText(e.target.value)}
              rows={5}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs"
            />
          </Field>
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="text-muted hover:text-primary text-sm px-3 py-1.5">
            {t('rp_edit_cancel')}
          </button>
          <button onClick={handleSave} className="btn-primary text-sm px-4 py-1.5">
            {t('rp_edit_save')}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <label className="tool-label block mb-0.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function ContextMenu({
  reference: r,
  x,
  y,
  onClose,
  onInsert,
  onDelete,
  onLookup,
  onShowAbstract,
  onSaveNote,
  onEdit,
  onExtractAspects,
  t,
}: {
  reference: Ref;
  x: number;
  y: number;
  onClose: () => void;
  onInsert: () => void;
  onDelete: () => void;
  onLookup?: () => void;
  onShowAbstract?: () => void;
  onSaveNote?: (note: string) => void;
  onEdit?: () => void;
  onExtractAspects?: () => void;
  t: (k: string) => string;
}): JSX.Element {
  const [noteEdit, setNoteEdit] = useState(false);
  const [noteValue, setNoteValue] = useState(r.userNote ?? '');
  const fullTextUrl = r.doi ? `https://doi.org/${r.doi}` : r.url;
  const pubmedUrl = r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}` : null;
  const MENU_W = 420;
  const MENU_MAX_H = 560;
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        className="fixed z-40 bg-white border border-border rounded-lg shadow-xl py-1 text-sm flex flex-col"
        style={{
          left: Math.min(x, window.innerWidth - MENU_W - 8),
          top: Math.min(y, window.innerHeight - MENU_MAX_H - 8),
          width: MENU_W,
          maxHeight: MENU_MAX_H,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="font-semibold text-primary text-sm leading-tight">
            {r.title || t('rp_no_title')}
          </div>
          <div className="text-xs text-muted mt-0.5">
            {r.authors[0]?.family || '—'}
            {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'}
            {r.containerTitle ? ` · ${r.containerTitle}` : ''}
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          {r.abstract && (
            <div className="px-3 py-2 border-b border-border text-xs text-secondary leading-relaxed">
              <div className="tool-label mb-1">{t('rp_doi_abstract')}</div>
              <p className="whitespace-pre-wrap">{r.abstract}</p>
            </div>
          )}
          {!r.abstract && onLookup && (
            <button
              onClick={onLookup}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal border-b border-border"
            >
              🔍 {t('rp_doi_abstract')}/{t('rp_lookup_doi')}
            </button>
          )}

          {r.aspects && (
            <div className="px-3 py-2 border-b border-border text-xs">
              <div className="tool-label mb-1">{t('rp_extract_aspects')}</div>
              {(['goals', 'methods', 'datasets', 'eval_protocols', 'limitations', 'contributions', 'findings'] as const).map((k) => {
                const items = r.aspects?.[k];
                if (!items || items.length === 0) return null;
                const label: Record<string, string> = {
                  goals: t('rp_aspects_goals'),
                  methods: t('rp_aspects_methods'),
                  datasets: t('rp_aspects_datasets'),
                  eval_protocols: t('rp_aspects_eval'),
                  limitations: t('rp_aspects_limitations'),
                  contributions: t('rp_aspects_contributions'),
                  findings: t('rp_aspects_findings'),
                };
                return (
                  <div key={k} className="mb-1">
                    <span className="font-semibold text-primary">{label[k]}:</span>
                    <ul className="list-disc list-inside text-secondary">
                      {items.map((it, i) => (
                        <li key={i} className="leading-snug">{it}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* Manual note section */}
          <div className="px-3 py-2 border-b border-border">
            <div className="tool-label mb-1.5">{t('rp_edit_note')}</div>
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder={t('rp_edit_note') + '...'}
              className="w-full min-h-[60px] text-xs border border-border rounded p-2 outline-none focus:border-teal bg-slate-50 focus:bg-white resize-y"
            />
            {noteValue !== (r.userNote ?? '') && (
              <div className="flex gap-2 mt-1.5 justify-end">
                <button
                  onClick={() => {
                    onSaveNote?.(noteValue);
                  }}
                  className="btn-primary text-xs px-2.5 py-1"
                >
                  {t('rp_edit_save')}
                </button>
                <button
                  onClick={() => {
                    setNoteValue(r.userNote ?? '');
                  }}
                  className="text-xs text-muted hover:text-primary px-1 py-1"
                >
                  {t('rp_edit_cancel')}
                </button>
              </div>
            )}
          </div>

          {onShowAbstract && (
            <button
              onClick={onShowAbstract}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              📄 {t('rp_extract_aspects')}
            </button>
          )}

          {fullTextUrl ? (
            <a
              href={fullTextUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔗 {t('rp_fulltext')} ({r.doi ? 'DOI' : 'URL'}) ↗
            </a>
          ) : (
            <span className="block px-3 py-1.5 text-xs text-secondary opacity-50 cursor-not-allowed">
              🔗 {t('rp_fulltext')} ↗
            </span>
          )}

          {r.doi ? (
            <a
              href={`https://sci-hub.ist/${r.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔓 Sci-Hub ↗
            </a>
          ) : (
            <span className="block px-3 py-1.5 text-xs text-secondary opacity-50 cursor-not-allowed">
              🔓 Sci-Hub ↗
            </span>
          )}

          {pubmedUrl ? (
            <a
              href={pubmedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔗 PubMed ↗
            </a>
          ) : (
            <span className="block px-3 py-1.5 text-xs text-secondary opacity-50 cursor-not-allowed">
              🔗 PubMed ↗
            </span>
          )}

          <a
            href={
              r.doi
                ? `https://www.google.com/scholar?q=${encodeURIComponent(r.doi)}`
                : `https://www.google.com/scholar?q=${encodeURIComponent(r.title ?? '')}`
            }
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
          >
            🎓 Google Scholar ↗
          </a>
        </div>

        <div className="border-t border-border shrink-0 bg-white">
          <button
            onClick={onInsert}
            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal font-semibold"
          >
            ➕ {t('rp_insert_citation')}
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              ✏️ {t('rp_edit')}
            </button>
          )}
          {onLookup && r.abstract && (
            <button
              onClick={onLookup}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔄 {t('rp_lookup_doi')}
            </button>
          )}
          {onExtractAspects && (
            <button
              onClick={onExtractAspects}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
              title={t('rp_extract_aspects')}
            >
              🔬 {t('rp_extract_aspects')}
            </button>
          )}
          <button
            onClick={onDelete}
            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-red-bg hover:text-red text-red"
          >
            🗑️ {t('rp_context_delete')}
          </button>
        </div>
      </div>
    </>
  );
}

function AddPanel({
  onAddByDoi,
  onLookupDoi,
  onSearch,
  onAddRef,
  onEnrichRefs,
  t,
}: {
  onAddByDoi: (doi: string) => Promise<void>;
  onLookupDoi?: (doi: string) => Promise<Ref | null>;
  onSearch: (q: string, opts?: { fromYear?: number; toYear?: number }) => Promise<Ref[]>;
  onAddRef: (ref: Ref) => void;
  onEnrichRefs?: (refs: Ref[]) => Promise<Ref[]>;
  t: (k: string) => string;
}): JSX.Element {
  const [doi, setDoi] = useState('');
  const [q, setQ] = useState('');
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [results, setResults] = useState<Ref[]>([]);
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<ImportFormat | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [doiPreview, setDoiPreview] = useState<Ref | null>(null);
  const [doiError, setDoiError] = useState<string | null>(null);

  async function commitImport(refs: Ref[], format: ImportFormat): Promise<void> {
    if (refs.length === 0) {
      setImportMsg(t('rp_import_no_refs').replace('{format}', FORMAT_LABELS[format]));
      return;
    }
    setImportBusy(true);
    try {
      let toAdd = refs;
      // For plaintext (no DOI/PMID), auto-enrich via CrossRef/PubMed when handler available.
      if (format === 'plaintext' && onEnrichRefs) {
        const needLookup = refs.filter((r) => !r.doi && !r.pmid);
        if (needLookup.length > 0) {
          setImportMsg(t('rp_import_enriching').replace('{count}', String(refs.length)));
          try {
            const enriched = await onEnrichRefs(needLookup);
            const byRaw = new Map(enriched.map((r) => [r.raw ?? r.title ?? '', r]));
            toAdd = refs.map((r) => byRaw.get(r.raw ?? r.title ?? '') ?? r);
          } catch (e: unknown) {
            // Non-fatal: still add originals.
          }
        }
      }
      for (const r of toAdd) onAddRef(r);
      const withDoi = toAdd.filter((r) => r.doi || r.pmid).length;
      setImportMsg(
        format === 'plaintext'
          ? t('rp_import_success_plain').replace('{total}', String(toAdd.length)).replace('{found}', String(withDoi))
          : t('rp_import_success').replace('{total}', String(toAdd.length)).replace('{format}', FORMAT_LABELS[format]),
      );
      setImportText('');
      setDetectedFormat(null);
      setTimeout(() => setImportMsg(null), 8000);
    } finally {
      setImportBusy(false);
    }
  }

  async function importFromText(text: string): Promise<void> {
    if (!text || text.trim().length < 10) return;
    try {
      const { format, refs } = importByAutoDetect(text);
      await commitImport(refs, format);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportMsg(t('rp_import_error').replace('{msg}', msg));
    }
  }

  // EndNote .ens is a STYLE, not references — detect it and open the Style
  // Editor pre-filled instead of importing refs. Returns true if consumed.
  async function tryImportEnsStyle(file: File): Promise<boolean> {
    if (!/\.ens$/i.test(file.name)) return false;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeEns(buf)) return false;
      const parsed = parseEns(buf);
      window.dispatchEvent(new CustomEvent('enr-open-style-editor', { detail: parsed }));
      setImportMsg(t('rp_ens_loaded').replace('{name}', parsed.name));
      setTimeout(() => setImportMsg(null), 6000);
      return true;
    } catch {
      setImportMsg(t('rp_ens_error'));
      return true; // consumed (it was a .ens) even though it failed
    }
  }

  async function importFromFile(file: File): Promise<void> {
    if (await tryImportEnsStyle(file)) return;
    try {
      const text = await file.text();
      const { format, refs } = importByExtension(file.name, text);
      await commitImport(refs, format);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportMsg(t('rp_import_file_error').replace('{msg}', msg));
    }
  }

  function onTextChange(v: string): void {
    setImportText(v);
    if (v.trim().length > 20) {
      const { format } = importByAutoDetect(v);
      setDetectedFormat(format);
    } else {
      setDetectedFormat(null);
    }
  }

  async function doDoi(): Promise<void> {
    if (!doi.trim()) return;
    setDoiError(null);
    setDoiPreview(null);
    setBusy(true);
    try {
      if (onLookupDoi) {
        const ref = await onLookupDoi(doi.trim());
        if (ref) {
          setDoiPreview(ref);
        } else {
          setDoiError(t('rp_doi_not_found'));
        }
      } else {
        await onAddByDoi(doi.trim());
        setDoi('');
      }
    } catch (err) {
      setDoiError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmDoiAdd(): void {
    if (!doiPreview) return;
    onAddRef(doiPreview);
    setDoiPreview(null);
    setDoi('');
  }

  function cancelDoiPreview(): void {
    setDoiPreview(null);
    setDoiError(null);
  }

  async function doSearch(): Promise<void> {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const fy = fromYear.trim() ? parseInt(fromYear, 10) : undefined;
      const ty = toYear.trim() ? parseInt(toYear, 10) : undefined;
      const r = await onSearch(q.trim(), { fromYear: fy, toYear: ty });
      setResults(r);
    } finally {
      setBusy(false);
    }
  }

  async function handleDroppedData(dt: DataTransfer | null): Promise<void> {
    const files = Array.from(dt?.files ?? []);
    if (files.length === 0) {
      const text = dt?.getData('text/plain');
      if (text && text.trim().length >= 10) {
        setImportText(text);
        await importFromText(text);
      }
      return;
    }
    for (const f of files) {
      await importFromFile(f);
    }
  }

  return (
    <div
      className={`space-y-4 relative rounded-lg transition ${dragActive ? 'ring-2 ring-teal' : ''}`}
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dragActive) setDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setDragActive(false);
        await handleDroppedData(e.dataTransfer);
      }}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-dashed border-teal bg-teal-bg/70 flex items-center justify-center">
          <span className="text-sm font-semibold text-teal">⬇ {t('rp_import_drop_label')}</span>
        </div>
      )}
      <div>
        <label className="tool-label block mb-1">{t('rp_doi_label')}</label>
        <div className="flex gap-2">
          <input
            value={doi}
            onChange={(e) => { setDoi(e.target.value); setDoiError(null); }}
            placeholder={t('rp_doi_placeholder')}
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && !doiPreview && doDoi()}
            disabled={!!doiPreview}
          />
          {!doiPreview ? (
            <button onClick={doDoi} disabled={busy || !doi.trim()} className="btn-primary text-xs px-3 py-1.5">
              {busy ? t('rp_doi_searching') : t('rp_doi_search')}
            </button>
          ) : (
            <button onClick={cancelDoiPreview} className="text-xs text-muted hover:text-red px-2 py-1.5">
              ✕
            </button>
          )}
        </div>
        {doiError && (
          <p className="text-xs text-red-600 mt-1">{doiError}</p>
        )}
        {doiPreview && (
          <div className="mt-2 border border-teal/40 bg-teal-bg/30 rounded-lg p-3 space-y-1.5">
            <div className="font-medium text-primary text-sm leading-snug">{doiPreview.title || t('rp_no_title')}</div>
            <div className="text-xs text-muted">
              {doiPreview.authors?.[0]?.family || '—'}
              {(doiPreview.authors?.length ?? 0) > 1 ? ' et al.' : ''} · {doiPreview.year ?? '?'} · {doiPreview.containerTitle ?? ''}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {doiPreview.doi && <span className="text-teal">{doiPreview.doi}</span>}
              {doiPreview.pmid && <span className="bg-teal-bg text-teal px-1.5 py-0.5 rounded">PMID {doiPreview.pmid}</span>}
            </div>
            {doiPreview.abstract && (
              <details className="text-xs text-secondary">
                <summary className="cursor-pointer text-muted hover:text-primary">{t('rp_doi_abstract')}</summary>
                <p className="mt-1 leading-relaxed">{doiPreview.abstract}</p>
              </details>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={cancelDoiPreview} className="text-xs text-muted hover:text-primary px-2 py-1">
                {t('rp_doi_cancel')}
              </button>
              <button onClick={confirmDoiAdd} className="btn-primary text-xs px-3 py-1">
                {t('rp_doi_add_to_lib')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="tool-label block mb-1">{t('rp_search_label')}</label>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('rp_search_placeholder')}
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <button onClick={doSearch} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">
            {busy ? t('rp_search_busy') : t('rp_search_btn')}
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-muted">{t('rp_search_year')}</span>
          <input
            value={fromYear}
            onChange={(e) => setFromYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="2020"
            maxLength={4}
            inputMode="numeric"
            className="w-20 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <span className="text-xs text-muted">—</span>
          <input
            value={toYear}
            onChange={(e) => setToYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="2025"
            maxLength={4}
            inputMode="numeric"
            className="w-20 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          {(fromYear || toYear) && (
            <button
              onClick={() => {
                setFromYear('');
                setToYear('');
              }}
              className="text-xs text-muted hover:text-red ml-auto"
              title={t('rp_search_clear_year')}
            >
              {t('rp_search_clear_year')}
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5 max-h-[400px] overflow-auto">
          <div className="text-xs text-muted px-1">{results.length} {t('rp_search_results')} — {t('rp_search_add_hint')}</div>
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li
                key={r.id}
                className="border border-border rounded-lg p-2 text-xs hover:bg-slate-50"
              >
                <div className="font-medium text-primary text-sm leading-snug">{r.title}</div>
                <div className="text-muted mt-0.5">
                  {r.authors[0]?.family || '—'}
                  {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  {r.doi && <span className="text-teal text-xs">{r.doi}</span>}
                  {r.pmid && <span className="bg-teal-bg text-teal px-1.5 py-0.5 rounded text-xs">PMID {r.pmid}</span>}
                  {r.source && (
                    <span className="bg-slate-100 text-muted px-1.5 py-0.5 rounded text-xs">{r.source}</span>
                  )}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => {
                      onAddRef(r);
                      setResults(results.filter((x) => x.id !== r.id));
                    }}
                    className="btn-primary text-xs px-3 py-1"
                    title={t('rp_doi_add_to_lib')}
                  >
                    {t('rp_doi_add_to_lib')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ManualAddSection onAddRef={onAddRef} t={t} />

      <div className="pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-1">
          <label className="tool-label">{t('rp_import_label')}</label>
          <button
            onClick={() => importFileRef.current?.click()}
            className="text-xs text-teal hover:underline"
          >
            {t('rp_import_file')}
          </button>
          <input
            ref={importFileRef}
            type="file"
            multiple
            accept=".ris,.enw,.nbib,.xml,.enx,.bib,.bibtex,.json,.csv,.tsv,.cff,.yaml,.yml,.ens,.txt,application/xml,application/json,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              for (const f of files) {
                await importFromFile(f);
              }
            }}
          />
        </div>
        <p className="text-xs text-muted mb-1.5">
          {t('rp_import_support')} {t('rp_import_drop_hint')}
        </p>
        <textarea
          value={importText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t('rp_import_placeholder')}
          className="w-full min-h-[120px] font-mono text-xs border border-border rounded-lg p-2 outline-none focus:border-teal"
        />
        {detectedFormat && detectedFormat !== 'unknown' && (
          <p className="text-xs text-teal mt-1">{t('rp_import_detected')} {FORMAT_LABELS[detectedFormat]}</p>
        )}
        {detectedFormat === 'unknown' && importText.trim().length > 20 && (
          <p className="text-xs text-red mt-1">{t('rp_import_unknown')}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {importMsg && <span className="text-xs text-teal flex-1">{importMsg}</span>}
          <button
            onClick={() => void importFromText(importText)}
            disabled={
              importBusy || importText.trim().length < 10 || detectedFormat === 'unknown'
            }
            className="btn-primary text-xs px-3 py-1.5 ml-auto disabled:opacity-50"
          >
            {importBusy ? t('rp_import_busy') : t('rp_import_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualAddSection({
  onAddRef,
  t,
}: {
  onAddRef: (ref: Ref) => void;
  t: (k: string) => string;
}): JSX.Element {
  const [mType, setMType] = useState<RefType>('journal-article');
  const [mTitle, setMTitle] = useState('');
  const [mAuthors, setMAuthors] = useState('');
  const [mContainer, setMContainer] = useState('');
  const [mYear, setMYear] = useState('');
  const [mVolume, setMVolume] = useState('');
  const [mIssue, setMIssue] = useState('');
  const [mPages, setMPages] = useState('');
  const [mDoi, setMDoi] = useState('');
  const [mPmid, setMPmid] = useState('');

  function parseAuthors(text: string): Ref['authors'] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const parts = entry.split(/\s+/);
        if (parts.length >= 2) {
          const family = parts[parts.length - 1];
          const given = parts.slice(0, -1).join(' ');
          return { family, given };
        }
        return { literal: entry };
      });
  }

  function handleAdd(): void {
    const ref: Ref = {
      id: newId('ref'),
      type: mType,
      title: mTitle.trim() || undefined,
      authors: parseAuthors(mAuthors),
      containerTitle: mContainer.trim() || undefined,
      year: mYear.trim() ? parseInt(mYear, 10) : undefined,
      volume: mVolume.trim() || undefined,
      issue: mIssue.trim() || undefined,
      pages: mPages.trim() || undefined,
      doi: mDoi.trim() || undefined,
      pmid: mPmid.trim() || undefined,
    };
    onAddRef(ref);
    setMType('journal-article');
    setMTitle('');
    setMAuthors('');
    setMContainer('');
    setMYear('');
    setMVolume('');
    setMIssue('');
    setMPages('');
    setMDoi('');
    setMPmid('');
  }

  return (
    <details className="pt-3 border-t border-border group">
      <summary className="tool-label cursor-pointer select-none list-none flex items-center gap-1">
        <span className="text-muted group-open:rotate-90 transition-transform inline-block">▶</span>
        {t('rp_manual_title')}
      </summary>
      <div className="mt-2 space-y-2">
        <Field label={t('rp_manual_type')}>
          <select
            value={mType}
            onChange={(e) => setMType(e.target.value as RefType)}
            className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
          >
            <option value="journal-article">{t('rp_type_journal')}</option>
            <option value="book">{t('rp_type_book')}</option>
            <option value="book-chapter">{t('rp_type_chapter')}</option>
            <option value="conference-paper">{t('rp_type_conference')}</option>
            <option value="thesis">{t('rp_type_thesis')}</option>
            <option value="webpage">{t('rp_type_webpage')}</option>
            <option value="report">{t('rp_type_report')}</option>
            <option value="other">{t('rp_type_other')}</option>
          </select>
        </Field>
        <Field label={t('rp_edit_title')}>
          <input
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
            className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
          />
        </Field>
        <Field label={t('rp_edit_authors')} hint="Family Given, Family Given">
          <input
            value={mAuthors}
            onChange={(e) => setMAuthors(e.target.value)}
            className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
          />
        </Field>
        <Field label={t('rp_edit_journal')}>
          <input
            value={mContainer}
            onChange={(e) => setMContainer(e.target.value)}
            className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
          />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          <Field label={t('rp_edit_year')}>
            <input
              value={mYear}
              onChange={(e) => setMYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              inputMode="numeric"
              className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
            />
          </Field>
          <Field label={t('rp_edit_volume')}>
            <input
              value={mVolume}
              onChange={(e) => setMVolume(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
            />
          </Field>
          <Field label={t('rp_edit_issue')}>
            <input
              value={mIssue}
              onChange={(e) => setMIssue(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
            />
          </Field>
          <Field label={t('rp_edit_pages')}>
            <input
              value={mPages}
              onChange={(e) => setMPages(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('rp_edit_doi')}>
            <input
              value={mDoi}
              onChange={(e) => setMDoi(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-teal"
            />
          </Field>
          <Field label={t('rp_edit_pmid')}>
            <input
              value={mPmid}
              onChange={(e) => setMPmid(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-teal"
            />
          </Field>
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={handleAdd}
            disabled={!mTitle.trim()}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {t('rp_manual_add')}
          </button>
        </div>
      </div>
    </details>
  );
}

function HistoryPanel({
  history,
  onUndo,
  onClear,
  t,
}: {
  history: HistoryEntry[];
  onUndo?: (id: string) => void;
  onClear?: () => void;
  t: (k: string) => string;
}): JSX.Element {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-8 leading-relaxed">
        {t('rp_history_empty')}
      </p>
    );
  }
  const ICONS: Record<string, string> = {
    'insert-citation': '➕',
    'delete-citation': '✂️',
    'add-ref': '📚',
    'delete-ref': '🗑️',
    'bulk-delete-ref': '🧹',
    'update-ref': '✏️',
    'edit-ref': '✏️',
  };
  return (
    <div className="space-y-2">
      {onClear && (
        <div className="flex justify-between items-center px-1 pb-1 border-b border-border">
          <span className="text-xs text-muted">{t('rp_history_actions').replace('{count}', String(history.length))}</span>
          <button
            onClick={onClear}
            className="text-xs text-muted hover:text-red"
            title={t('rp_history_clear')}
          >
            {t('rp_history_clear')}
          </button>
        </div>
      )}
      {history.map((h) => (
        <div
          key={h.id}
          className={`border border-border rounded-lg p-2 text-xs ${
            h.undone ? 'bg-slate-50 opacity-60' : 'bg-white'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-base shrink-0">{ICONS[h.type] ?? '•'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-primary leading-snug">
                {h.description}
              </div>
              <div className="text-muted mt-0.5 flex items-center gap-2">
                <span>{formatHistoryTime(h.time)}</span>
                <span className="text-faint">·</span>
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                  {HISTORY_LABELS[h.type]}
                </span>
                {h.undone && (
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px]">
                    {t('rp_history_undone')}
                  </span>
                )}
              </div>
            </div>
            {!h.undone && onUndo && (
              <button
                onClick={() => onUndo(h.id)}
                className="btn-secondary text-[11px] px-2 py-0.5 shrink-0"
                title={t('rp_history_undo')}
              >
                ↶ {t('rp_history_undo')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
