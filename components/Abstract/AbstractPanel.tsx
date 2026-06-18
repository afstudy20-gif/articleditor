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

type MeshLookupResponse = {
  suggestions?: MeshSuggestion[];
  exact?: MeshSuggestion | null;
};

type MeshKeywordStatus =
  | { status: 'checking' }
  | { status: 'verified'; label: string; resource: string }
  | { status: 'suggested'; label: string; resource: string }
  | { status: 'custom' };

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
  const [meshStatusByKeyword, setMeshStatusByKeyword] = useState<Record<string, MeshKeywordStatus>>({});

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
        .then((data: MeshLookupResponse) => {
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

  useEffect(() => {
    const cleanKeywords = keywords.map(cleanKeyword).filter(Boolean);
    if (cleanKeywords.length === 0) {
      setMeshStatusByKeyword({});
      return undefined;
    }

    const controller = new AbortController();
    setMeshStatusByKeyword((prev) => {
      const next: Record<string, MeshKeywordStatus> = {};
      for (const keyword of cleanKeywords) {
        next[keyword] = prev[keyword] ?? { status: 'checking' };
      }
      return next;
    });

    Promise.all(
      cleanKeywords.map(async (keyword): Promise<[string, MeshKeywordStatus]> => {
        try {
          const res = await fetch(`/api/mesh/lookup?q=${encodeURIComponent(keyword)}&exact=1`, {
            signal: controller.signal,
          });
          if (!res.ok) return [keyword, { status: 'custom' }];
          const data = (await res.json()) as MeshLookupResponse;
          if (data.exact?.label && data.exact.resource) {
            return [keyword, { status: 'verified', label: data.exact.label, resource: data.exact.resource }];
          }
          const first = Array.isArray(data.suggestions) ? data.suggestions[0] : undefined;
          if (first?.label && first.resource) {
            return [keyword, { status: 'suggested', label: first.label, resource: first.resource }];
          }
        } catch {
          if (controller.signal.aborted) return [keyword, { status: 'checking' }];
        }
        return [keyword, { status: 'custom' }];
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      setMeshStatusByKeyword(Object.fromEntries(entries));
    });

    return () => {
      controller.abort();
    };
  }, [keywords]);

  const addKeyword = (keyword: string): void => {
    const clean = cleanKeyword(keyword);
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

  const replaceKeyword = (oldKeyword: string, nextKeyword: string): void => {
    const clean = cleanKeyword(nextKeyword);
    if (!clean) return;
    const seen = new Set<string>();
    const next: string[] = [];
    for (const keyword of keywords) {
      const candidate = keyword === oldKeyword ? clean : keyword;
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(candidate);
    }
    onKeywordsChange(next);
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
                {keywords.map((keyword) => {
                  const status = meshStatusByKeyword[cleanKeyword(keyword)] ?? { status: 'checking' };
                  return (
                    <div
                      key={keyword}
                      className={[
                        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs',
                        status.status === 'verified'
                          ? 'bg-teal-bg text-teal border-teal/25'
                          : status.status === 'suggested'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-secondary border-border',
                      ].join(' ')}
                      title={meshStatusTitle(status, lang)}
                    >
                      <span className="min-w-0 max-w-[24rem] truncate font-semibold">{keyword}</span>
                      <MeshStatusBadge
                        status={status}
                        lang={lang}
                        onUseSuggestion={
                          status.status === 'suggested'
                            ? () => replaceKeyword(keyword, status.label)
                            : undefined
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeKeyword(keyword)}
                        className="shrink-0 text-current opacity-70 hover:opacity-100"
                        title={lang === 'tr' ? 'Kaldır' : 'Remove'}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
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

function MeshStatusBadge({
  status,
  lang,
  onUseSuggestion,
}: {
  status: MeshKeywordStatus;
  lang: 'tr' | 'en';
  onUseSuggestion?: () => void;
}): JSX.Element {
  if (status.status === 'checking') {
    return <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-muted">...</span>;
  }
  if (status.status === 'verified') {
    return (
      <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-teal">
        ✓ MeSH
      </span>
    );
  }
  if (status.status === 'suggested') {
    return (
      <button
        type="button"
        onClick={onUseSuggestion}
        className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
      >
        {lang === 'tr' ? 'MeSH:' : 'Use:'} {status.label}
      </button>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
      Custom
    </span>
  );
}

function meshStatusTitle(status: MeshKeywordStatus, lang: 'tr' | 'en'): string {
  if (status.status === 'verified') {
    return lang === 'tr'
      ? `MeSH descriptor doğrulandı: ${status.label}`
      : `Verified MeSH descriptor: ${status.label}`;
  }
  if (status.status === 'suggested') {
    return lang === 'tr'
      ? `Tam MeSH değil. Önerilen descriptor: ${status.label}`
      : `Not an exact MeSH heading. Suggested descriptor: ${status.label}`;
  }
  if (status.status === 'checking') {
    return lang === 'tr' ? 'MeSH kontrol ediliyor' : 'Checking MeSH';
  }
  return lang === 'tr' ? 'MeSH descriptor olarak doğrulanmadı' : 'Not verified as a MeSH descriptor';
}

function cleanKeyword(keyword: string): string {
  return keyword.trim().replace(/[;,]+$/g, '');
}
