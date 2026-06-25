'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ProjectTable, Ref } from '@/store/types';
import type { ImportParagraph } from '@/lib/editor/import-rich';
import { useLang } from '@/lib/i18n/hooks';

export type ImportPreview = {
  paragraphs: ImportParagraph[];
  bodyText: string;
  refs: Ref[];
  markerCount: number;
  abstractText?: string;
  keywords?: string[];
  tables?: ProjectTable[];
  /** Number of in-text citations for each reference (index 0 = reference #1). */
  citationCounts: number[];
} | null;

type Props = {
  onClose: () => void;
  docxInputRef: RefObject<HTMLInputElement | null>;
  onSelectDocx: (file: File) => Promise<void>;
  pasteText: string;
  setPasteText: (v: string) => void;
  onProcessPaste: () => void;
  onPasteHtml?: (html: string, plain: string) => void;
  preview: ImportPreview;
  onApply: (replace: boolean, selectedIndices?: number[]) => void;
  showAddButton?: boolean;
  replaceLabel?: string;
};

export function DocImportModal({
  onClose,
  docxInputRef,
  onSelectDocx,
  pasteText,
  setPasteText,
  onProcessPaste,
  onPasteHtml,
  preview,
  onApply,
  showAddButton = true,
  replaceLabel,
}: Props): JSX.Element {
  const { lang } = useLang();
  const [selectedRefs, setSelectedRefs] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (preview) {
      // Default: select references that have at least one in-text citation.
      const defaults = new Set<number>();
      preview.citationCounts.forEach((count, idx) => {
        if (count > 0) defaults.add(idx);
      });
      if (defaults.size === 0 && preview.refs.length > 0) {
        preview.refs.forEach((_, idx) => defaults.add(idx));
      }
      setSelectedRefs(defaults);
    } else {
      setSelectedRefs(new Set());
    }
  }, [preview]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-primary">{lang === 'tr' ? 'İçeri aktar' : 'Import'}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!preview && (
            <>
              <div>
                <p className="text-sm text-muted mb-2">
                  Word belgesi yükle veya metin yapıştır. Belge tarayıcıda işlenir, sunucuya yüklenmez.
                </p>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => docxInputRef.current?.click()}
                >
                  .docx seç…
                </button>
                <input
                  ref={docxInputRef}
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) await onSelectDocx(f);
                  }}
                />
              </div>
              <div>
                <label className="tool-label block mb-1">{lang === 'tr' ? 'Veya metin yapıştır' : 'Or paste text'}</label>
                <textarea
                  className="w-full min-h-[200px] font-mono text-sm border border-border rounded-lg p-3 outline-none focus:border-teal"
                  placeholder={lang === 'tr' ? 'Belge metnini yapıştır. Kaynakça otomatik algılanır.' : 'Paste the document text. The bibliography is detected automatically.'}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  onPaste={(e) => {
                    const html = e.clipboardData.getData('text/html');
                    const plain = e.clipboardData.getData('text/plain');
                    if (html && onPasteHtml) {
                      onPasteHtml(html, plain);
                    }
                  }}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    className="btn-primary text-sm"
                    onClick={onProcessPaste}
                    disabled={pasteText.trim().length < 20}
                  >
                    Önizle
                  </button>
                </div>
              </div>
            </>
          )}

          {preview && (
            <>
              <div className="text-sm text-secondary">
                <strong>{preview.refs.length}</strong>{' '}
                {lang === 'tr' ? 'referans,' : 'references,'}{' '}
                <strong>{preview.markerCount}</strong>{' '}
                {lang === 'tr' ? 'atıf işareti bulundu.' : 'citation markers found.'}
              </div>
              <div className="card p-3 max-h-[200px] overflow-auto bg-slate-50 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {preview.bodyText.slice(0, 1500)}
                {preview.bodyText.length > 1500 ? '\n…' : ''}
              </div>
              <div className="text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <span className="font-medium text-secondary">
                    {lang === 'tr' ? 'Algılanan referanslar' : 'Detected references'} ({preview.refs.length})
                  </span>
                  <div className="flex gap-3">
                    <button
                      className="text-teal hover:underline"
                      onClick={() => setSelectedRefs(new Set(preview.refs.map((_, i) => i)))}
                    >
                      {lang === 'tr' ? 'Tümünü seç' : 'Select all'}
                    </button>
                    <button
                      className="text-teal hover:underline"
                      onClick={() => {
                        const next = new Set<number>();
                        preview.citationCounts.forEach((count, idx) => {
                          if (count > 0) next.add(idx);
                        });
                        setSelectedRefs(next);
                      }}
                    >
                      {lang === 'tr' ? 'Sadece atıf yapılanlar' : 'Only cited'}
                    </button>
                    <button
                      className="text-teal hover:underline"
                      onClick={() => setSelectedRefs(new Set())}
                    >
                      {lang === 'tr' ? 'Hiçbirini seçme' : 'Select none'}
                    </button>
                  </div>
                </div>
                <ol className="max-h-[240px] overflow-auto border border-border rounded-lg p-2 space-y-1">
                  {preview.refs.map((r, i) => {
                    const refId = `import-ref-${i}`;
                    const citationCount = preview.citationCounts[i] || 0;
                    return (
                      <li key={i} className="flex gap-2 items-start">
                        <input
                          id={refId}
                          type="checkbox"
                          checked={selectedRefs.has(i)}
                          onChange={(e) => {
                            const next = new Set(selectedRefs);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            setSelectedRefs(next);
                          }}
                          className="mt-1 shrink-0"
                        />
                        <label htmlFor={refId} className="flex-1 text-secondary cursor-pointer">
                          <span className="font-bold">{i + 1}.</span>{' '}
                          <span className="font-mono text-[11px]">
                            {r.raw || r.title || (lang === 'tr' ? '(boş)' : '(empty)')}
                          </span>
                          <span className="ml-2 text-[10px] text-muted">
                            {citationCount} {lang === 'tr' ? 'atıf' : 'cites'}
                          </span>
                          {citationCount === 0 && selectedRefs.has(i) && (
                            <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                              {lang === 'tr' ? 'metinde yok, kütüphaneye eklenir' : 'not cited, library only'}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="flex gap-2 justify-end pt-2 border-t border-border">
                <button className="btn-secondary text-sm" onClick={onClose}>
                  {lang === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                {showAddButton && (
                  <button
                    className="btn-secondary text-sm"
                    onClick={() => onApply(false, Array.from(selectedRefs).sort((a, b) => a - b))}
                    disabled={selectedRefs.size === 0}
                  >
                    {lang === 'tr' ? 'Mevcut çalışmaya ekle' : 'Add to current'}
                  </button>
                )}
                <button
                  className="btn-primary text-sm"
                  onClick={() => onApply(true, Array.from(selectedRefs).sort((a, b) => a - b))}
                  disabled={selectedRefs.size === 0}
                >
                  {replaceLabel ?? (lang === 'tr' ? 'Değiştir' : 'Replace')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
