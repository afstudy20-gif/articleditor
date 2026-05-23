'use client';

import { useEffect, useRef, useState } from 'react';
import { findPluginKey } from './extensions/find-plugin';

type Props = {
  editor: any;
  onClose: () => void;
};

export function FindReplace({ editor, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndexState] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function dispatch(patch: { query?: string; caseSensitive?: boolean; wholeWord?: boolean; activeIndex?: number }): void {
    if (!editor || editor.isDestroyed) return;
    const tr = editor.view.state.tr.setMeta(findPluginKey, patch);
    editor.view.dispatch(tr);
  }

  // Read plugin state after each dispatch to refresh counters.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    dispatch({ query, caseSensitive, wholeWord, activeIndex });
    const state = findPluginKey.getState(editor.state);
    setMatchCount(state?.matches.length ?? 0);
  }, [query, caseSensitive, wholeWord]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Subscribe to editor updates to keep matchCount in sync after doc edits.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const onUpdate = (): void => {
      const state = findPluginKey.getState(editor.state);
      setMatchCount(state?.matches.length ?? 0);
      const idx = state?.options.activeIndex ?? 0;
      setActiveIndexState(idx);
    };
    editor.on('transaction', onUpdate);
    return () => {
      editor.off('transaction', onUpdate);
    };
  }, [editor]);

  function scrollToActive(): void {
    if (!editor || editor.isDestroyed) return;
    const state = findPluginKey.getState(editor.state);
    if (!state || state.matches.length === 0) return;
    const m = state.matches[state.options.activeIndex];
    if (!m) return;
    const view = editor.view;
    // Use coordsAtPos to scroll
    try {
      const coords = view.coordsAtPos(m.from);
      const editorEl = view.dom as HTMLElement;
      const editorRect = editorEl.getBoundingClientRect();
      const scroll = editorEl.scrollTop + (coords.top - editorRect.top) - 120;
      editorEl.scrollTo({ top: Math.max(0, scroll), behavior: 'smooth' });
    } catch {
      // ignore
    }
  }

  function next(): void {
    if (matchCount === 0) return;
    const newIdx = (activeIndex + 1) % matchCount;
    setActiveIndexState(newIdx);
    dispatch({ activeIndex: newIdx });
    setTimeout(scrollToActive, 30);
  }
  function prev(): void {
    if (matchCount === 0) return;
    const newIdx = (activeIndex - 1 + matchCount) % matchCount;
    setActiveIndexState(newIdx);
    dispatch({ activeIndex: newIdx });
    setTimeout(scrollToActive, 30);
  }

  function replaceOne(): void {
    if (!editor || editor.isDestroyed || matchCount === 0) return;
    const state = findPluginKey.getState(editor.state);
    if (!state) return;
    const m = state.matches[state.options.activeIndex];
    if (!m) return;
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).insertContent(replaceText).run();
    // Re-trigger compute after edit; transaction event will refresh state
    setTimeout(() => {
      dispatch({ activeIndex: Math.min(activeIndex, Math.max(0, matchCount - 2)) });
      setTimeout(scrollToActive, 30);
    }, 30);
  }

  function replaceAll(): void {
    if (!editor || editor.isDestroyed || !query) return;
    const state = findPluginKey.getState(editor.state);
    if (!state || state.matches.length === 0) return;
    // Replace from last to first to keep positions valid
    const matches = [...state.matches].sort((a, b) => b.from - a.from);
    let count = 0;
    editor
      .chain()
      .focus()
      .command(({ tr }: any) => {
        for (const m of matches) {
          tr.replaceWith(m.from, m.to, replaceText ? editor.schema.text(replaceText) : null);
          count++;
        }
        return true;
      })
      .run();
    setTimeout(() => {
      dispatch({ activeIndex: 0 });
      alert(`${count} eşleşme değiştirildi.`);
    }, 30);
  }

  function handleKey(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    }
  }

  return (
    <div className="fixed top-16 right-4 z-50 bg-surface border border-border rounded-lg shadow-xl w-[380px] p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-primary">
          {showReplace ? 'Bul ve Değiştir' : 'Bul'}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowReplace((v) => !v)}
            className="text-xs text-teal hover:underline px-1"
            title="Değiştir kısmını aç/kapat"
          >
            {showReplace ? 'Sadece bul' : 'Değiştir'}
          </button>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary text-lg leading-none px-1"
            title="Kapat (ESC)"
          >
            ×
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Aranan metin"
            className="flex-1 border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:border-teal"
          />
          <span className="text-xs text-muted px-1.5 min-w-[60px] text-center">
            {matchCount === 0 ? '0/0' : `${activeIndex + 1}/${matchCount}`}
          </span>
          <button
            onClick={prev}
            disabled={matchCount === 0}
            className="px-2 py-1 border border-border rounded hover:bg-slate-100 disabled:opacity-40"
            title="Önceki (Shift+Enter)"
          >
            ↑
          </button>
          <button
            onClick={next}
            disabled={matchCount === 0}
            className="px-2 py-1 border border-border rounded hover:bg-slate-100 disabled:opacity-40"
            title="Sonraki (Enter)"
          >
            ↓
          </button>
        </div>

        {showReplace && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Yeni metin"
              className="flex-1 border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:border-teal"
            />
            <button
              onClick={replaceOne}
              disabled={matchCount === 0}
              className="px-2 py-1 border border-border rounded text-xs hover:bg-teal-bg hover:text-teal disabled:opacity-40"
              title="Bunu değiştir"
            >
              Değiştir
            </button>
            <button
              onClick={replaceAll}
              disabled={matchCount === 0}
              className="px-2 py-1 border border-border rounded text-xs hover:bg-teal-bg hover:text-teal disabled:opacity-40"
              title="Tümünü değiştir"
            >
              Tümü
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="accent-teal"
            />
            Aa (büyük/küçük)
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
              className="accent-teal"
            />
            Tam kelime
          </label>
        </div>
      </div>
    </div>
  );
}
