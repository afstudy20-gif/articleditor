'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ref } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';
import { authorList, journalLine } from '@/lib/refs/display';

export type CiteOptsValue = {
  locator: string;
  prefix: string;
  suffix: string;
  suppressAuthor: boolean;
};

type Props = {
  pos: number;
  refIds: string[];
  allRefs: Ref[];
  /** Current locator/prefix/suffix attrs of the node being edited. */
  initialOpts?: CiteOptsValue;
  /** True for author-year styles (APA): shows the suppress-author toggle. */
  authorYearStyle?: boolean;
  onClose: () => void;
  onReplace: (pos: number, newRefIds: string[]) => void;
  onDelete: (pos: number) => void;
  onUpdateOpts?: (pos: number, opts: CiteOptsValue) => void;
};

export function CitationPopover({
  pos,
  refIds,
  allRefs,
  initialOpts,
  authorYearStyle,
  onClose,
  onReplace,
  onDelete,
  onUpdateOpts,
}: Props): JSX.Element {
  const { t, lang } = useLang();
  const tr = lang === 'tr';
  const [mode, setMode] = useState<'view' | 'replace' | 'add' | 'options'>('view');
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>(refIds);
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState<CiteOptsValue>(
    initialOpts ?? { locator: '', prefix: '', suffix: '', suppressAuthor: false },
  );
  const refsById = useMemo(() => new Map(allRefs.map((r) => [r.id, r])), [allRefs]);
  const cited = refIds.map((id) => refsById.get(id)).filter((r): r is Ref => Boolean(r));
  const refsWithLibraryNo = useMemo(
    () => allRefs.map((ref, index) => ({ ref, libraryNo: index + 1 })),
    [allRefs],
  );
  const selectedIdSet = useMemo(() => new Set(selectedRefIds), [selectedRefIds]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return refsWithLibraryNo.slice(0, 40);
    return refsWithLibraryNo
      .filter(({ ref: r, libraryNo }) => {
        const hay =
          String(libraryNo) +
          ' ' +
          (r.title ?? '') +
          ' ' +
          (r.authors[0]?.family ?? '') +
          ' ' +
          (r.year ?? '') +
          ' ' +
          (r.containerTitle ?? '') +
          ' ' +
          (r.doi ?? '');
        return hay.toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [query, refsWithLibraryNo]);

  function beginReplace(targetId?: string): void {
    setReplaceTargetId(targetId ?? null);
    setSelectedRefIds(targetId ? refIds.filter((id) => id !== targetId) : refIds);
    setQuery('');
    setMode('replace');
  }

  function beginAdd(): void {
    setReplaceTargetId(null);
    setSelectedRefIds(refIds);
    setQuery('');
    setMode('add');
  }

  function toggleSelectedRef(id: string): void {
    setSelectedRefIds((current) => (
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
    ));
  }

  function applySelectedRefs(): void {
    const unique = selectedRefIds.filter((id, index, arr) => arr.indexOf(id) === index);
    onReplace(pos, unique);
    setMode('view');
    setReplaceTargetId(null);
  }

  function removeRef(id: string): void {
    const remaining = refIds.filter((x) => x !== id);
    onReplace(pos, remaining);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-border rounded-xl shadow-xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-primary text-sm">{t('cite_edit_title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">
            ×
          </button>
        </div>

        {mode === 'view' && (
          <>
            <div className="p-4 space-y-2 overflow-auto flex-1">
              <div className="tool-label">{t('cite_current_refs').replace('{count}', String(cited.length))}</div>
              {cited.length === 0 && <p className="text-sm text-faint italic">{tr ? 'Bu atıf kütüphane ile eşleşmiyor.' : 'This citation does not match the library.'}</p>}
              <ul className="space-y-2">
                {cited.map((r) => (
                  <li key={r.id} className="border border-border rounded-lg p-2.5 text-sm">
                    <div className="font-semibold text-primary leading-snug">
                      {r.title || (tr ? '(Başlıksız)' : '(Untitled)')}
                    </div>
                    <div className="mt-1 grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span className="font-semibold text-secondary">{tr ? 'Yazar' : 'Authors'}</span>
                      <span>{authorList(r)}</span>
                      <span className="font-semibold text-secondary">{tr ? 'Yıl' : 'Year'}</span>
                      <span>{r.year ?? '—'}</span>
                      <span className="font-semibold text-secondary">{tr ? 'Dergi' : 'Journal'}</span>
                      <span>{journalLine(r)}</span>
                      {r.doi && (
                        <>
                          <span className="font-semibold text-secondary">DOI</span>
                          <a
                            href={`https://doi.org/${r.doi}`}
                            target="_blank"
                            rel="noopener"
                            className="text-teal hover:underline break-all"
                          >
                            {r.doi}
                          </a>
                        </>
                      )}
                      {r.pmid && (
                        <>
                          <span className="font-semibold text-secondary">PMID</span>
                          <span>{r.pmid}</span>
                        </>
                      )}
                      {r.url && !r.doi && (
                        <>
                          <span className="font-semibold text-secondary">URL</span>
                          <a href={r.url} target="_blank" rel="noopener" className="text-teal hover:underline break-all">
                            {r.url}
                          </a>
                        </>
                      )}
                      {r.raw && (
                        <>
                          <span className="font-semibold text-secondary">{tr ? 'Ham' : 'Raw'}</span>
                          <span className="break-words">{r.raw}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs mt-1.5 flex items-center gap-2">
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={() => beginReplace(r.id)}
                          className="text-teal hover:underline font-semibold"
                        >
                          {t('cite_replace')}
                        </button>
                        {refIds.length > 1 && (
                          <>
                            <span className="text-muted/30">|</span>
                            <button
                              onClick={() => removeRef(r.id)}
                              className="text-red hover:underline"
                            >
                              {t('cite_remove_ref')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-4 py-3 border-t border-border flex gap-2 flex-wrap">
              <button onClick={() => beginReplace()} className="btn-secondary text-xs">
                {t('cite_replace')}
              </button>
              <button onClick={() => beginAdd()} className="btn-secondary text-xs">
                + Ref ekle
              </button>
              {onUpdateOpts && (
                <button onClick={() => setMode('options')} className="btn-secondary text-xs">
                  ⚙ {t('cite_options')}
                  {(opts.locator || opts.prefix || opts.suffix || opts.suppressAuthor) && (
                    <span className="ml-1 text-teal">•</span>
                  )}
                </button>
              )}
              <button onClick={() => onDelete(pos)} className="btn-danger text-xs ml-auto">
                {t('cite_delete')}
              </button>
            </div>
          </>
        )}

        {mode === 'options' && (
          <>
            <div className="p-4 space-y-3 overflow-auto flex-1">
              <div>
                <label className="tool-label block mb-1">{t('cite_locator')}</label>
                <input
                  autoFocus
                  value={opts.locator}
                  onChange={(e) => setOpts({ ...opts, locator: e.target.value })}
                  placeholder={t('cite_locator_ph')}
                  className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
                />
              </div>
              <div>
                <label className="tool-label block mb-1">{t('cite_prefix')}</label>
                <input
                  value={opts.prefix}
                  onChange={(e) => setOpts({ ...opts, prefix: e.target.value })}
                  placeholder={t('cite_prefix_ph')}
                  className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
                />
              </div>
              <div>
                <label className="tool-label block mb-1">{t('cite_suffix')}</label>
                <input
                  value={opts.suffix}
                  onChange={(e) => setOpts({ ...opts, suffix: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
                />
              </div>
              {authorYearStyle && (
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opts.suppressAuthor}
                    onChange={(e) => setOpts({ ...opts, suppressAuthor: e.target.checked })}
                  />
                  {t('cite_suppress_author')}
                </label>
              )}
              <p className="text-[11px] text-muted">{t('cite_options_hint')}</p>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <button
                onClick={() => setMode('view')}
                className="text-xs text-muted hover:text-primary"
              >
                ← Geri
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const cleared = { locator: '', prefix: '', suffix: '', suppressAuthor: false };
                    setOpts(cleared);
                    onUpdateOpts?.(pos, cleared);
                  }}
                  className="btn-secondary text-xs"
                >
                  {t('cite_options_clear')}
                </button>
                <button
                  onClick={() => onUpdateOpts?.(pos, opts)}
                  className="btn-primary text-xs"
                >
                  {t('cite_options_apply')}
                </button>
              </div>
            </div>
          </>
        )}

        {(mode === 'replace' || mode === 'add') && (
          <>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs text-muted mb-2">
                {mode === 'replace'
                  ? (replaceTargetId
                    ? (tr ? "Bu ref yerine kullanılacak ref'leri seç:" : 'Select references to use in place of this ref:')
                    : t('cite_replace_select_refs'))
                  : t('cite_add_select_refs')}
              </p>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr ? 'Başlık, yazar, yıl, DOI ara…' : 'Search by title, author, year, DOI…'}
                className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
              />
            </div>
            <ul className="flex-1 overflow-auto p-2 space-y-1">
              {filtered.length === 0 && (
                <li className="text-sm text-muted text-center py-6">{tr ? 'Eşleşen ref yok.' : 'No matching references.'}</li>
              )}
              {filtered.map(({ ref: r, libraryNo }) => (
                <li
                  key={r.id}
                  onClick={() => toggleSelectedRef(r.id)}
                  className={`border rounded-lg p-2 text-xs hover:bg-teal-bg hover:border-teal cursor-pointer transition flex gap-2 ${
                    selectedIdSet.has(r.id) ? 'border-teal bg-teal-bg' : 'border-border'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIdSet.has(r.id)}
                    onChange={() => toggleSelectedRef(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 h-4 w-4 shrink-0 accent-teal"
                    aria-label={tr ? `${libraryNo} numaralı ref'i seç` : `Select reference ${libraryNo}`}
                  />
                  <span className="shrink-0 w-8 h-8 rounded-md bg-slate-100 text-muted font-bold flex items-center justify-center">
                    #{libraryNo}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-primary leading-snug line-clamp-2">
                      {r.title || (tr ? '(Başlıksız)' : '(Untitled)')}
                    </div>
                    <div className="text-muted mt-0.5">
                      {r.authors[0]?.family || '—'}
                      {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-border flex items-center justify-between gap-3">
              <button onClick={() => { setMode('view'); setReplaceTargetId(null); }} className="text-xs text-muted hover:text-primary">
                ← Geri
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  {t('cite_selected_count').replace('{count}', String(selectedRefIds.length))}
                </span>
                <button
                  onClick={applySelectedRefs}
                  disabled={selectedRefIds.length === 0}
                  className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('cite_apply_refs')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
