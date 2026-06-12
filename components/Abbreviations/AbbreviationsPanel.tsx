'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import {
  extractAbbreviations,
  findSuggestions,
  replaceTextInEditor,
  type Abbreviation,
  type AbbrSuggestion
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
    dictTitle: 'Tanımlı Kısaltmalar',
    suggsTitle: 'İyileştirme Önerileri',
    helpTitle: 'Nasıl Tanımlanır?',
    helpText: 'Kısaltmaları metinde ilk kez kullanırken açık hali ve parantez içinde kısaltması şeklinde yazın (Örn: Deep Neural Network (DNN)). Sistem bunu otomatik olarak algılayacaktır.',
    occurrences: 'kullanım',
    noAbbrs: 'Metinde henüz kısaltma tanımlanmadı.',
    noSuggs: 'Kısaltma kullanım hatası bulunmadı. Harika!',
    replace: 'Değiştir',
    replaceAll: 'Hepsini Değiştir',
    searchAbbrs: 'Kısaltmalarda ara...',
    insertTooltip: 'Metne ekle',
    replaceTooltip: 'Kısaltma ile değiştir',
    replaceAllTooltip: 'Metindeki tümünü kısaltma ile değiştir',
    suggestLabel: 'yerine kısaltmasını kullanın:'
  },
  en: {
    title: 'Abbreviation Tracker',
    tabDict: 'Dictionary',
    tabSuggs: 'Suggestions',
    dictTitle: 'Defined Abbreviations',
    suggsTitle: 'Usage Suggestions',
    helpTitle: 'How to define?',
    helpText: 'Define abbreviations at their first occurrence by writing the full term followed by the acronym in parentheses (e.g. Deep Neural Network (DNN)). The system will detect it automatically.',
    occurrences: 'occurrences',
    noAbbrs: 'No abbreviations defined in the text yet.',
    noSuggs: 'No abbreviation usage errors found. Excellent!',
    replace: 'Replace',
    replaceAll: 'Replace All',
    searchAbbrs: 'Search abbreviations...',
    insertTooltip: 'Insert to text',
    replaceTooltip: 'Replace with acronym',
    replaceAllTooltip: 'Replace all instances with acronym',
    suggestLabel: 'use acronym instead of full term:'
  }
};

export function AbbreviationsPanel({ editor, onClose, lang }: AbbreviationsPanelProps): JSX.Element {
  const t = localizations[lang] || localizations.en;
  const [activeTab, setActiveTab] = useState<'dict' | 'suggs'>('dict');
  const [searchQuery, setSearchQuery] = useState('');
  const [abbrList, setAbbrList] = useState<Abbreviation[]>([]);
  const [suggestions, setSuggestions] = useState<AbbrSuggestion[]>([]);

  // Scan editor text dynamically on transactions
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const update = () => {
      const text = editor.getText();
      const list = extractAbbreviations(text);
      setAbbrList(list);
      const warns = findSuggestions(text, list);
      setSuggestions(warns);
    };

    update();
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  // Filter dictionary based on search query
  const filteredAbbrs = useMemo(() => {
    if (!searchQuery.trim()) return abbrList;
    const q = searchQuery.toLowerCase();
    return abbrList.filter(
      (a) => a.acronym.toLowerCase().includes(q) || a.definition.toLowerCase().includes(q)
    );
  }, [abbrList, searchQuery]);

  // Insert acronym at cursor
  const handleInsertAcronym = (acronym: string) => {
    if (!editor || editor.isDestroyed) return;
    editor.chain().focus().insertContent(acronym).run();
  };

  // Replace one full definition usage
  const handleReplaceOne = (definition: string, acronym: string) => {
    replaceTextInEditor(editor, definition, acronym, false);
  };

  // Replace all full definition usages
  const handleReplaceAll = (definition: string, acronym: string) => {
    replaceTextInEditor(editor, definition, acronym, true);
  };

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
          {t.tabDict} ({abbrList.length})
        </button>
        <button
          onClick={() => setActiveTab('suggs')}
          className={`flex-1 py-2 text-center text-xs font-semibold border-b-2 transition ${
            activeTab === 'suggs'
              ? 'border-teal text-teal bg-white font-bold'
              : 'border-transparent text-secondary hover:text-primary hover:bg-slate-100/50'
          }`}
        >
          {t.tabSuggs} ({suggestions.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-white p-3">
        {activeTab === 'dict' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            {/* Search */}
            <div>
              <input
                type="text"
                placeholder={t.searchAbbrs}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-border rounded-lg focus:outline-none focus:border-teal bg-slate-50/30"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pr-0.5 space-y-2">
              {filteredAbbrs.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted italic">{t.noAbbrs}</div>
              ) : (
                filteredAbbrs.map((a) => (
                  <div
                    key={a.acronym}
                    className="p-2.5 rounded-lg border border-border hover:border-teal/30 bg-slate-50/20 flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <strong className="text-xs text-primary font-extrabold">{a.acronym}</strong>
                        <span className="text-[10px] text-muted">
                          ({a.count} {t.occurrences})
                        </span>
                      </div>
                      <div className="text-[11px] text-secondary truncate mt-0.5" title={a.definition}>
                        {a.definition}
                      </div>
                    </div>
                    <button
                      onClick={() => handleInsertAcronym(a.acronym)}
                      className="p-1.5 text-teal hover:bg-teal/10 rounded-lg font-bold transition text-xs shrink-0 bg-white border border-border hover:border-teal/30"
                      title={t.insertTooltip}
                    >
                      ➕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'suggs' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="overflow-y-auto flex-1 pr-0.5 space-y-2.5">
              {suggestions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted italic flex flex-col items-center justify-center gap-1">
                  <span>🎉</span>
                  <span>{t.noSuggs}</span>
                </div>
              ) : (
                suggestions.map((s, idx) => (
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
