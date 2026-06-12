'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ref } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';

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
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState<CiteOptsValue>(
    initialOpts ?? { locator: '', prefix: '', suffix: '', suppressAuthor: false },
  );
  const refsById = useMemo(() => new Map(allRefs.map((r) => [r.id, r])), [allRefs]);
  const cited = refIds.map((id) => refsById.get(id)).filter((r): r is Ref => Boolean(r));

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRefs.slice(0, 40);
    return allRefs
      .filter((r) => {
        const hay =
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
  }, [query, allRefs]);

  function handleSelect(targetRef: Ref): void {
    if (mode === 'replace') {
      if (replaceTargetId) {
        const newRefIds = refIds.map((id) => id === replaceTargetId ? targetRef.id : id);
        onReplace(pos, newRefIds);
      } else {
        onReplace(pos, [targetRef.id]);
      }
    } else if (mode === 'add') {
      onReplace(pos, [...refIds, targetRef.id]);
    }
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
                    <div className="font-semibold text-primary leading-snug line-clamp-2">
                      {r.title || (tr ? '(Başlıksız)' : '(Untitled)')}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {r.authors[0]?.family || '—'}
                      {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                    </div>
                    <div className="text-xs mt-1.5 flex items-center gap-2">
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
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={() => {
                            setReplaceTargetId(r.id);
                            setMode('replace');
                          }}
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
              <button onClick={() => setMode('replace')} className="btn-secondary text-xs">
                {t('cite_replace')}
              </button>
              <button onClick={() => setMode('add')} className="btn-secondary text-xs">
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
                  ? (tr ? "Yerine kullanılacak ref'i seç:" : 'Select the replacement reference:')
                  : (tr ? "Bu atıfa eklenecek ref'i seç:" : 'Select a reference to add to this citation:')}
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
              {filtered.map((r) => (
                <li
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="border border-border rounded-lg p-2 text-xs hover:bg-teal-bg hover:border-teal cursor-pointer transition"
                >
                  <div className="font-medium text-primary leading-snug line-clamp-2">
                    {r.title || (tr ? '(Başlıksız)' : '(Untitled)')}
                  </div>
                  <div className="text-muted mt-0.5">
                    {r.authors[0]?.family || '—'}
                    {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-border flex justify-end">
              <button onClick={() => { setMode('view'); setReplaceTargetId(null); }} className="text-xs text-muted hover:text-primary">
                ← Geri
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
