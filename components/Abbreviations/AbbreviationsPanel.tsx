'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  analyzeAbbreviations,
  replaceTextInEditor,
  type AbbreviationScope,
  type AbbrSuggestion,
  type ScopedAbbreviation,
} from '@/lib/editor/abbreviations';

interface AbbreviationsPanelProps {
  editor: Editor;
  onClose: () => void;
  lang: 'tr' | 'en';
}

const localizations = {
  tr: {
    title: 'Kısaltma Takibi',
    tabDict: 'Sözlük',
    tabSuggs: 'Öneriler',
    helpTitle: 'Nasıl Tanımlanır?',
    helpText: 'Kısaltmaları metinde ilk kez kullanırken açık hali ve parantez içinde kısaltması şeklinde yazın (Örn: Deep Neural Network (DNN)). Sistem bunu otomatik olarak algılayacaktır. Özet, ana metin ve her tablo ayrı ayrı takip edilir.',
    occurrences: 'kullanım',
    noAbbrs: 'Metinde henüz kısaltma tanımlanmadı.',
    noSuggs: 'Kısaltma kullanım hatası bulunmadı. Harika!',
    replace: 'Değiştir',
    replaceAll: 'Hepsini Değiştir',
    searchAbbrs: 'Kısaltmalarda ara...',
    add: 'ekle',
    insertTooltip: 'Kısaltmayı metne ekle',
    replaceTooltip: 'Kısaltma ile değiştir',
    replaceAllTooltip: 'Metindeki tümünü kısaltma ile değiştir',
    suggestLabel: 'yerine kısaltmasını kullanın:',
    jumpHint: 'Geçtiği yerlere sırayla gitmek için tıklayın',
    prevOccurrence: 'Önceki kullanım',
    nextOccurrence: 'Sonraki kullanım',
    openRepeats: 'açık tekrar',
    noOpenRepeats: 'açık tekrar yok',
    jumpToRepeat: 'Açık yazılmış terime git',
    totalOccurrences: 'toplam kullanım',
    scopeAbstract: 'Özet',
    scopeMain: 'Ana Metin',
    scopeTable: 'Tablo',
  },
  en: {
    title: 'Abbreviation Tracker',
    tabDict: 'Dictionary',
    tabSuggs: 'Suggestions',
    helpTitle: 'How to define?',
    helpText: 'Define abbreviations at their first occurrence by writing the full term followed by the acronym in parentheses (e.g. Deep Neural Network (DNN)). The system detects it automatically. The abstract, main text and each table are tracked separately.',
    occurrences: 'occurrences',
    noAbbrs: 'No abbreviations defined in the text yet.',
    noSuggs: 'No abbreviation usage errors found. Excellent!',
    replace: 'Replace',
    replaceAll: 'Replace All',
    searchAbbrs: 'Search abbreviations...',
    add: 'add',
    insertTooltip: 'Insert acronym into the text',
    replaceTooltip: 'Replace with acronym',
    replaceAllTooltip: 'Replace all instances with acronym',
    suggestLabel: 'use the acronym instead of:',
    jumpHint: 'Click to jump through its occurrences in order',
    prevOccurrence: 'Previous occurrence',
    nextOccurrence: 'Next occurrence',
    openRepeats: 'open repeats',
    noOpenRepeats: 'no open repeats',
    jumpToRepeat: 'Jump to repeated full term',
    totalOccurrences: 'total occurrences',
    scopeAbstract: 'Abstract',
    scopeMain: 'Main Text',
    scopeTable: 'Table',
  },
};

function scopeLabel(scope: AbbreviationScope, t: (typeof localizations)['en']): string {
  if (scope.kind === 'abstract') return t.scopeAbstract;
  if (scope.kind === 'table') return `${t.scopeTable} ${scope.index ?? ''}`.trim();
  return t.scopeMain;
}

