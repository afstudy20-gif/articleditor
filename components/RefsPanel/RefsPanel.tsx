'use client';

import { useRef, useState } from 'react';
import type { Ref } from '@/store/types';
import { importByAutoDetect, importByExtension, FORMAT_LABELS, type ImportFormat } from '@/lib/refs/import-auto';
import {
  HISTORY_LABELS,
  formatHistoryTime,
  type HistoryEntry,
} from '@/lib/history';

type Props = {
  refs: Ref[];
  refOrder: Map<string, number>;
  onAddByDoi: (doi: string) => Promise<void>;
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
    const msg = `${ids.length} referans silinecek. Devam edilsin mi? Makale içindeki atıflar boş kalır.`;
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
          Kütüphane ({refs.length})
        </button>
        <button
          className={`flex-1 px-2 py-2 text-xs font-semibold ${
            tab === 'add' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('add')}
        >
          + Ekle
        </button>
        <button
          className={`flex-1 px-2 py-2 text-xs font-semibold ${
            tab === 'history' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('history')}
        >
          🕒 Geçmiş{history && history.length > 0 ? ` (${history.filter((h) => !h.undone).length})` : ''}
        </button>
      </div>
      {tab === 'list' && onLookupAll && refs.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {refs.filter((r) => r.doi).length}/{refs.length} ref DOI'li · {refs.filter((r) => r.abstract).length}{' '}
            özetli
          </span>
          <button
            onClick={onLookupAll}
            disabled={lookupAllBusy}
            className="btn-secondary text-xs px-2 py-1"
          >
            {lookupAllBusy ? 'Taranıyor…' : 'Tümünü DOI tara'}
          </button>
        </div>
      )}

      {tab === 'list' && selectedIds.size > 0 && (
        <div className="px-3 py-2 border-b border-border bg-teal-bg flex items-center justify-between gap-2">
          <span className="text-xs text-teal font-semibold">
            {selectedIds.size} ref seçili — toolbar &quot;+ Atıf ekle&quot; ile yerleştir
          </span>
          <div className="flex gap-2">
            <button onClick={clearSelection} className="text-xs text-muted hover:text-primary">
              İptal
            </button>
            {onBulkDelete && (
              <button
                onClick={bulkDelete}
                className="btn-danger text-xs px-2 py-1"
                title="Seçili referansları kütüphaneden sil"
              >
                🗑️ Sil ({selectedIds.size})
              </button>
            )}
          </div>
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
          />
        ) : tab === 'add' ? (
          <AddPanel onAddByDoi={onAddByDoi} onSearch={onSearch} onAddRef={onAddRef} onEnrichRefs={onEnrichRefs} />
        ) : (
          <HistoryPanel
            history={history ?? []}
            onUndo={onUndoHistory}
            onClear={onClearHistory}
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
        Henüz referans yok. <strong>+ Ekle</strong> sekmesinden DOI veya başlık ile referans ekle.
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
                  title="Birlikte yerleştirmek için seç"
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
                  {r.title || r.raw?.slice(0, 60) || '(Başlıksız)'}
                </div>
                <div className="text-xs text-muted truncate">
                  {r.authors[0]?.family || r.authors[0]?.literal || '—'}
                  {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                </div>
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
                    <span className="bg-slate-100 text-muted px-1.5 py-0.5 rounded">özet</span>
                  )}
                  {r.userNote && (
                    <span className="bg-teal-bg text-teal px-1.5 py-0.5 rounded" title="Manuel notunuz var">
                      📝 not
                    </span>
                  )}
                  <button
                    onClick={() => toggleExpand(r.id)}
                    className="text-muted hover:text-teal ml-auto"
                    title="Detay / özet"
                  >
                    {expandedId === r.id ? '▼ detay' : '▶ detay'}
                  </button>
                  {onLookup && (
                    <button
                      onClick={() => onLookup(r.id)}
                      disabled={lookupBusyId === r.id}
                      className="text-teal hover:underline"
                    >
                      {lookupBusyId === r.id ? 'Aranıyor…' : 'DOI tara'}
                    </button>
                  )}
                  <button onClick={() => onInsert(r.id)} className="text-teal font-semibold hover:underline">
                    Yerleştir →
                  </button>
                  <button onClick={() => onDelete(r.id)} className="text-red hover:underline">
                    Sil
                  </button>
                </div>

                {expanded && (
                  <div className="mt-2 pt-2 border-t border-border space-y-2 text-xs">
                    {r.authors.length > 0 && (
                      <div>
                        <div className="tool-label">Yazarlar</div>
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
                            <span className="tool-label inline">Cilt</span>{' '}
                            <span className="text-primary font-semibold">{r.volume}</span>
                          </span>
                        )}
                        {r.issue && (
                          <span>
                            <span className="tool-label inline">Sayı</span>{' '}
                            <span className="text-primary font-semibold">{r.issue}</span>
                          </span>
                        )}
                        {r.pages && (
                          <span>
                            <span className="tool-label inline">Sayfa</span>{' '}
                            <span className="text-primary font-semibold">{r.pages}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {r.abstract ? (
                      <div>
                        <div className="tool-label mb-1">Özet</div>
                        <p className="text-secondary leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-auto">
                          {r.abstract}
                        </p>
                      </div>
                    ) : (
                      <p className="text-faint italic">
                        Özet yok. <strong>DOI tara</strong> ile CrossRef/OpenAlex/PubMed taransın.
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
}: {
  reference: Ref;
  onClose: () => void;
  onSave: (patch: Partial<Ref>) => void;
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
          <h3 className="font-semibold text-primary">Referansı düzelt</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-3 space-y-3 text-sm">
          <Field label="Başlık">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
            />
          </Field>
          <Field
            label="Yazarlar"
            hint='Format: "Family, Given" — birden fazla için ; ile ayır. Örn: Smith, John A; Doe, Jane B'
          >
            <textarea
              value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)}
              rows={2}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal font-mono text-xs"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Yıl">
              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                maxLength={4}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label="Tür">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              >
                <option value="journal-article">Makale</option>
                <option value="book">Kitap</option>
                <option value="book-chapter">Kitap bölümü</option>
                <option value="conference-paper">Konferans</option>
                <option value="thesis">Tez</option>
                <option value="webpage">Web sayfası</option>
                <option value="report">Rapor</option>
                <option value="other">Diğer</option>
              </select>
            </Field>
            <Field label="DOI">
              <input
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal font-mono text-xs"
              />
            </Field>
          </div>
          <Field label="Dergi / kaynak">
            <input
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
            />
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Cilt">
              <input
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label="Sayı">
              <input
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label="Sayfa">
              <input
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
            <Field label="PMID">
              <input
                value={pmid}
                onChange={(e) => setPmid(e.target.value)}
                className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
              />
            </Field>
          </div>
          <Field label="URL">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal font-mono text-xs"
            />
          </Field>
          <Field label="Özet">
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
            İptal
          </button>
          <button onClick={handleSave} className="btn-primary text-sm px-4 py-1.5">
            Kaydet
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
            {r.title || '(Başlıksız)'}
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
              <div className="tool-label mb-1">Özet</div>
              <p className="whitespace-pre-wrap">{r.abstract}</p>
            </div>
          )}
          {!r.abstract && onLookup && (
            <button
              onClick={onLookup}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal border-b border-border"
            >
              🔍 Özet/DOI tara
            </button>
          )}

          {r.aspects && (
            <div className="px-3 py-2 border-b border-border text-xs">
              <div className="tool-label mb-1">AI aspect çıkarımı</div>
              {(['goals', 'methods', 'datasets', 'eval_protocols', 'limitations', 'contributions', 'findings'] as const).map((k) => {
                const items = r.aspects?.[k];
                if (!items || items.length === 0) return null;
                const label: Record<string, string> = {
                  goals: 'Hedefler',
                  methods: 'Yöntem',
                  datasets: 'Veri',
                  eval_protocols: 'Değerlendirme',
                  limitations: 'Kısıtlılık',
                  contributions: 'Katkı',
                  findings: 'Bulgu',
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
            <div className="flex items-center justify-between mb-1">
              <span className="tool-label">Manuel not</span>
              {!noteEdit && (
                <button
                  onClick={() => setNoteEdit(true)}
                  className="text-xs text-teal hover:underline"
                >
                  {r.userNote ? 'Düzenle' : '+ Not ekle'}
                </button>
              )}
            </div>
            {noteEdit ? (
              <>
                <textarea
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="Bu makale hakkında notların…"
                  className="w-full min-h-[100px] text-xs border border-border rounded p-2 outline-none focus:border-teal resize-y"
                  autoFocus
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => {
                      onSaveNote?.(noteValue);
                      setNoteEdit(false);
                    }}
                    className="btn-primary text-xs px-2.5 py-1"
                  >
                    Kaydet
                  </button>
                  <button
                    onClick={() => {
                      setNoteValue(r.userNote ?? '');
                      setNoteEdit(false);
                    }}
                    className="text-xs text-muted hover:text-primary"
                  >
                    İptal
                  </button>
                </div>
              </>
            ) : r.userNote ? (
              <p className="text-xs text-secondary whitespace-pre-wrap leading-relaxed bg-slate-50 p-2 rounded">
                {r.userNote}
              </p>
            ) : (
              <p className="text-xs text-faint italic">Henüz not yok.</p>
            )}
          </div>

          {onShowAbstract && (
            <button
              onClick={onShowAbstract}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              📄 Detayı sağda göster
            </button>
          )}

          {fullTextUrl && (
            <a
              href={fullTextUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔗 Full text aç ({r.doi ? 'DOI' : 'URL'}) ↗
            </a>
          )}
          {r.doi && (
            <a
              href={`https://sci-hub.ist/${r.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔓 Sci-Hub'da aç ↗
            </a>
          )}
          {pubmedUrl && (
            <a
              href={pubmedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔗 PubMed'de aç ↗
            </a>
          )}
          {r.doi && (
            <a
              href={`https://www.google.com/scholar?q=${encodeURIComponent(r.doi)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🎓 Google Scholar'da aç ↗
            </a>
          )}
        </div>

        <div className="border-t border-border shrink-0 bg-white">
          <button
            onClick={onInsert}
            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal font-semibold"
          >
            ➕ Metne yerleştir
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              ✏️ Düzelt
            </button>
          )}
          {onLookup && r.abstract && (
            <button
              onClick={onLookup}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔄 Tekrar DOI tara
            </button>
          )}
          {onExtractAspects && (
            <button
              onClick={onExtractAspects}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
              title="Özetten yapısal alanları çıkar: hedef, yöntem, veri, kısıtlılık, katkı, bulgu"
            >
              🔬 AI ile aspect çıkar
            </button>
          )}
          <button
            onClick={onDelete}
            className="block w-full text-left px-3 py-1.5 text-xs hover:bg-red-bg hover:text-red text-red"
          >
            🗑️ Sil
          </button>
        </div>
      </div>
    </>
  );
}

function AddPanel({
  onAddByDoi,
  onSearch,
  onAddRef,
  onEnrichRefs,
}: {
  onAddByDoi: (doi: string) => Promise<void>;
  onSearch: (q: string, opts?: { fromYear?: number; toYear?: number }) => Promise<Ref[]>;
  onAddRef: (ref: Ref) => void;
  onEnrichRefs?: (refs: Ref[]) => Promise<Ref[]>;
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
  const importFileRef = useRef<HTMLInputElement>(null);

  async function commitImport(refs: Ref[], format: ImportFormat): Promise<void> {
    if (refs.length === 0) {
      setImportMsg(`Hiç referans bulunamadı (${FORMAT_LABELS[format]}). Format farklı olabilir.`);
      return;
    }
    setImportBusy(true);
    try {
      let toAdd = refs;
      // For plaintext (no DOI/PMID), auto-enrich via CrossRef/PubMed when handler available.
      if (format === 'plaintext' && onEnrichRefs) {
        const needLookup = refs.filter((r) => !r.doi && !r.pmid);
        if (needLookup.length > 0) {
          setImportMsg(`${refs.length} referans algılandı, DOI/PMID için aranıyor…`);
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
          ? `${toAdd.length} referans eklendi (düz metin). ${withDoi}/${toAdd.length} için DOI veya PMID bulundu.`
          : `${toAdd.length} referans eklendi (${FORMAT_LABELS[format]}).`,
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
      setImportMsg(`İçe aktarma hatası: ${msg}`);
    }
  }

  async function importFromFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const { format, refs } = importByExtension(file.name, text);
      await commitImport(refs, format);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportMsg(`Dosya açılamadı: ${msg}`);
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
    setBusy(true);
    try {
      await onAddByDoi(doi.trim());
      setDoi('');
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="space-y-4">
      <div>
        <label className="tool-label block mb-1">DOI veya PMID</label>
        <div className="flex gap-2">
          <input
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            placeholder="10.1056/NEJMoa..."
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && doDoi()}
          />
          <button onClick={doDoi} disabled={busy} className="btn-primary text-xs px-3 py-1.5">
            Ekle
          </button>
        </div>
      </div>

      <div>
        <label className="tool-label block mb-1">Başlık / yazar ile ara</label>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kardiyak biyomarkerler"
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <button onClick={doSearch} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">
            {busy ? 'Aranıyor…' : 'Ara'}
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-muted">Yıl:</span>
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
              title="Yıl filtresini temizle"
            >
              temizle
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5 max-h-[400px] overflow-auto">
          <div className="text-xs text-muted px-1">{results.length} sonuç — &quot;+ Ekle&quot; ile kütüphaneye al</div>
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
                    title="Bu referansı kütüphaneye ekle"
                  >
                    + Kütüphaneye ekle
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-1">
          <label className="tool-label">Dosya / metin içe aktar</label>
          <button
            onClick={() => importFileRef.current?.click()}
            className="text-xs text-teal hover:underline"
          >
            Dosya seç…
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".ris,.enw,.nbib,.xml,.enx,.bib,.bibtex,.txt,application/xml,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await importFromFile(f);
            }}
          />
        </div>
        <p className="text-xs text-muted mb-1.5">
          Destek: RIS, EndNote .enw, EndNote XML, BibTeX, düz metin (Vancouver/APA gibi). Format otomatik algılanır.
          Düz metinde DOI/PMID yoksa CrossRef + PubMed üzerinden aranır.
        </p>
        <textarea
          value={importText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={`EndNote XML, RIS, .enw veya BibTeX metnini yapıştır.\n\nÖrnek RIS:\nTY  - JOUR\nAU  - Smith J\nTI  - Title…\nER  -\n\nÖrnek BibTeX:\n@article{key, author = {Smith, J}, ...}`}
          className="w-full min-h-[120px] font-mono text-xs border border-border rounded-lg p-2 outline-none focus:border-teal"
        />
        {detectedFormat && detectedFormat !== 'unknown' && (
          <p className="text-xs text-teal mt-1">Algılanan format: {FORMAT_LABELS[detectedFormat]}</p>
        )}
        {detectedFormat === 'unknown' && importText.trim().length > 20 && (
          <p className="text-xs text-red mt-1">Format tanınmadı.</p>
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
            {importBusy ? 'İşleniyor…' : 'İçe aktar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({
  history,
  onUndo,
  onClear,
}: {
  history: HistoryEntry[];
  onUndo?: (id: string) => void;
  onClear?: () => void;
}): JSX.Element {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-8 leading-relaxed">
        Henüz işlem yok. Atıf eklediğinde, referans eklediğinde veya sildiğinde burada listelenir ve <strong>Geri al</strong> ile geri alınabilir.
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
          <span className="text-xs text-muted">{history.length} işlem</span>
          <button
            onClick={onClear}
            className="text-xs text-muted hover:text-red"
            title="Geçmişi temizle (geri alınamaz)"
          >
            Listeyi temizle
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
                    geri alındı
                  </span>
                )}
              </div>
            </div>
            {!h.undone && onUndo && (
              <button
                onClick={() => onUndo(h.id)}
                className="btn-secondary text-[11px] px-2 py-0.5 shrink-0"
                title="Bu işlemi geri al"
              >
                ↶ Geri al
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
