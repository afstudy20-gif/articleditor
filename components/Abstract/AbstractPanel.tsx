'use client';

import { useEffect, useState } from 'react';
import { countWords } from '@/lib/editor/abstract';

type Props = {
  value: string;
  onChange: (value: string) => void;
  keywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
  onClose: () => void;
  lang: 'tr' | 'en';
};

type MeshSuggestion = {
  label: string;
  resource: string;
};

export function AbstractPanel({
  value,
  onChange,
  keywords,
  onKeywordsChange,
  onClose,
  lang,
}: Props): JSX.Element {
  const words = countWords(value);
  const chars = value.length;
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<MeshSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = draft.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/mesh/lookup?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((data) => {
          const next = Array.isArray(data?.suggestions) ? data.suggestions : [];
          setSuggestions(next.slice(0, 8));
        })
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [draft]);

  const addKeyword = (keyword: string): void => {
    const clean = keyword.trim().replace(/[;,]+$/g, '');
    if (!clean) return;
    if (keywords.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      setDraft('');
      return;
    }
    onKeywordsChange([...keywords, clean]);
    setDraft('');
    setSuggestions([]);
  };

  const removeKeyword = (keyword: string): void => {
    onKeywordsChange(keywords.filter((item) => item !== keyword));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 pb-4 px-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary">A {lang === 'tr' ? 'Abstract / Özet' : 'Abstract'}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <textarea
            className="min-h-[320px] w-full resize-y outline-none p-4 text-sm leading-relaxed text-primary border-b border-border"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={lang === 'tr' ? 'Abstract / özet...' : 'Abstract...'}
          />
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-secondary">
                {lang === 'tr' ? 'Keywords' : 'Keywords'}
              </label>
              <span className="text-[10px] text-muted">MeSH</span>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => removeKeyword(keyword)}
                    className="px-2 py-1 rounded-full bg-teal-bg text-teal border border-teal/20 text-xs font-semibold hover:bg-teal hover:text-white"
                    title={lang === 'tr' ? 'Kaldır' : 'Remove'}
                  >
                    {keyword} ×
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                className="w-full text-xs border border-border rounded px-2 py-2 bg-surface text-primary outline-none focus:border-teal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addKeyword(draft);
                  }
                }}
                placeholder={lang === 'tr' ? 'MeSH keyword ara veya yaz...' : 'Search or type a MeSH keyword...'}
              />
              {(suggestions.length > 0 || loading) && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
                  {loading && suggestions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted">
                      {lang === 'tr' ? 'Aranıyor...' : 'Searching...'}
                    </div>
                  )}
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.resource}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addKeyword(suggestion.label);
                      }}
                      className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                    >
                      <span className="font-semibold text-primary">{suggestion.label}</span>
                      <span className="ml-2 text-[10px] text-muted">MeSH</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-4 py-2 border-t border-border bg-slate-50 text-xs text-muted flex items-center justify-between">
          <span>{words} {lang === 'tr' ? 'kelime' : 'words'}</span>
          <span>{keywords.length} {lang === 'tr' ? 'keyword' : 'keywords'} · {chars} {lang === 'tr' ? 'karakter' : 'characters'}</span>
        </div>
      </div>
    </div>
  );
}
