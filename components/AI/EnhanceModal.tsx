'use client';

import { useEffect, useMemo, useState } from 'react';
import { diffWords } from '@/lib/ai/diff';
import type { EnhanceModeT } from '@/lib/ai/schemas';

export type EnhanceState =
  | { status: 'idle' }
  | { status: 'loading'; before: string }
  | {
      status: 'ready';
      before: string;
      after: string;
      rationale?: string;
      citationCheck?: { total: number; missing: number[]; extras: number[] };
    }
  | { status: 'error'; before: string; error: string };

type Props = {
  state: EnhanceState;
  mode: EnhanceModeT | null;
  onAccept: () => void;
  onClose: () => void;
  onRetry: () => void;
};

const MODE_LABELS: Record<EnhanceModeT, string> = {
  expand: 'Genişlet',
  shorten: 'Kısalt',
  rephrase: 'Yeniden Yaz',
  'tone-academic': 'Akademik Ton',
  clarity: 'Açıklık',
  concision: 'Sadelik',
  grammar: 'Dilbilgisi',
};

export function EnhanceModal({ state, mode, onAccept, onClose, onRetry }: Props): JSX.Element | null {
  if (state.status === 'idle') return null;

  const before = state.before;
  const after = state.status === 'ready' ? state.after : '';
  const diff = useMemo(() => (state.status === 'ready' ? diffWords(before, after) : []), [before, after, state.status]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const citationCheck = state.status === 'ready' ? state.citationCheck : undefined;
  const citationWarn =
    citationCheck && (citationCheck.missing.length > 0 || citationCheck.extras.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(960px,95vw)] max-h-[90vh] flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary">
            ✏️ AI {mode ? MODE_LABELS[mode] : 'İyileştir'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
          {state.status === 'loading' && (
            <p className="text-muted text-xs italic">İyileştiriliyor…</p>
          )}
          {state.status === 'error' && (
            <p className="text-red text-xs">Hata: {state.error}</p>
          )}

          {state.status === 'ready' && (
            <>
              {state.rationale && (
                <div className="bg-teal-bg border border-teal/30 rounded-lg px-3 py-2 text-xs text-secondary">
                  <span className="tool-label">Gerekçe</span>
                  <p className="mt-0.5">{state.rationale}</p>
                </div>
              )}

              {citationWarn && (
                <div className="bg-red-bg border border-red/30 rounded-lg px-3 py-2 text-xs text-red">
                  <strong>Atıf uyarısı:</strong>{' '}
                  {citationCheck!.missing.length > 0 &&
                    `${citationCheck!.missing.length} atıf eksik`}
                  {citationCheck!.missing.length > 0 && citationCheck!.extras.length > 0 && ' · '}
                  {citationCheck!.extras.length > 0 &&
                    `${citationCheck!.extras.length} fazla atıf eklendi`}
                  . Yeniden dene veya iptal et.
                </div>
              )}

              <div>
                <div className="tool-label mb-1">Diff (kelime bazında)</div>
                <div className="border border-border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap font-serif">
                  {diff.map((seg, i) => {
                    if (seg.type === 'add') {
                      return (
                        <span key={i} className="bg-green-100 text-green-900 px-0.5 rounded">
                          {seg.value}
                        </span>
                      );
                    }
                    if (seg.type === 'remove') {
                      return (
                        <span key={i} className="bg-red-100 text-red-900 line-through px-0.5 rounded">
                          {seg.value}
                        </span>
                      );
                    }
                    return <span key={i}>{seg.value}</span>;
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="tool-label mb-1">Önce</div>
                  <div className="border border-border rounded-lg p-2 text-xs whitespace-pre-wrap bg-slate-50 max-h-[200px] overflow-auto leading-relaxed">
                    {before}
                  </div>
                </div>
                <div>
                  <div className="tool-label mb-1">Sonra</div>
                  <div className="border border-teal/40 rounded-lg p-2 text-xs whitespace-pre-wrap bg-teal-bg/30 max-h-[200px] overflow-auto leading-relaxed">
                    {after}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-between items-center">
          <button onClick={onRetry} className="text-xs text-secondary hover:text-teal">
            🔄 Tekrar dene
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-muted hover:text-primary text-sm px-3 py-1.5">
              İptal
            </button>
            <button
              onClick={onAccept}
              disabled={state.status !== 'ready'}
              className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
            >
              ✓ Uygula
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
