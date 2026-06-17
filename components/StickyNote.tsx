'use client';

import { useState, useEffect, useRef } from 'react';
import { useLang } from '@/lib/i18n/hooks';

export function StickyNote(): JSX.Element {
  const { t } = useLang();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('arted_sticky_note');
    if (saved) {
      setContent(saved);
    }
  }, []);

  // Save to localStorage when content changes
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('arted_sticky_note', content);
    }
  }, [content, isMounted]);

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!isMounted) return <div className="w-8 h-8" />; // Placeholder to avoid hydration mismatch

  return (
    <div className="relative z-[80]" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`text-[10px] border border-border/85 rounded px-1.5 py-0.5 transition-colors font-medium ${
          isOpen ? 'bg-teal-bg text-teal font-semibold border-teal/30' : 'bg-white text-secondary hover:text-primary hover:bg-slate-50'
        }`}
        title={t('note_sticky')}
      >
        {t('note_sticky')}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-80 sm:w-96 h-80 bg-surface border border-border shadow-xl rounded-lg flex flex-col z-[100] animate-in fade-in slide-in-from-top-2 resize overflow-auto min-w-[220px] min-h-[160px] max-w-[90vw] max-h-[80vh]">
          <div className="flex justify-between items-center px-3 py-2 border-b border-border bg-slate-50/50 rounded-t-lg">
            <span className="text-xs font-bold text-primary">{t('note_sticky')}</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted hover:text-primary transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="flex-1 p-2">
            <textarea
              className="w-full h-full resize-none bg-transparent outline-none text-sm text-primary placeholder:text-muted/50 p-1 font-mono"
              placeholder={t('note_placeholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  );
}
