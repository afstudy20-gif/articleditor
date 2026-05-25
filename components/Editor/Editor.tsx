'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { CitationWithView } from './extensions/citation-view';
import type { Ref } from '@/store/types';

type Props = {
  initialContent?: unknown;
  refs: Ref[];
  onChange: (json: unknown, plainText: string) => void;
  onInsertRequest?: () => void;
  onReady?: (editor: any) => void;
  onAIReview?: () => void;
};

const SECTION_PRESETS: Array<{ label: string; level: 1 | 2 | 3 }> = [
  { label: 'Abstract / Özet', level: 2 },
  { label: 'Background / Arka Plan', level: 2 },
  { label: 'Introduction / Giriş', level: 2 },
  { label: 'Methods / Yöntem', level: 2 },
  { label: 'Results / Bulgular', level: 2 },
  { label: 'Discussion / Tartışma', level: 2 },
  { label: 'Conclusion / Sonuç', level: 2 },
  { label: 'Limitations / Kısıtlılıklar', level: 2 },
  { label: 'Acknowledgments / Teşekkür', level: 2 },
  { label: 'Funding / Finansman', level: 2 },
  { label: 'Conflict of Interest / Çıkar Çatışması', level: 2 },
  { label: 'Ethics / Etik', level: 2 },
  { label: 'Author Contributions / Yazar Katkıları', level: 2 },
  { label: 'Data Availability / Veri Erişimi', level: 2 },
  { label: 'References / Kaynaklar', level: 2 },
];

function computeRefOrder(json: any, refIds: string[]): string[] {
  const seen: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === 'citation') {
      const ids: string[] = n.attrs?.refIds ?? [];
      for (const id of ids) {
        if (!seen.includes(id)) seen.push(id);
      }
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(json);
  // Append refs that weren't cited yet, preserving panel order.
  for (const id of refIds) if (!seen.includes(id)) seen.push(id);
  return seen;
}

export function ArticleEditor({ initialContent, refs, onChange, onInsertRequest, onReady, onAIReview }: Props) {
  const refsById = useMemo(() => {
    const m = new Map<string, Ref>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);
  const [, setTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Makalenizi yazmaya başlayın…' }),
      Link.configure({ openOnClick: false }),
      CitationWithView,
    ],
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    onUpdate({ editor }) {
      const json = editor.getJSON();
      onChange(json, editor.getText());
      // Recompute citation numbers
      const order = computeRefOrder(json, refs.map((r) => r.id));
      const map = new Map<string, number>();
      order.forEach((id, i) => map.set(id, i + 1));
      window.__enrRefOrder = map;
      window.__enrRefs = refsById;
      setTick((t) => t + 1);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const json = editor.getJSON();
    const order = computeRefOrder(json, refs.map((r) => r.id));
    const map = new Map<string, number>();
    order.forEach((id, i) => map.set(id, i + 1));
    window.__enrRefOrder = map;
    window.__enrRefs = refsById;
    setTick((t) => t + 1);
  }, [editor, refs, refsById]);

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  const insertBtnRef = useRef<HTMLButtonElement>(null);

  if (!editor) return <div className="card p-6 text-muted">Editör yükleniyor…</div>;

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center gap-1 border-b border-border p-2 flex-wrap text-sm">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
          B
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
          <span className="italic">I</span>
        </ToolbarButton>
        <Sep />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
        >
          H3
        </ToolbarButton>
        <Sep />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        >
          • Liste
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
        >
          1. Liste
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
        >
          “”
        </ToolbarButton>
        <Sep />
        <SectionInserter editor={editor} />
        <Sep />
        <button
          ref={insertBtnRef}
          onClick={() => onInsertRequest?.()}
          className="px-3 py-1 rounded-md bg-teal text-white text-xs font-semibold hover:bg-teal-dark"
          title="Sağdan kütüphaneden checkbox ile seçili referansları cursor konumuna ekle. Birden fazla seçilirse birleşik atıf (örn. [1,2,3]) yerleşir."
        >
          + Atıf ekle
        </button>
        {onAIReview && (
          <>
            <Sep />
            <button
              onClick={() => onAIReview()}
              className="px-3 py-1 rounded-md bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600"
              title="Seçili metni (veya yoksa tüm paragrafı) AI ile eleştir: akademik clarity, tone, structure, evidence, grammar geri bildirimi."
            >
              🔍 AI Eleştir
            </button>
          </>
        )}
      </div>
      <EditorContent
        editor={editor}
        className="prose max-w-none p-6 flex-1 min-h-0 overflow-auto focus-within:outline-none [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold"
      />
    </div>
  );
}

function SectionInserter({ editor }: { editor: any }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-md text-xs font-semibold text-secondary hover:bg-slate-100"
      >
        + Bölüm ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg w-64 max-h-[400px] overflow-auto py-1">
            {SECTION_PRESETS.map((s) => (
              <button
                key={s.label}
                onClick={() => {
                  const heading = s.label.split('/')[0].trim();
                  editor
                    .chain()
                    .focus()
                    .insertContent([
                      { type: 'heading', attrs: { level: s.level }, content: [{ type: 'text', text: heading }] },
                      { type: 'paragraph' },
                    ])
                    .run();
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
        active ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="w-px h-5 bg-border mx-1" />;
}

export function tiptapToPlainTextWithMarkers(json: any, refOrder: Map<string, number>): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (n.type === 'text') {
      out.push(n.text || '');
      return;
    }
    if (n.type === 'citation') {
      const ids: string[] = n.attrs?.refIds ?? [];
      const nums = ids.map((id) => refOrder.get(id) ?? 0).filter((x) => x > 0);
      if (nums.length > 0) {
        const groups: Array<[number, number]> = [];
        const sorted = [...nums].sort((a, b) => a - b);
        let s = sorted[0];
        let p = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === p + 1) {
            p = sorted[i];
          } else {
            groups.push([s, p]);
            s = sorted[i];
            p = sorted[i];
          }
        }
        groups.push([s, p]);
        out.push(`[${groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',')}]`);
      } else {
        out.push('[?]');
      }
      return;
    }
    if (n.type === 'paragraph' || n.type === 'heading') {
      if (Array.isArray(n.content)) for (const c of n.content) walk(c);
      out.push('\n');
      return;
    }
    if (n.type === 'hardBreak') {
      out.push('\n');
      return;
    }
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(json);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export { computeRefOrder };
