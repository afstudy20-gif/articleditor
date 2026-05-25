'use client';

import type { Ref } from '@/store/types';

export type Suggestion = {
  ref: Ref;
  score: number;
};

type Props = {
  query: string;
  suggestions: Suggestion[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onInsert: (refIds: string[]) => void;
  refOrder: Map<string, number>;
};

export function CitationSuggestionsPanel({
  query,
  suggestions,
  loading,
  error,
  onClose,
  onInsert,
  refOrder,
}: Props): JSX.Element {
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="font-semibold text-primary text-sm">🎯 Atıf önerileri</h3>
          <p className="text-xs text-muted">Kütüphaneden semantik eşleşme</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border bg-slate-50">
        <div className="tool-label mb-1">Sorgu</div>
        <p className="text-xs text-secondary italic line-clamp-3 leading-snug">{query}</p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {loading && <p className="text-muted text-xs italic">Eşleşmeler aranıyor…</p>}
        {error && <p className="text-red text-xs">{error}</p>}
        {!loading && !error && suggestions.length === 0 && (
          <p className="text-muted text-xs italic">
            Eşleşme yok. Önce kütüphanedeki referansları gömdüğünden emin ol (RefsPanel &gt; AI gömme).
          </p>
        )}
        {suggestions.map(({ ref, score }) => {
          const n = refOrder.get(ref.id);
          return (
            <div
              key={ref.id}
              className="border border-border rounded-lg p-2 text-xs hover:border-teal hover:bg-teal-bg/30 transition"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-9 h-6 rounded text-[11px] font-bold flex items-center justify-center bg-teal text-white">
                  {Math.round(score * 100)}%
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-primary leading-snug">
                    {n ? `[${n}] ` : ''}
                    {ref.title || '(Başlıksız)'}
                  </div>
                  <div className="text-muted truncate">
                    {ref.authors[0]?.family || '—'}
                    {ref.authors.length > 1 ? ' et al.' : ''} · {ref.year ?? '?'} ·{' '}
                    {ref.containerTitle ?? '—'}
                  </div>
                </div>
                <button
                  onClick={() => onInsert([ref.id])}
                  className="btn-primary text-[11px] px-2 py-0.5 shrink-0"
                  title="Cursor konumuna bu atıfı ekle"
                >
                  + Ekle
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