export function AbbreviationsPanel({ editor, onClose, lang }: AbbreviationsPanelProps): JSX.Element {
  const t = localizations[lang] || localizations.en;
  const [activeTab, setActiveTab] = useState<'dict' | 'suggs'>('dict');
  const [searchQuery, setSearchQuery] = useState('');
  const [scopes, setScopes] = useState<AbbreviationScope[]>([]);
  // Per-abbreviation occurrence cursor: key `${scopeKey}:${acronym}` -> next index.
  const navCursor = useRef<Map<string, number>>(new Map());
  const [activeJump, setActiveJump] = useState<string>('');

  // Re-analyze the editor on every transaction.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined;
    const update = (): void => setScopes(analyzeAbbreviations(editor));
    update();
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  const totals = useMemo(() => {
    let abbrs = 0;
    let occurrences = 0;
    let suggs = 0;
    for (const s of scopes) {
      abbrs += s.abbreviations.length;
      occurrences += s.abbreviations.reduce((sum, abbr) => sum + abbr.occurrences.length, 0);
      suggs += s.suggestions.length;
    }
    return { abbrs, occurrences, suggs };
  }, [scopes]);

  const repeatCountByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scope of scopes) {
      for (const suggestion of scope.suggestions) {
        const key = `${scope.key}:${suggestion.acronym}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [scopes]);

  const filteredScopes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scopes;
    return scopes
      .map((s) => ({
        ...s,
        abbreviations: s.abbreviations.filter(
          (a) => a.acronym.toLowerCase().includes(q) || a.definition.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.abbreviations.length > 0);
  }, [scopes, searchQuery]);

  // Insert acronym at cursor.
  const handleInsertAcronym = (acronym: string): void => {
    if (!editor || editor.isDestroyed) return;
    editor.chain().focus().insertContent(acronym).run();
  };

  // Cycle through the occurrences of an abbreviation, selecting + scrolling to each.
  const jumpToOccurrence = (scopeKey: string, abbr: ScopedAbbreviation, direction: 1 | -1): void => {
    if (!editor || editor.isDestroyed || abbr.occurrences.length === 0) return;
    const key = `${scopeKey}:${abbr.acronym}`;
    const current = navCursor.current.get(key);
    const next = current == null
      ? (direction === -1 ? abbr.occurrences.length - 1 : 0)
      : (current + direction + abbr.occurrences.length) % abbr.occurrences.length;
    const occ = abbr.occurrences[next];
    navCursor.current.set(key, next);
    setActiveJump(`${key}#${next}`);
    editor.chain().focus().setTextSelection({ from: occ.from, to: occ.to }).scrollIntoView().run();
  };

  const jumpToSuggestion = (suggestion: AbbrSuggestion): void => {
    if (!editor || editor.isDestroyed || suggestion.from == null || suggestion.to == null) return;
    editor.chain().focus().setTextSelection({ from: suggestion.from, to: suggestion.to }).scrollIntoView().run();
  };

  const handleReplaceOne = (definition: string, acronym: string): void => {
    replaceTextInEditor(editor, definition, acronym, false);
  };
  const handleReplaceAll = (definition: string, acronym: string): void => {
    replaceTextInEditor(editor, definition, acronym, true);
  };

  const scopesWithAbbrs = filteredScopes.filter((s) => s.abbreviations.length > 0);
  const scopesWithSuggs = scopes.filter((s) => s.suggestions.length > 0);

  return (
    <div className="card flex flex-col h-full bg-white border border-border rounded-xl shadow-lg">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-slate-50 rounded-t-xl">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🔤</span>
          <h3 className="font-bold text-primary text-sm">{t.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-primary text-xl font-semibold leading-none transition"
          title={lang === 'tr' ? 'Kapat' : 'Close'}
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-slate-50/50">
        <button
          onClick={() => setActiveTab('dict')}
          className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 transition ${
            activeTab === 'dict'
              ? 'border-teal text-teal bg-white font-bold'
              : 'border-transparent text-secondary hover:text-primary hover:bg-slate-100/50'
          }`}
        >
          {t.tabDict} ({totals.abbrs})
        </button>
        <button
          onClick={() => setActiveTab('suggs')}
          className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 transition ${
            activeTab === 'suggs'
              ? 'border-teal text-teal bg-white font-bold'
              : 'border-transparent text-secondary hover:text-primary hover:bg-slate-100/50'
          }`}
        >
          {t.tabSuggs} ({totals.suggs})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-white p-3">
        {activeTab === 'dict' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <input
              type="text"
              placeholder={t.searchAbbrs}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-border rounded-lg focus:outline-none focus:border-teal bg-slate-50/30"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-border bg-slate-50 px-2 py-1">
                <div className="text-[10px] text-muted">{t.tabDict}</div>
                <div className="text-xs font-bold text-primary">{totals.abbrs}</div>
              </div>
              <div className="rounded-md border border-border bg-slate-50 px-2 py-1">
                <div className="text-[10px] text-muted">{t.totalOccurrences}</div>
                <div className="text-xs font-bold text-primary">{totals.occurrences}</div>
              </div>
              <div className="rounded-md border border-border bg-amber-50 px-2 py-1">
                <div className="text-[10px] text-muted">{t.openRepeats}</div>
                <div className="text-xs font-bold text-amber-700">{totals.suggs}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-0.5 space-y-3">
              {scopesWithAbbrs.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted italic">{t.noAbbrs}</div>
              ) : (
                scopesWithAbbrs.map((scope) => (
                  <div key={scope.key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-teal">{scopeLabel(scope, t)}</span>
                      <span className="text-[10px] text-muted">({scope.abbreviations.length})</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {scope.abbreviations.map((a) => {
                      const key = `${scope.key}:${a.acronym}`;
                      const openRepeatCount = repeatCountByKey.get(key) ?? 0;
                      const showingIdx = activeJump.startsWith(`${key}#`)
                        ? Number(activeJump.split('#')[1]) + 1
                        : null;
                      return (
                        <div
                          key={a.acronym}
                          className="p-2.5 rounded-lg border border-border hover:border-teal/40 bg-slate-50/20 flex items-center justify-between gap-3 transition"
                        >
                          <button
                            type="button"
                            onClick={() => jumpToOccurrence(scope.key, a, 1)}
                            title={t.jumpHint}
                            className="min-w-0 flex-1 text-left group"
                          >
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <strong className="text-xs text-primary font-extrabold group-hover:text-teal">{a.acronym}</strong>
                              <span className="text-[10px] text-muted">
                                ({a.count} {t.occurrences})
                              </span>
                              {showingIdx !== null && (
                                <span className="text-[10px] font-semibold text-teal">→ {showingIdx}/{a.occurrences.length}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-secondary truncate mt-0.5" title={a.definition}>
                              {a.definition}
                            </div>
                            <div className={`text-[10px] mt-1 ${openRepeatCount > 0 ? 'text-amber-700 font-semibold' : 'text-muted'}`}>
                              {openRepeatCount > 0
                                ? `${openRepeatCount} ${t.openRepeats}`
                                : t.noOpenRepeats}
                            </div>
                          </button>
                          <div className="shrink-0 flex items-center gap-1">
                            <button
                              onClick={() => jumpToOccurrence(scope.key, a, -1)}
                              className="w-6 h-6 rounded-md border border-border bg-white text-muted hover:text-teal hover:border-teal transition"
                              title={t.prevOccurrence}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => jumpToOccurrence(scope.key, a, 1)}
                              className="w-6 h-6 rounded-md border border-border bg-white text-muted hover:text-teal hover:border-teal transition"
                              title={t.nextOccurrence}
                            >
                              ↓
                            </button>
                          </div>
                          <button
                            onClick={() => handleInsertAcronym(a.acronym)}
                            className="shrink-0 flex flex-col items-center justify-center px-2 py-1 text-teal hover:bg-teal/10 rounded-lg transition bg-white border border-border hover:border-teal/40"
                            title={t.insertTooltip}
                          >
                            <span className="text-sm font-bold leading-none">＋</span>
                            <span className="text-[8px] leading-none mt-0.5 text-muted">{t.add}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'suggs' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="overflow-y-auto flex-1 pr-0.5 space-y-3">
              {scopesWithSuggs.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted italic flex flex-col items-center justify-center gap-1">
                  <span>🎉</span>
                  <span>{t.noSuggs}</span>
                </div>
              ) : (
                scopesWithSuggs.map((scope) => (
                  <div key={scope.key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">{scopeLabel(scope, t)}</span>
                      <span className="text-[10px] text-muted">({scope.suggestions.length})</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {scope.suggestions.map((s, idx) => (
                      <div
                        key={`${s.acronym}-${idx}`}
                        className="p-3 rounded-lg border border-amber-200 bg-amber-50/20 flex flex-col gap-2.5 transition text-xs"
                      >
                        <div>
                          <span className="font-semibold text-primary">{s.textFound}</span>{' '}
                          <span className="text-muted">{t.suggestLabel}</span>{' '}
                          <strong className="text-teal font-extrabold">{s.acronym}</strong>
                        </div>
                        <div className="flex gap-1.5">
                          {s.from != null && s.to != null && (
                            <button
                              onClick={() => jumpToSuggestion(s)}
                              className="text-[10px] px-2.5 py-1 rounded-md border border-border bg-white text-secondary hover:text-teal hover:border-teal transition font-semibold"
                              title={t.jumpToRepeat}
                            >
                              {lang === 'tr' ? 'Git' : 'Go'}
                            </button>
                          )}
                          <button
                            onClick={() => handleReplaceOne(s.textFound, s.acronym)}
                            className="text-[10px] px-2.5 py-1 rounded-md border border-border bg-white text-secondary hover:text-teal hover:border-teal transition font-semibold"
                            title={t.replaceTooltip}
                          >
                            {t.replace}
                          </button>
                          <button
                            onClick={() => handleReplaceAll(s.definition, s.acronym)}
                            className="text-[10px] px-2.5 py-1 rounded-md bg-teal text-white hover:bg-teal-dark transition font-semibold"
                            title={t.replaceAllTooltip}
                          >
                            {t.replaceAll}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Guide/Help Box */}
      <div className="p-3 bg-slate-50 border-t border-border rounded-b-xl text-[10px] text-muted leading-relaxed">
        <strong className="text-secondary block mb-0.5">{t.helpTitle}</strong>
        {t.helpText}
      </div>
    </div>
  );
}
