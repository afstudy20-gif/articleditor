'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ref } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  pos: number;
  refIds: string[];
  allRefs: Ref[];
  onClose: () => void;
  onReplace: (pos: number, newRefIds: string[]) => void;
  onDelete: (pos: number) => void;
};

export function CitationPopover({ pos, refIds, allRefs, onClose, onReplace, onDelete }: Props): JSX.Element {
  const { t } = useLang();
  const [mode, setMode] = useState<'view' | 'replace' | 'add'>('view');
  const [query, setQuery] = useState('');
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
      onReplace(pos, [targetRef.id]);
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
              {cited.length === 0 && <p className="text-sm text-faint italic">Bu citation kütüphane ile eşleşmiyor.</p>}
              <ul className="space-y-2">
                {cited.map((r) => (
                  <li key={r.id} className="border border-border rounded-lg p-2.5 text-sm">
                    <div className="font-semibold text-primary leading-snug line-clamp-2">
                      {r.title || '(Başlıksız)'}
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
                      {refIds.length > 1 && (
                        <button
                          onClick={() => removeRef(r.id)}
                          className="text-red hover:underline ml-auto"
                        >
                          Bu ref'i kaldır
                        </button>
                      )}
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
              <button onClick={() => onDelete(pos)} className="btn-danger text-xs ml-auto">
                {t('cite_delete')}
              </button>
            </div>
          </>
        )}

        {(mode === 'replace' || mode === 'add') && (
          <>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs text-muted mb-2">
                {mode === 'replace' ? "Yerine kullanılacak ref'i seç:" : "Bu atıfa eklenecek ref'i seç:"}
              </p>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Başlık, yazar, yıl, DOI ara…"
                className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
              />
            </div>
            <ul className="flex-1 overflow-auto p-2 space-y-1">
              {filtered.length === 0 && (
                <li className="text-sm text-muted text-center py-6">Eşleşen ref yok.</li>
              )}
              {filtered.map((r) => (
                <li
                  key={r.id}
                  onClick={() => handleSelect(r)}
                  className="border border-border rounded-lg p-2 text-xs hover:bg-teal-bg hover:border-teal cursor-pointer transition"
                >
                  <div className="font-medium text-primary leading-snug line-clamp-2">
                    {r.title || '(Başlıksız)'}
                  </div>
                  <div className="text-muted mt-0.5">
                    {r.authors[0]?.family || '—'}
                    {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-border flex justify-end">
              <button onClick={() => setMode('view')} className="text-xs text-muted hover:text-primary">
                ← Geri
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
