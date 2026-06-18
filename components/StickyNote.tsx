'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/i18n/hooks';

export function StickyNote(): JSX.Element {
  const { t } = useLang();
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
      const target = event.target as Node;
      if (
        panelRef.current
        && !panelRef.current.contains(target)
        && buttonRef.current
        && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    updatePanelPosition();

    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isOpen]);

  function updatePanelPosition(): void {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = Math.min(384, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 168);
    setPanelPosition({ top: Math.max(8, top), left });
  }

  function toggleOpen(): void {
    updatePanelPosition();
    setIsOpen((open) => !open);
  }

  if (!isMounted) return <div className="w-8 h-8" />; // Placeholder to avoid hydration mismatch

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`text-[10px] border border-border/85 rounded px-1.5 py-0.5 transition-colors font-medium ${
          isOpen ? 'bg-teal-bg text-teal font-semibold border-teal/30' : 'bg-white text-secondary hover:text-primary hover:bg-slate-50'
        }`}
        title={t('note_sticky')}
      >
        {t('note_sticky')}
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed w-80 sm:w-96 h-80 bg-surface border border-border shadow-2xl rounded-lg flex flex-col z-[9999] animate-in fade-in slide-in-from-top-2 resize overflow-auto min-w-[220px] min-h-[160px] max-w-[calc(100vw-1rem)] max-h-[80vh]"
          style={{ top: panelPosition.top, left: panelPosition.left }}
        >
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
        </div>,
        document.body,
      )}
    </>
  );
}
