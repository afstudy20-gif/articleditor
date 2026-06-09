'use client';

import { useState, useRef, useMemo } from 'react';
import type { Ref } from '@/store/types';

interface SupplementaryPanelProps {
  value: string;
  onChange: (val: string) => void;
  refs: Ref[];
  refOrder: Map<string, number>;
  onClose: () => void;
  lang: 'tr' | 'en';
}

const localizations = {
  tr: {
    title: 'Ek Materyaller',
    placeholder: 'Ek metotlar, tablolar, şekiller veya diğer destekleyici bilgileri buraya yazın...',
    copy: 'Kopyala',
    download: 'İndir (.txt)',
    copied: 'Kopyalandı!',
    fontTimes: 'Times New Roman 12pt (1.5 satır aralığı)',
    fontDefault: 'Varsayılan Yazı Tipi',
    citeTitle: 'Atıf Ekle',
    searchRefs: 'Referanslarda ara...',
    noRefs: 'Kütüphanede referans bulunamadı.',
    help: 'Aşağıdaki referansların yanındaki ➕ butonuna tıklayarak metne atıf (örn: [1]) ekleyebilirsiniz.'
  },
  en: {
    title: 'Supplementary Materials',
    placeholder: 'Write supplementary methods, tables, figures, or other supporting info here...',
    copy: 'Copy',
    download: 'Download (.txt)',
    copied: 'Copied!',
    fontTimes: 'Times New Roman 12pt (1.5 line spacing)',
    fontDefault: 'Default Font',
    citeTitle: 'Insert Citation',
    searchRefs: 'Search references...',
    noRefs: 'No references found in library.',
    help: 'Click the ➕ button next to any reference below to insert a citation (e.g. [1]) into the text.'
  }
};

export function SupplementaryPanel({
  value,
  onChange,
  refs,
  refOrder,
  onClose,
  lang
}: SupplementaryPanelProps): JSX.Element {
  const t = localizations[lang] || localizations.en;
  const [copied, setCopied] = useState(false);
  const [useTimes, setUseTimes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Compute word and character count
  const stats = useMemo(() => {
    const chars = value.length;
    const words = value.trim() === '' ? 0 : value.trim().split(/\s+/).length;
    return { chars, words };
  }, [value]);

  // Filter references based on search
  const filteredRefs = useMemo(() => {
    if (!searchQuery.trim()) return refs;
    const q = searchQuery.toLowerCase();
    return refs.filter((r) => {
      const titleMatch = r.title?.toLowerCase().includes(q);
      const authorMatch = r.authors?.some(
        (a) => a.family?.toLowerCase().includes(q) || a.given?.toLowerCase().includes(q) || a.literal?.toLowerCase().includes(q)
      );
      return titleMatch || authorMatch;
    });
  }, [refs, searchQuery]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplementary-materials.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleInsertCitation = (refId: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Determine the citation number
    const num = refOrder.get(refId) ?? (refs.findIndex((r) => r.id === refId) + 1);
    const citationText = `[${num}]`;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const newValue = text.substring(0, start) + citationText + text.substring(end);
    onChange(newValue);

    // Reset selection range to be right after the inserted citation
    setTimeout(() => {
      textarea.focus();
      const newPos = start + citationText.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className="card flex flex-col h-full bg-white border border-border rounded-xl shadow-lg">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-slate-50 rounded-t-xl">
        <div className="flex items-center gap-1.5">
          <span className="text-base">📎</span>
          <h3 className="font-bold text-primary text-sm">{t.title}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-primary text-xl font-semibold leading-none transition"
          title="Kapat"
        >
          ×
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
        {/* Style Toggle */}
        <button
          onClick={() => setUseTimes(!useTimes)}
          className={`text-[10px] px-2 py-1 rounded border transition font-medium ${
            useTimes
              ? 'bg-teal border-teal text-white'
              : 'border-border bg-white text-secondary hover:bg-slate-50'
          }`}
        >
          ✍️ {useTimes ? t.fontDefault : t.fontTimes}
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            disabled={!value.trim()}
            className="text-[10px] px-2 py-1 rounded border border-border bg-white text-secondary hover:text-teal hover:border-teal disabled:opacity-40 disabled:hover:text-secondary disabled:hover:border-border transition"
          >
            📋 {copied ? t.copied : t.copy}
          </button>
          <button
            onClick={handleDownload}
            disabled={!value.trim()}
            className="text-[10px] px-2 py-1 rounded border border-border bg-white text-secondary hover:text-teal hover:border-teal disabled:opacity-40 disabled:hover:text-secondary disabled:hover:border-border transition"
          >
            📥 {t.download}
          </button>
        </div>
      </div>

      {/* Editor & Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-3 flex-1 flex flex-col min-h-0">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t.placeholder}
            className="w-full flex-1 p-3 border border-border rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-teal/40 focus:border-teal transition text-sm text-primary leading-relaxed bg-white shadow-inner"
            style={
              useTimes
                ? {
                    fontFamily: "'Times New Roman', Times, serif",
                    fontSize: '12pt',
                    lineHeight: '1.5',
                    textAlign: 'justify'
                  }
                : undefined
            }
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted px-1">
            <span>{stats.words} words</span>
            <span>{stats.chars} characters</span>
          </div>
        </div>

        {/* References Selector Section */}
        <div className="border-t border-border flex flex-col min-h-[160px] max-h-[220px] bg-slate-50 rounded-b-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">{t.citeTitle}</span>
            <span className="text-[9px] text-muted italic">{t.help}</span>
          </div>

          <div className="px-3 py-1.5 border-b border-border">
            <input
              type="text"
              placeholder={t.searchRefs}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-border rounded focus:outline-none focus:border-teal bg-white"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredRefs.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted italic">{t.noRefs}</p>
            ) : (
              filteredRefs.map((ref) => {
                const refNum = refOrder.get(ref.id) ?? (refs.findIndex((r) => r.id === ref.id) + 1);
                const authorsStr = ref.authors
                  ?.map((a) => a.family || a.literal || '')
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div
                    key={ref.id}
                    className="px-3 py-1.5 border-b border-border/50 hover:bg-slate-100 flex items-center justify-between gap-2 text-xs transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-primary truncate">
                        [{refNum}] {ref.title || 'Untitled Reference'}
                      </div>
                      {authorsStr && <div className="text-[10px] text-muted truncate">{authorsStr}</div>}
                    </div>
                    <button
                      onClick={() => handleInsertCitation(ref.id)}
                      className="p-1 text-teal hover:bg-teal/10 rounded font-bold transition text-xs shrink-0"
                      title={t.citeTitle}
                    >
                      ➕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
