'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  loadDictionary,
  checkEditor,
  SpellChecker,
  type SpellIssue,
  type SpellLang,
} from '@/lib/spellcheck/spellcheck';

interface SpellcheckPanelProps {
  editor: Editor;
  onClose: () => void;
  lang: 'tr' | 'en';
}

const localizations = {
  tr: {
    title: 'Yazım Kontrolü',
    loading: 'Sözlük yükleniyor…',
    scanning: 'Kontrol ediliyor…',
    noErrors: 'Yazım hatası bulunamadı.',
    suggestions: 'Öneriler',
    ignore: 'Yoksay',
    occurrences: 'kullanım',
    loadFailed: 'Sözlük yüklenemedi.',
    langLabel: 'Dil',
    langEnUs: 'İngilizce (ABD)',
    langEnGb: 'İngilizce (BK)',
    langTr: 'Türkçe',
    hint: 'Yanlış yazılmış kelimeler listelenir. Öneriye tıklayarak düzeltin veya yoksayın.',
  },
  en: {
    title: 'Spell Check',
    loading: 'Loading dictionary…',
    scanning: 'Checking…',
    noErrors: 'No spelling errors found.',
    suggestions: 'Suggestions',
    ignore: 'Ignore',
    occurrences: 'occurrences',
    loadFailed: 'Could not load dictionary.',
    langLabel: 'Language',
    langEnUs: 'English (US)',
    langEnGb: 'English (UK)',
    langTr: 'Turkish',
    hint: 'Misspelled words are listed. Click a suggestion to fix it, or ignore it.',
  },
};

interface GroupedIssue {
  quote: string;
  occurrences: { from: number; to: number }[];
  suggestions: string[];
}

/** Group issues by word so repeats collapse into one row. */
function groupIssues(issues: SpellIssue[]): GroupedIssue[] {
  const map = new Map<string, GroupedIssue>();
  for (const issue of issues) {
    const existing = map.get(issue.quote);
    if (existing) {
      existing.occurrences.push({ from: issue.start, to: issue.end });
      continue;
    }
    map.set(issue.quote, {
      quote: issue.quote,
      occurrences: [{ from: issue.start, to: issue.end }],
      suggestions: issue.suggestions,
    });
  }
  // Most frequent first, then alphabetical.
  return [...map.values()].sort((a, b) => {
    if (b.occurrences.length !== a.occurrences.length) {
      return b.occurrences.length - a.occurrences.length;
    }
    return a.quote.localeCompare(b.quote);
  });
}

