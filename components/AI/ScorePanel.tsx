'use client';

import type { ScoreResultT } from '@/lib/ai/schemas';

type Props = {
  result: ScoreResultT | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRescore: () => void;
};

function scoreColor(n: number): string {
  if (n >= 80) return 'bg-teal text-white';
  if (n >= 60) return 'bg-amber-500 text-white';
  if (n >= 40) return 'bg-orange-500 text-white';
  return 'bg-red text-white';
}

function ScoreBadge({ label, score }: { label: string; score: number }): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`w-14 h-14 rounded-full text-lg font-bold flex items-center justify-center ${scoreColor(score)}`}>
        {Math.round(score)}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export function ScorePanel({ result, loading, error, onClose, onRescore }: Props): JSX.Element {
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="font-semibold text-primary text-sm">📊 Manuskript Skoru</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onRescore}
            disabled={loading}
            className="text-xs text-teal hover:underline disabled:opacity-50"
          >
            🔄 Yeniden hesapla
          </button>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 text-sm">
        {loading && <p className="text-muted text-xs italic">Skor hesaplanıyor…</p>}
        {error && <p className="text-red text-xs">{error}</p>}
        {!loading && !error && result && (
          <>
            <div className="grid grid-cols-4 gap-2 py-2 border-b border-border">
              <ScoreBadge label="Genel" score={result.overall} />
              <ScoreBadge label="Açıklık" score={result.clarity} />
              <ScoreBadge label="Tutarlılık" score={result.coherence} />
              <ScoreBadge label="Akademik ton" score={result.academic_tone} />
            </div>

            {result.breakdown.length > 0 && (
              <div>
                <div className="tool-label mb-1">Detay</div>
                <ul className="space-y-1.5">
                  {result.breakdown.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span
                        className={`shrink-0 w-9 h-6 rounded text-[11px] font-bold flex items-center justify-center ${scoreColor(b.score)}`}
                      >
                        {Math.round(b.score)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-primary">{b.aspect}</div>
                        {b.notes && <p className="text-muted leading-snug">{b.notes}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.recommendations && result.recommendations.length > 0 && (
              <div>
                <div className="tool-label mb-1">Öneriler</div>
                <ol className="space-y-1 text-xs text-secondary list-decimal list-inside">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="leading-snug">{rec}</li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
