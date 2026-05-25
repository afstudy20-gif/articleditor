'use client';

import type { ClaimT } from '@/lib/ai/schemas';
import type { Suggestion } from './CitationSuggestionsPanel';
import type { Ref } from '@/store/types';

type ClaimSuggestions = {
  claim: ClaimT;
  suggestions: Suggestion[];
  loadingSuggestions: boolean;
};

type Props = {
  claims: ClaimSuggestions[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onJumpTo: (claim: ClaimT) => void;
  onInsertCitation: (claim: ClaimT, refIds: string[]) => void;
  onLoadSuggestions: (claim: ClaimT) => void;
  refOrder: Map<string, number>;
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  empirical: 'Ampirik',
  theoretical: 'Teorik',
  statistical: 'İstatistik',
  attribution: 'Atfetme',
  definition: 'Tanım',
};

export function GapDetectPanel({
  claims,
  loading,
  error,
  onClose,
  onJumpTo,
  onInsertCitation,
  onLoadSuggestions,
  refOrder,
}: Props): JSX.Element {
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="font-semibold text-primary text-sm">🩹 Atıfsız iddialar</h3>
          {!loading && !error && (
            <p className="text-xs text-muted">{claims.length} aday cümle</p>
          )}
        </div>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {loading && <p className="text-muted text-xs italic">Metin taranıyor…</p>}
        {error && <p className="text-red text-xs">{error}</p>}
        {!loading && !error && claims.length === 0 && (
          <p className="text-muted text-xs italic">Atıfsız iddia bulunamadı.</p>
        )}
        {claims.map((cs, i) => (
          <ClaimCard
            key={i}
            cs={cs}
            onJumpTo={onJumpTo}
            onInsertCitation={onInsertCitation}
            onLoadSuggestions={onLoadSuggestions}
            refOrder={refOrder}
          />
        ))}
      </div>
    </div>
  );
}

function ClaimCard({
  cs,
  onJumpTo,
  onInsertCitation,
  onLoadSuggestions,
  refOrder,
}: {
  cs: ClaimSuggestions;
  onJumpTo: (claim: ClaimT) => void;
  onInsertCitation: (claim: ClaimT, refIds: string[]) => void;
  onLoadSuggestions: (claim: ClaimT) => void;
  refOrder: Map<string, number>;
}): JSX.Element {
  return (
    <div className="border border-border rounded-lg p-2 text-xs hover:border-amber-300">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300">
          {CLAIM_TYPE_LABELS[cs.claim.claim_type] ?? cs.claim.claim_type}
        </span>
        <button
          onClick={() => onJumpTo(cs.claim)}
          className="text-[11px] text-teal hover:underline ml-auto"
        >
          ↑ Metinde bul
        </button>
      </div>
      <p className="text-primary italic mb-1 leading-snug">&ldquo;{cs.claim.quote}&rdquo;</p>
      <p className="text-muted leading-snug mb-2">{cs.claim.rationale}</p>

      {cs.suggestions.length === 0 && !cs.loadingSuggestions && (
        <button
          onClick={() => onLoadSuggestions(cs.claim)}
          className="text-xs text-teal hover:underline"
        >
          🎯 Uygun atıf öner
        </button>
      )}
      {cs.loadingSuggestions && (
        <p className="text-xs text-muted italic">Eşleşme aranıyor…</p>
      )}
      {cs.suggestions.length > 0 && (
        <div className="space-y-1 mt-1 pt-1 border-t border-border">
          {cs.suggestions.map(({ ref, score }) => {
            const n = refOrder.get(ref.id);
            return (
              <div key={ref.id} className="flex items-start gap-2">
                <span className="shrink-0 w-8 h-5 rounded text-[10px] font-bold flex items-center justify-center bg-teal text-white">
                  {Math.round(score * 100)}%
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary truncate">
                    {n ? `[${n}] ` : ''}
                    {ref.title || '(Başlıksız)'}
                  </div>
                  <div className="text-muted truncate">
                    {ref.authors[0]?.family || '—'} · {ref.year ?? '?'}
                  </div>
                </div>
                <button
                  onClick={() => onInsertCitation(cs.claim, [ref.id])}
                  className="text-[10px] text-teal hover:underline shrink-0"
                  title="Bu cümlenin sonuna atıf ekle"
                >
                  + Ekle
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
