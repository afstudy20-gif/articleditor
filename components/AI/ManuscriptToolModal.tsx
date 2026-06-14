'use client';

import { useState } from 'react';
import type {
  ManuscriptToolModeT,
  ManuscriptToolResultT,
} from '@/lib/ai/schemas';
import { useLang } from '@/lib/i18n/hooks';

interface Props {
  mode: ManuscriptToolModeT;
  result: ManuscriptToolResultT | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (text: string) => void;
}

const TITLES: Record<ManuscriptToolModeT, { tr: string; en: string }> = {
  abstract: { tr: 'Abstract iyileştirme', en: 'Improve Abstract' },
  titles: { tr: 'Başlık önerileri', en: 'Title Suggestions' },
  discussion: { tr: 'Discussion güçlendirme', en: 'Strengthen Discussion' },
  conclusion: { tr: 'Conclusion güçlendirme', en: 'Strengthen Conclusion' },
};

export function ManuscriptToolModal({
  mode,
  result,
  loading,
  error,
  onClose,
  onApply,
}: Props): JSX.Element {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const [selected, setSelected] = useState(0);
  const candidate = mode === 'titles'
    ? result?.options?.[selected] ?? ''
    : result?.output ?? '';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(860px,95vw)] max-h-[88vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <h3 className="font-semibold text-primary">{tr ? TITLES[mode].tr : TITLES[mode].en}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg">×</button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
          {loading && <p className="text-muted text-xs italic">{tr ? 'Hazırlanıyor…' : 'Preparing…'}</p>}
          {error && <p className="text-red text-xs">{error}</p>}
          {result?.rationale && (
            <div className="rounded-lg bg-teal-bg border border-teal/20 p-3 text-xs text-secondary">
              {result.rationale}
            </div>
          )}
          {mode === 'titles' && result?.options && (
            <div className="space-y-2">
              {result.options.map((option, index) => (
                <button
                  key={`${option}-${index}`}
                  onClick={() => setSelected(index)}
                  className={`block w-full text-left rounded-lg border p-3 ${
                    selected === index ? 'border-teal bg-teal-bg/40' : 'border-border hover:bg-slate-50'
                  }`}
                >
                  <span className="mr-2 text-muted">{index + 1}.</span>{option}
                </button>
              ))}
            </div>
          )}
          {mode !== 'titles' && result?.output && (
            <div className="border border-border rounded-lg p-4 whitespace-pre-wrap font-serif leading-relaxed">
              {result.output}
            </div>
          )}
          {result?.cautions && result.cautions.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="font-semibold text-amber-800 text-xs mb-1">{tr ? 'Yazar kontrolü gerekli' : 'Author verification required'}</div>
              {result.cautions.map((item, index) => (
                <p key={index} className="text-xs text-amber-800">• {item}</p>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-muted">
            {tr ? 'İptal' : 'Cancel'}
          </button>
          <button
            onClick={() => onApply(candidate)}
            disabled={!candidate || loading}
            className="btn-primary px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {mode === 'titles'
              ? tr ? 'Başlığı kullan' : 'Use title'
              : tr ? 'Metne uygula' : 'Apply to manuscript'}
          </button>
        </div>
      </div>
    </>
  );
}
