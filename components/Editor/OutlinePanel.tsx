'use client';

import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n/hooks';

interface OutlineItem {
  text: string;
  level: number;
  pos: number;
}

/** Sections offered by the skeleton generator; skipped when already present. */
const SKELETON_SECTIONS = [
  'Introduction / Giriş',
  'Methods / Yöntem',
  'Results / Bulgular',
  'Discussion / Tartışma',
  'Conclusion / Sonuç',
  'References / Kaynaklar',
];

function collectHeadings(editor: any): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'heading') {
      items.push({ text: node.textContent.trim(), level: node.attrs.level ?? 1, pos });
    }
    return true;
  });
  return items;
}

/** Heading whose position precedes the current selection — used as "active". */
function activeHeadingPos(editor: any, items: OutlineItem[]): number | null {
  const from = editor.state.selection.from;
  let current: number | null = null;
  for (const item of items) {
    if (item.pos <= from) current = item.pos;
    else break;
  }
  return current;
}

/**
 * Slide-out outline for the manuscript editor. Rendered absolutely inside the
 * editor card: closed it occupies no layout space; a thin hover strip on the
 * left edge reveals the toggle. Read-only over the TipTap doc apart from the
 * two explicit insert actions (skeleton, TOC block).
 */
export function OutlinePanel({ editor }: { editor: any }): JSX.Element | null {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => {
      const next = collectHeadings(editor);
      setItems(next);
      setActivePos(activeHeadingPos(editor, next));
    };
    const onUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(refresh, 300);
    };
    refresh();
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', onUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor]);

  if (!editor) return null;

  const tr = lang === 'tr';
  const visible = open || pinned;

  const jumpTo = (pos: number) => {
    editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();
    if (!pinned) setOpen(false);
  };

  const insertSkeleton = () => {
    const existing = new Set(items.map((i) => i.text.toLowerCase().replace(/^[\d.\s]+/, '')));
    const content: any[] = [];
    for (const label of SKELETON_SECTIONS) {
      const [en, trLabel] = label.split('/').map((s) => s.trim());
      const already = existing.has(en.toLowerCase()) || existing.has(trLabel.toLowerCase());
      if (already) continue;
      content.push(
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: tr ? trLabel : en }] },
        { type: 'paragraph' }
      );
    }
    if (content.length === 0) return;
    const end = editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(end, content).run();
  };

  const insertToc = () => {
    if (items.length === 0) return;
    const content: any[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: tr ? 'İçindekiler' : 'Contents' }],
      },
      ...items.map((item) => ({
        type: 'paragraph',
        content: [
          { type: 'text', text: `${' '.repeat(Math.max(0, item.level - 1))}${item.text}` },
        ],
      })),
    ];
    editor.chain().focus().insertContentAt(0, content).run();
  };

  return (
    <>
      {/* Invisible hover strip on the left edge revealing the toggle. */}
      {!visible && (
        <div
          className="absolute inset-y-0 left-0 w-4 z-20"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={tr ? 'Başlıklar / İçindekiler' : 'Headings / Outline'}
            className={`absolute top-1/2 -translate-y-1/2 left-0 rounded-r-lg border border-l-0 border-border bg-white shadow-md px-1 py-3 text-xs text-secondary hover:text-teal hover:border-teal transition-opacity duration-150 ${
              hover ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ writingMode: 'vertical-rl' }}
          >
            ☰ {tr ? 'Başlıklar' : 'Outline'}
          </button>
        </div>
      )}

      {visible && (
        <>
          {!pinned && <div className="absolute inset-0 z-20" onClick={() => setOpen(false)} />}
          <div className="absolute inset-y-0 left-0 z-30 w-60 bg-white border-r border-border shadow-lg flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-bold text-primary">
                {tr ? 'Başlıklar' : 'Outline'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPinned((v) => !v)}
                  title={tr ? (pinned ? 'Sabitlemeyi kaldır' : 'Sabitle') : pinned ? 'Unpin' : 'Pin'}
                  className={`p-1 rounded text-xs ${pinned ? 'bg-teal-bg text-teal' : 'text-secondary hover:bg-slate-100'}`}
                >
                  📌
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinned(false);
                    setOpen(false);
                  }}
                  title={tr ? 'Kapat' : 'Close'}
                  className="p-1 rounded text-xs text-secondary hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex gap-1 px-2 py-1.5 border-b border-border">
              <button
                type="button"
                onClick={insertSkeleton}
                className="flex-1 text-[11px] font-medium px-1.5 py-1 rounded border border-border text-secondary hover:text-teal hover:border-teal"
                title={
                  tr
                    ? 'Eksik IMRAD bölüm başlıklarını sona ekler'
                    : 'Appends missing IMRAD section headings'
                }
              >
                + {tr ? 'Şablon' : 'Skeleton'}
              </button>
              <button
                type="button"
                onClick={insertToc}
                disabled={items.length === 0}
                className="flex-1 text-[11px] font-medium px-1.5 py-1 rounded border border-border text-secondary hover:text-teal hover:border-teal disabled:opacity-40 disabled:hover:text-secondary disabled:hover:border-border"
                title={
                  tr
                    ? 'Başlıklardan belge başına içindekiler bloğu üretir'
                    : 'Inserts a contents block at the top from headings'
                }
              >
                ¶ {tr ? 'İçindekiler' : 'Contents'}
              </button>
            </div>

            <div className="flex-1 overflow-auto py-1">
              {items.length === 0 && (
                <p className="px-3 py-2 text-[11px] text-muted">
                  {tr ? 'Henüz başlık yok.' : 'No headings yet.'}
                </p>
              )}
              {items.map((item) => (
                <button
                  key={item.pos}
                  type="button"
                  onClick={() => jumpTo(item.pos)}
                  className={`block w-full text-left text-xs px-3 py-1 truncate hover:bg-teal-bg hover:text-teal ${
                    item.pos === activePos ? 'bg-teal-bg text-teal font-semibold' : 'text-primary'
                  }`}
                  style={{ paddingLeft: `${12 + (item.level - 1) * 12}px` }}
                  title={item.text}
                >
                  {item.text || (tr ? '(boş başlık)' : '(empty heading)')}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
