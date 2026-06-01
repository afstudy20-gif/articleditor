'use client';

import { useEffect, useState } from 'react';

interface FigureEntry {
  figId: string;
  kind: 'figure' | 'table';
  caption: string;
  pos: number;
  number: number;
}

interface FiguresPanelProps {
  editor: any;
  onClose: () => void;
  t: (k: string) => string;
}

function collect(editor: any): FigureEntry[] {
  if (!editor) return [];
  const raw: Array<{ figId: string; kind: 'figure' | 'table'; caption: string; pos: number }> = [];
  editor.state.doc.descendants((n: any, pos: number) => {
    if (n.type?.name === 'figure') {
      raw.push({
        figId: n.attrs?.figId ?? '',
        kind: (n.attrs?.kind ?? 'figure') as 'figure' | 'table',
        caption: n.attrs?.caption ?? '',
        pos,
      });
    }
    return true;
  });
  const counters: Record<string, number> = { figure: 0, table: 0 };
  return raw.map((r) => {
    counters[r.kind] += 1;
    return { ...r, number: counters[r.kind] };
  });
}

export function FiguresPanel({ editor, onClose, t }: FiguresPanelProps): JSX.Element {
  const [items, setItems] = useState<FigureEntry[]>(() => collect(editor));

  useEffect(() => {
    if (!editor) return undefined;
    const on = (): void => setItems(collect(editor));
    editor.on('update', on);
    on();
    return () => editor.off('update', on);
  }, [editor]);

  const jump = (pos: number): void => {
    editor.chain().focus().setNodeSelection(pos).scrollIntoView().run();
  };

  return (
    <div className="card flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">🖼 {t('fig_title')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {items.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">{t('fig_empty')}</p>
        )}
        {items.map((it) => (
          <div key={it.figId || it.pos} className="px-3 py-2 border-b border-border text-xs">
            <div className="font-semibold text-primary">
              {it.kind === 'table' ? t('fig_table') : t('fig_figure')} {it.number}
            </div>
            <div className="text-muted mt-0.5 line-clamp-2">
              {it.caption || <span className="italic">{t('fig_no_caption')}</span>}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <button onClick={() => jump(it.pos)} className="text-teal hover:underline">
                {t('fig_jump')}
              </button>
              <button
                onClick={() => editor.chain().focus().insertFigureRef(it.figId).run()}
                className="text-secondary hover:text-primary"
              >
                {t('fig_insert_ref')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