export function SpellcheckPanel({ editor, onClose, lang }: SpellcheckPanelProps): JSX.Element {
  const [spellLang, setSpellLang] = useState<SpellLang>(lang === 'tr' ? 'tr' : 'en-us');
  const t = localizations[lang] || localizations.en;
  const [checker, setChecker] = useState<SpellChecker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [issues, setIssues] = useState<SpellIssue[]>([]);
  const [activeWord, setActiveWord] = useState<string>('');
  const occCursor = useRef<Map<string, number>>(new Map());
  const rescanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the dictionary when the language changes (cached module-level).
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setChecker(null);
    setIssues([]);
    loadDictionary(spellLang)
      .then((c) => {
        if (cancelled) return;
        setChecker(c);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [spellLang]);

  // Debounced re-scan on every editor transaction once the checker is ready.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !checker) return undefined;
    const rescan = (): void => {
      if (rescanTimer.current) clearTimeout(rescanTimer.current);
      rescanTimer.current = setTimeout(() => {
        if (editor.isDestroyed) return;
        setIssues(checkEditor(checker, editor));
      }, 300);
    };
    rescan();
    editor.on('transaction', rescan);
    return () => {
      editor.off('transaction', rescan);
      if (rescanTimer.current) clearTimeout(rescanTimer.current);
    };
  }, [editor, checker]);

  const grouped = useMemo(() => groupIssues(issues), [issues]);

  /** Jump through a word's occurrences in document order. */
  const jumpTo = (group: GroupedIssue): void => {
    if (!editor || editor.isDestroyed) return;
    const current = occCursor.current.get(group.quote) ?? -1;
    const next = (current + 1) % group.occurrences.length;
    occCursor.current.set(group.quote, next);
    setActiveWord(`${group.quote}#${next}`);
    const occ = group.occurrences[next];
    editor.chain().focus().setTextSelection({ from: occ.from, to: occ.to }).scrollIntoView().run();
  };

  /** Replace a single occurrence (the one currently focused in the editor). */
  const fixOne = (group: GroupedIssue, suggestion: string): void => {
    if (!editor || editor.isDestroyed) return;
    const current = occCursor.current.get(group.quote) ?? 0;
    const occ = group.occurrences[current] ?? group.occurrences[0];
    editor.chain().focus().setTextSelection({ from: occ.from, to: occ.to }).insertContent(suggestion).run();
  };

  const ignore = (group: GroupedIssue): void => {
    if (!checker) return;
    checker.ignore(group.quote);
    setIssues((prev) => prev.filter((i) => i.quote !== group.quote));
  };

  return (
    <div className="card flex flex-col h-full bg-white border border-border rounded-xl shadow-lg">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-slate-50 rounded-t-xl">
        <div className="flex items-center gap-1.5">
          <span className="text-base">✓️</span>
          <h3 className="font-bold text-primary text-sm">{t.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-primary text-lg leading-none px-1.5"
          title="×"
        >
          ×
        </button>
      </div>

      {/* Language switch */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-xs">
        <span className="text-muted font-semibold">{t.langLabel}:</span>
        <div className="flex gap-1 bg-white p-0.5 rounded-md border border-border">
          <button
            onClick={() => setSpellLang('en-us')}
            className={`px-2 py-0.5 rounded font-semibold transition ${
              spellLang === 'en-us' ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-50'
            }`}
            title={t.langEnUs}
          >
            EN-US
          </button>
          <button
            onClick={() => setSpellLang('en-gb')}
            className={`px-2 py-0.5 rounded font-semibold transition ${
              spellLang === 'en-gb' ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-50'
            }`}
            title={t.langEnGb}
          >
            EN-UK
          </button>
          <button
            onClick={() => setSpellLang('tr')}
            className={`px-2 py-0.5 rounded font-semibold transition ${
              spellLang === 'tr' ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-50'
            }`}
            title={t.langTr}
          >
            TR
          </button>
        </div>
        {status === 'ready' && (
          <span className="ml-auto text-[10px] text-muted">{grouped.length} {t.occurrences}</span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {status === 'loading' && (
          <div className="text-center text-xs text-muted py-8">{t.loading}</div>
        )}
        {status === 'error' && (
          <div className="text-center text-xs text-red py-8">{t.loadFailed}</div>
        )}
        {status === 'ready' && grouped.length === 0 && (
          <div className="text-center text-xs text-emerald-600 py-8">{t.noErrors}</div>
        )}
        {status === 'ready' && grouped.length > 0 && (
          <p className="text-[10px] text-muted leading-relaxed">{t.hint}</p>
        )}
        {grouped.map((group) => {
          const isActive = activeWord.startsWith(group.quote + '#');
          return (
            <div
              key={group.quote}
              className={`rounded-lg border p-2 transition cursor-pointer ${
                isActive ? 'border-teal bg-teal-bg/30' : 'border-border bg-white hover:bg-slate-50'
              }`}
              onClick={() => jumpTo(group)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-red text-sm truncate">{group.quote}</span>
                <span className="text-[10px] text-muted shrink-0">
                  {group.occurrences.length}×
                </span>
              </div>
              {group.suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                  {group.suggestions.slice(0, 5).map((sugg) => (
                    <button
                      key={sugg}
                      onClick={() => fixOne(group, sugg)}
                      className="text-[11px] px-1.5 py-0.5 rounded border border-teal text-teal hover:bg-teal hover:text-white transition"
                    >
                      {sugg}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] text-muted italic mt-1 block">{t.suggestions}: —</span>
              )}
              <div className="flex gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => ignore(group)}
                  className="text-[10px] text-muted hover:text-primary underline"
                >
                  {t.ignore}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
