'use client';

import { useCallback, useEffect, useState } from 'react';
import { translateText } from '@/lib/pdf/translate';

type Props = {
  text: string;
  anchor: { x: number; y: number };
  canAddNote: boolean;
  onAddNote: (payload: { text: string; translation?: string }) => void;
  onClose: () => void;
};

const POPUP_W = 320;
const POPUP_H = 220;

export function SelectionPopup({ text, anchor, canAddNote, onAddNote, onClose }: Props) {
  const [translation, setTranslation] = useState('');
  const [langBadge, setLangBadge] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'manual' | 'error'>('idle');
  const [added, setAdded] = useState(false);

  const runTranslate = useCallback(
    async (sl?: string, tl?: string) => {
      setStatus('loading');
      setTranslation('');
      setLangBadge('');
      try {
        const result = await translateText(text, sl, tl);
        if (result.needsManualLang) {
          setStatus('manual');
          return;
        }
        setTranslation(result.translated);
        setLangBadge(`${result.sourceLang.toUpperCase()} → ${result.targetLang.toUpperCase()}`);
        setStatus('ok');
      } catch {
        setStatus('error');
      }
    },
    [text],
  );

  // Auto-translate when a new selection opens the popup.
  useEffect(() => {
    runTranslate();
  }, [runTranslate]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const left = Math.max(8, Math.min(anchor.x + 6, window.innerWidth - POPUP_W - 8));
  const top = Math.max(8, Math.min(anchor.y + 8, window.innerHeight - POPUP_H - 8));

  function copy() {
    navigator.clipboard?.writeText(text).then(() => onClose());
  }

  function addNote() {
    onAddNote({ text, translation: translation || undefined });
    setAdded(true);
    window.setTimeout(onClose, 700);
  }

  return (
    <div
      className="fixed z-50 flex w-80 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-xl"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs text-gray-500 line-clamp-2">{text}</p>
        <button
          onClick={onClose}
          className="-mr-1 -mt-1 rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="min-h-[3.5rem] rounded bg-gray-50 p-2 text-gray-800">
        {status === 'loading' && <span className="text-gray-400">Çevriliyor…</span>}
        {status === 'error' && <span className="text-red-600">Çeviri başarısız.</span>}
        {status === 'manual' && (
          <span className="text-gray-500">Dil algılanamadı — aşağıdan seçin.</span>
        )}
        {status === 'ok' && (
          <>
            {langBadge && (
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-teal-700">
                {langBadge}
              </span>
            )}
            {translation}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => runTranslate('en', 'tr')}
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          EN → TR
        </button>
        <button
          onClick={() => runTranslate('tr', 'en')}
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          TR → EN
        </button>
        <button
          onClick={copy}
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Kopyala
        </button>
        <button
          onClick={addNote}
          disabled={!canAddNote || added}
          title={canAddNote ? 'Seçili projeye not ekle' : 'Önce bir proje seçin'}
          className="ml-auto rounded bg-teal-700 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {added ? 'Eklendi ✓' : 'Not ekle'}
        </button>
      </div>
    </div>
  );
}
