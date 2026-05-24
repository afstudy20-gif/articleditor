'use client';

import { useRef, useState } from 'react';
import type { Ref } from '@/store/types';
import { importByAutoDetect, importByExtension, FORMAT_LABELS, type ImportFormat } from '@/lib/refs/import-auto';

type Props = {
  refs: Ref[];
  refOrder: Map<string, number>;
  onAddByDoi: (doi: string) => Promise<void>;
  onSearch: (query: string) => Promise<Ref[]>;
  onAddRef: (ref: Ref) => void;
  onInsertCitation: (refId: string) => void;
  onInsertCitationMulti?: (refIds: string[]) => void;
  onUpdateRef: (id: string, patch: Partial<Ref>) => void;
  onDeleteRef: (id: string) => void;
  onLookupRef?: (id: string) => Promise<void>;
  onLookupAll?: () => Promise<void>;
  lookupBusyId?: string | null;
  lookupAllBusy?: boolean;
  selectedId?: string | null;
  onSelectRef?: (id: string) => void;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  onBulkDelete?: (ids: string[]) => void;
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
  onLookupAll,
  lookupBusyId,
  lookupAllBusy,
  selectedId,
  onSelectRef,
  selectedIds: extSelectedIds,
  onSelectedIdsChange,
  onBulkDelete,
}: Props) {
  const [tab, setTab] = useState<'list' | 'add'>('list');
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
          className={`flex-1 px-3 py-2 text-sm font-semibold ${
            tab === 'list' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('list')}
        >
          Atıf kütüphanesi ({refs.length})
        </button>
        <button
          className={`flex-1 px-3 py-2 text-sm font-semibold ${
            tab === 'add' ? 'bg-teal-bg text-teal border-b-2 border-teal' : 'text-muted'
          }`}
          onClick={() => setTab('add')}
        >
          + Ekle
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
            lookupBusyId={lookupBusyId}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            highlightedId={selectedId}
            onHighlight={onSelectRef}
          />
        ) : (
          <AddPanel onAddByDoi={onAddByDoi} onSearch={onSearch} onAddRef={onAddRef} />
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
  lookupBusyId?: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  highlightedId?: string | null;
  onHighlight?: (id: string) => void;
}): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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
        />
      )}
    </ol>
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
          {onLookup && r.abstract && (
            <button
              onClick={onLookup}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              🔄 Tekrar DOI tara
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
}: {
  onAddByDoi: (doi: string) => Promise<void>;
  onSearch: (q: string) => Promise<Ref[]>;
  onAddRef: (ref: Ref) => void;
}): JSX.Element {
  const [doi, setDoi] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Ref[]>([]);
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<ImportFormat | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  function commitImport(refs: Ref[], format: ImportFormat): void {
    if (refs.length === 0) {
      setImportMsg(`Hiç referans bulunamadı (${FORMAT_LABELS[format]}). Format farklı olabilir.`);
      return;
    }
    for (const r of refs) onAddRef(r);
    setImportMsg(`${refs.length} referans eklendi (${FORMAT_LABELS[format]}).`);
    setImportText('');
    setDetectedFormat(null);
    setTimeout(() => setImportMsg(null), 5000);
  }

  function importFromText(text: string): void {
    if (!text || text.trim().length < 10) return;
    try {
      const { format, refs } = importByAutoDetect(text);
      commitImport(refs, format);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportMsg(`İçe aktarma hatası: ${msg}`);
    }
  }

  async function importFromFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const { format, refs } = importByExtension(file.name, text);
      commitImport(refs, format);
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
      const r = await onSearch(q.trim());
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
            placeholder="Kardiyak biyomarkerler 2023"
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <button onClick={doSearch} disabled={busy} className="btn-secondary text-xs px-3 py-1.5">
            Ara
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <ul className="space-y-1.5 max-h-[300px] overflow-auto">
          {results.map((r) => (
            <li
              key={r.id}
              className="border border-border rounded-lg p-2 text-xs hover:bg-slate-50 cursor-pointer"
              onClick={() => {
                onAddRef(r);
                setResults(results.filter((x) => x.id !== r.id));
              }}
            >
              <div className="font-medium text-primary text-sm leading-snug">{r.title}</div>
              <div className="text-muted mt-0.5">
                {r.authors[0]?.family || '—'}
                {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
              </div>
              {r.doi && <div className="text-teal mt-0.5">{r.doi}</div>}
            </li>
          ))}
        </ul>
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
          Destek: RIS, EndNote .enw, EndNote XML, BibTeX. Format otomatik algılanır.
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
            onClick={() => importFromText(importText)}
            disabled={importText.trim().length < 10 || detectedFormat === 'unknown'}
            className="btn-primary text-xs px-3 py-1.5 ml-auto"
          >
            İçe aktar
          </button>
        </div>
      </div>
    </div>
  );
}
