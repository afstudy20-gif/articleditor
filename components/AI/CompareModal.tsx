'use client';

import { useState } from 'react';
import type { CompareResultT } from '@/lib/ai/schemas';
import type { Ref } from '@/store/types';
import { aiHeaders } from '@/lib/ai/user-keys';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  myAbstract: string;
  refs: Ref[];
  onClose: () => void;
  onInsertSnippet: (snippet: string) => void;
  onExtractAspects: (id: string) => Promise<void>;
};

export function CompareModal({ myAbstract: initialAbstract, refs, onClose, onInsertSnippet, onExtractAspects }: Props): JSX.Element {
  const { t, lang } = useLang();
  const [abstract, setAbstract] = useState(initialAbstract);
  const [targetId, setTargetId] = useState<string>(refs[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResultT | null>(null);
  const [extracting, setExtracting] = useState(false);

  const target = refs.find((r) => r.id === targetId);

  async function run(): Promise<void> {
    if (!target) return;
    if (abstract.trim().length < 50) {
      setError(t('ai_compare_abstract_min'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Auto-extract aspects first if target lacks them and has abstract.
      let workingTarget = target;
      if (!workingTarget.aspects && workingTarget.abstract && !extracting) {
        setExtracting(true);
        try {
          await onExtractAspects(workingTarget.id);
          // Wait one tick for state to propagate; caller updates refs.
        } finally {
          setExtracting(false);
        }
      }
      // Re-read latest target (may not be available; use as-is)
      const payload = {
        myAbstract: abstract,
        targetRef: {
          title: workingTarget.title,
          abstract: workingTarget.abstract,
          authors: workingTarget.authors
            .map((a) => (a.literal ? a.literal : [a.family, a.given].filter(Boolean).join(', ')))
            .join('; '),
          year: workingTarget.year,
          containerTitle: workingTarget.containerTitle,
          aspects: workingTarget.aspects,
        },
        lang,
      };
      const res = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(900px,95vw)] max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary">⚖️ {t('ai_compare_title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
          <div>
            <label className="tool-label block mb-1">{t('ai_compare_target_label')}</label>
            <select
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setResult(null);
              }}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal"
            >
              {refs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title?.slice(0, 100) ?? t('rp_no_title')} · {r.year ?? '?'}
                </option>
              ))}
            </select>
            {target && !target.abstract && (
              <p className="text-xs text-amber-700 mt-1">
                {t('ai_compare_no_abstract')}
              </p>
            )}
          </div>

          <div>
            <label className="tool-label block mb-1">{t('ai_compare_your_abstract')}</label>
            <textarea
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              rows={4}
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs"
              placeholder={t('ai_compare_abstract_placeholder')}
            />
          </div>

          <button
            onClick={run}
            disabled={loading || !target}
            className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
          >
            {loading ? (extracting ? t('ai_compare_extracting') : t('ai_compare_comparing')) : `⚖️ ${t('ai_compare_btn')}`}
          </button>

          {error && <p className="text-red text-xs">{error}</p>}

          {result && (
            <div className="space-y-3 pt-3 border-t border-border">
              <div>
                <div className="tool-label mb-1">{t('ai_compare_overlaps')}</div>
                <table className="w-full text-xs border border-border">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-2 py-1 border-b border-border">{t('ai_compare_aspect')}</th>
                      <th className="px-2 py-1 border-b border-border">{t('ai_compare_mine')}</th>
                      <th className="px-2 py-1 border-b border-border">{t('ai_compare_theirs')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.overlaps.map((o, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 border-b border-border font-semibold align-top">{o.aspect}</td>
                        <td className="px-2 py-1 border-b border-border align-top">{o.mine}</td>
                        <td className="px-2 py-1 border-b border-border align-top">{o.theirs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.gaps.length > 0 && (
                <div>
                  <div className="tool-label mb-1">{t('ai_compare_gaps')}</div>
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {result.gaps.map((g, i) => (
                      <li key={i} className="text-secondary">{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.differentiators.length > 0 && (
                <div>
                  <div className="tool-label mb-1">{t('ai_compare_differentiators')}</div>
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {result.differentiators.map((d, i) => (
                      <li key={i} className="text-teal">{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.citation_snippet && (
                <div className="bg-teal-bg border border-teal/30 rounded-lg p-2">
                  <div className="tool-label mb-1">{t('ai_compare_citation')}</div>
                  <p className="text-xs text-secondary mb-2 leading-relaxed">{result.citation_snippet}</p>
                  <button
                    onClick={() => onInsertSnippet(result.citation_snippet!)}
                    className="text-xs text-teal hover:underline"
                  >
                    {t('ai_compare_insert')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button onClick={onClose} className="text-muted hover:text-primary text-sm px-3 py-1.5">
            {t('ai_compare_close')}
          </button>
        </div>
      </div>
    </>
  );
}
