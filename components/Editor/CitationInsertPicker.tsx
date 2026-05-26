'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  allRefs: Ref[];
  refOrder: Map<string, number>;
  onClose: () => void;
  onInsert: (refIds: string[]) => void;
};

export function CitationInsertPicker({ allRefs, refOrder, onClose, onInsert }: Props): JSX.Element {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRefs;
    return allRefs.filter((r) => {
      const hay =
        (r.title ?? '') +
        ' ' +
        r.authors.map((a) => a.family ?? a.literal ?? '').join(' ') +
        ' ' +
        (r.year ?? '') +
        ' ' +
        (r.containerTitle ?? '') +
        ' ' +
        (r.doi ?? '') +
        ' ' +
        (r.pmid ?? '');
      return hay.toLowerCase().includes(q);
    });
  }, [query, allRefs]);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function insertSelected(): void {
    if (selected.size === 0) return;
    // Preserve panel order
    const ordered = allRefs.filter((r) => selected.has(r.id)).map((r) => r.id);
    onInsert(ordered);
    onClose();
  }

  function insertSingle(id: string): void {
    onInsert([id]);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-xl shadow-xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <h2 className="font-bold text-primary text-sm">{t('cite_insert_title')}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border space-y-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Başlık, yazar, yıl, DOI ile ara…"
            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal"
          />
          <p className="text-xs text-muted">
            Tek tıkla anında yerleştir. <strong>Checkbox</strong> ile çoklu seç → birlikte yerleştir butonu (`[1,2,3]`).
          </p>
        </div>

        <ul className="flex-1 overflow-auto p-2 space-y-1.5">
          {filtered.length === 0 && (
            <li className="text-sm text-muted text-center py-8">{t('cite_no_matches')}</li>
          )}
          {filtered.map((r) => {
            const n = refOrder.get(r.id);
            const isSel = selected.has(r.id);
            return (
              <li
                key={r.id}
                className={`border rounded-lg p-2.5 text-sm transition ${
                  isSel ? 'border-teal bg-teal-bg' : 'border-border hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(r.id)}
                    className="mt-1 shrink-0 accent-teal cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    className={`shrink-0 w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center ${
                      n ? 'bg-teal text-white' : 'bg-slate-100 text-muted'
                    }`}
                  >
                    {n ?? '—'}
                  </span>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => insertSingle(r.id)}
                    title="Tek tıkla yerleştir"
                  >
                    <div className="font-medium text-primary leading-snug line-clamp-2">
                      {r.title || '(Başlıksız)'}
                    </div>
                    <div className="text-xs text-muted truncate mt-0.5">
                      {r.authors[0]?.family || r.authors[0]?.literal || '—'}
                      {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} · {r.containerTitle ?? '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => insertSingle(r.id)}
                    className="text-xs text-teal hover:underline shrink-0 self-center"
                  >
                    Yerleştir →
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {selected.size > 0 ? `${selected.size} ref seçili` : 'Tek tıkla yerleştir veya checkbox ile çoklu seç'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-xs">
              {t('cite_insert_cancel')}
            </button>
            <button
              onClick={insertSelected}
              disabled={selected.size === 0}
              className="btn-primary text-xs disabled:opacity-40"
            >
              Birlikte yerleştir ({selected.size}) →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
