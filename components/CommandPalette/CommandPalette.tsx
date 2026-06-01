'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  t: (k: string) => string;
}

export function CommandPalette({ open, onClose, commands, t }: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    const enabled = commands.filter((c) => !c.disabled);
    if (!s) return enabled;
    return enabled.filter((c) =>
      `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.group ?? ''}`.toLowerCase().includes(s),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const runAt = (i: number): void => {
    const cmd = filtered[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Preserve group order as first-seen in the filtered list.
  const groups: string[] = [];
  for (const c of filtered) {
    const g = c.group ?? '';
    if (!groups.includes(g)) groups.push(g);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('cmd_placeholder')}
          className="w-full px-4 py-3 text-sm outline-none border-b border-border"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted">{t('cmd_empty')}</div>
          )}
          {groups.map((g) => (
            <div key={g || 'ungrouped'}>
              {g && (
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-semibold">
                  {g}
                </div>
              )}
              {filtered.map((c, i) =>
                (c.group ?? '') === g ? (
                  <button
                    key={c.id}
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runAt(i)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ${
                      i === active ? 'bg-teal text-white' : 'hover:bg-slate-50 text-primary'
                    }`}
                  >
                    <span className="truncate">{c.label}</span>
                    {c.hint && (
                      <span className={`text-[10px] shrink-0 ${i === active ? 'text-white/80' : 'text-muted'}`}>
                        {c.hint}
                      </span>
                    )}
                  </button>
                ) : null,
              )}
            </div>
          ))}
        </div>
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted flex gap-3">
          <span>↑↓ {t('cmd_nav')}</span>
          <span>↵ {t('cmd_run')}</span>
          <span>esc {t('cmd_close')}</span>
        </div>
      </div>
    </div>
  );
}
