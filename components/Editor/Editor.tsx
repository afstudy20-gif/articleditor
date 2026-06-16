'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Image } from '@tiptap/extension-image';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { CitationWithView } from './extensions/citation-view';
import { Equation } from './extensions/equation';
import { Figure, FigureRef } from './extensions/figure';
import { ManuscriptTable, ManuscriptTableView } from './extensions/manuscript-table';
import { AcademicReviewDecorations } from './extensions/academic-review-plugin';
import type { Ref } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';
import { getNextNumbering, isNumberingPrefix } from '@/lib/editor/numbering';
import { computeWritingStats } from '@/lib/stats/writing-stats';
import type { WritingStats } from '@/lib/stats/types';

type Props = {
  initialContent?: unknown;
  refs: Ref[];
  onChange: (json: unknown, plainText: string) => void;
  onInsertRequest?: () => void;
  onTableInsertRequest?: () => void;
  onReady?: (editor: any) => void;
  onAIReview?: () => void;
  onAIScore?: () => void;
  onAIEnhance?: (mode: 'expand' | 'shorten' | 'rephrase' | 'tone-academic' | 'clarity' | 'concision' | 'grammar') => void;
  onAISuggestCitation?: () => void;
  onAIDetectGaps?: () => void;
  onAICompare?: () => void;
  onAIDeepResearch?: () => void;
  onAIStructureCheck?: () => void;
  onAIManuscriptTool?: (mode: 'abstract' | 'titles' | 'discussion' | 'conclusion') => void;
  onIntegrityCheck?: () => void;
  aiDisabled?: boolean;
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
  return seen;
}

export function ArticleEditor({
  initialContent,
  refs,
  onChange,
  onInsertRequest,
  onTableInsertRequest,
  onReady,
  onAIReview,
  onAIScore,
  onAIEnhance,
  onAISuggestCitation,
  onAIDetectGaps,
  onAICompare,
  onAIDeepResearch,
  onAIStructureCheck,
  onAIManuscriptTool,
  onIntegrityCheck,
  aiDisabled,
}: Props) {
  const { t, lang } = useLang();
  const refsById = useMemo(() => {
    const m = new Map<string, Ref>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);
  const [, setTick] = useState(0);
  const [liveStats, setLiveStats] = useState<WritingStats | null>(null);
  const [lineCount, setLineCount] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: t('ed_placeholder') }),
      Link.configure({ openOnClick: false }),
      ManuscriptTable.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Superscript,
      Subscript,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Equation,
      Figure,
      FigureRef,
      CitationWithView,
      AcademicReviewDecorations,
    ],
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: 'true',
        lang: 'auto',
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;

        let hasImage = false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              hasImage = true;
              const reader = new FileReader();
              reader.onload = (e) => {
                const src = e.target?.result as string;
                if (src && view.state.schema.nodes.image) {
                  view.dispatch(
                    view.state.tr.replaceSelectionWith(
                      view.state.schema.nodes.image.create({ src })
                    )
                  );
                }
              };
              reader.readAsDataURL(file);
            }
          }
        }
        return hasImage;
      },
      handleDrop(view, event, slice, moved) {
        const files = event.dataTransfer?.files;
        if (!files) return false;

        let hasImage = false;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            hasImage = true;
            const reader = new FileReader();
            reader.onload = (e) => {
              const src = e.target?.result as string;
              if (src && view.state.schema.nodes.image) {
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src })
                  )
                );
              }
            };
            reader.readAsDataURL(file);
          }
        }
        return hasImage;
      },
    },
    onUpdate({ editor }) {
      const json = editor.getJSON();
      const blockText = editor.getText({ blockSeparator: '\n' });
      onChange(json, editor.getText());
      // Recompute citation numbers
      const order = computeRefOrder(json, refs.map((r) => r.id));
      const map = new Map<string, number>();
      order.forEach((id, i) => map.set(id, i + 1));
      window.__enrRefOrder = map;
      window.__enrRefs = refsById;
      setLiveStats(computeWritingStats(json));
      setLineCount(countLines(blockText));
      setTick((t) => t + 1);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const json = editor.getJSON();
    const blockText = editor.getText({ blockSeparator: '\n' });
    const order = computeRefOrder(json, refs.map((r) => r.id));
    const map = new Map<string, number>();
    order.forEach((id, i) => map.set(id, i + 1));
    window.__enrRefOrder = map;
    window.__enrRefs = refsById;
    setLiveStats(computeWritingStats(json));
    setLineCount(countLines(blockText));
    setTick((t) => t + 1);
  }, [editor, refs, refsById]);

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  // Placeholder text is captured once at editor creation; refresh it (and force
  // one redraw) when the UI language changes so it doesn't stay in the old
  // locale. Depend on `lang` only and guard on a real change — keeping `t` out
  // of the deps and dispatching unconditionally would loop (dispatch → render →
  // new `t` → effect → dispatch …).
  useEffect(() => {
    if (!editor) return;
    const ext = editor.extensionManager.extensions.find((e: any) => e.name === 'placeholder');
    const next = t('ed_placeholder');
    if (ext && ext.options.placeholder !== next) {
      ext.options.placeholder = next;
      editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, lang]);

  const insertBtnRef = useRef<HTMLButtonElement>(null);

  if (!editor) return <div className="card p-6 text-muted">{t('ed_loading')}</div>;

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center gap-1 border-b border-border p-2 flex-wrap text-sm">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title={t('ed_undo')}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title={t('ed_redo')}
        >
          ↷
        </ToolbarButton>
        <Sep />
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
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title={t('ed_underline')}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          active={editor.isActive('superscript')}
          title={t('ed_superscript')}
        >
          <span>X<sup>2</sup></span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          active={editor.isActive('subscript')}
          title={t('ed_subscript')}
        >
          <span>X<sub>2</sub></span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title={t('ed_strike')}
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <Sep />
        <ColorPicker editor={editor} t={t} />
        <HighlightPicker editor={editor} t={t} />
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
          title={t('ed_clear_format')}
        >
          <span className="inline-flex items-center">A<span className="text-[9px] align-super">✕</span></span>
        </ToolbarButton>
        <Sep />
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title={t('ed_align_left')}
        >
          ≡L
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title={t('ed_align_center')}
        >
          ≡C
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title={t('ed_align_right')}
        >
          ≡R
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
          title={t('ed_align_justify')}
        >
          ≡J
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title={t('ed_hr')}
        >
          ─
        </ToolbarButton>
        <Sep />
        <LinkButton editor={editor} t={t} />
        <ImageUrlButton editor={editor} t={t} />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
          title={t('ed_code_block')}
        >
          {'</>'}
        </ToolbarButton>
        <Sep />
        <TableMenu editor={editor} t={t} onInsertRequest={onTableInsertRequest} />
        <EquationButton editor={editor} t={t} />
        <SymbolPool editor={editor} t={t} />
        <Sep />
        <SectionInserter editor={editor} />
        <NumberingMenu editor={editor} t={t} />
        <Sep />
        <button
          ref={insertBtnRef}
          onClick={() => onInsertRequest?.()}
          className="px-3 py-1 rounded-md bg-teal text-white text-xs font-semibold hover:bg-teal-dark"
          title={t('ed_insert_citation_hint')}
        >
          {t('ed_insert_citation')}
        </button>
        {(onAIReview || onAIScore || onAIEnhance || onAISuggestCitation || onAIDetectGaps || onAICompare || onAIDeepResearch || onAIStructureCheck || onAIManuscriptTool) && (
          <>
            <Sep />
            <AIMenu
              disabled={aiDisabled}
              onReview={onAIReview}
              onScore={onAIScore}
              onEnhance={onAIEnhance}
              onSuggestCitation={onAISuggestCitation}
              onDetectGaps={onAIDetectGaps}
              onCompare={onAICompare}
              onDeepResearch={onAIDeepResearch}
              onStructureCheck={onAIStructureCheck}
              onManuscriptTool={onAIManuscriptTool}
              t={t}
            />
          </>
        )}
        {onIntegrityCheck && (
          <button
            onClick={onIntegrityCheck}
            className="px-2.5 py-1 rounded-md border border-violet-300 text-violet-700 text-xs font-semibold hover:bg-violet-50"
          >
            {lang === 'tr' ? 'Özgünlük' : 'Integrity'}
          </button>
        )}
      </div>
      <div
        className="flex-1 min-h-0 overflow-auto cursor-text"
        onMouseDown={(e) => {
          // Clicking padding/whitespace outside the ProseMirror content should
          // still place the cursor inside the editor (default behaviour only
          // hits ProseMirror's content boxes, which are small for empty docs).
          if (!editor || editor.isFocused) return;
          const target = e.target as HTMLElement;
          if (target.closest('.ProseMirror')) return;
          e.preventDefault();
          editor.chain().focus('end').run();
        }}
      >
        <EditorContent
          editor={editor}
          className="prose max-w-none p-2 min-h-full focus-within:outline-none [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_.ProseMirror]:min-h-[50vh]"
        />
      </div>
      {liveStats && <EditorStatusBar stats={liveStats} lines={lineCount} t={t} />}
    </div>
  );
}

function countLines(text: string): number {
  if (!text) return 0;
  const parts = text.split('\n');
  let count = 0;
  for (const part of parts) if (part.trim().length > 0) count += 1;
  return count;
}

function EditorStatusBar({
  stats,
  lines,
  t,
}: {
  stats: WritingStats;
  lines: number;
  t: (k: string) => string;
}): JSX.Element {
  const row1: Array<{ label: string; value: string }> = [
    { label: t('stats_words'), value: stats.words.toLocaleString() },
    { label: t('stats_chars'), value: stats.characters.toLocaleString() },
    { label: t('ed_status_chars_no_space'), value: stats.charactersNoSpaces.toLocaleString() },
  ];
  const row2: Array<{ label: string; value: string }> = [
    { label: t('stats_sentences'), value: stats.sentences.toLocaleString() },
    { label: t('stats_paragraphs'), value: stats.paragraphs.toLocaleString() },
    { label: t('ed_status_lines'), value: lines.toLocaleString() },
  ];
  return (
    <div className="border-t border-border px-3 py-1.5 flex flex-col gap-0.5 text-[11px] text-secondary bg-slate-50 dark:bg-slate-900/40">
      <StatusRow items={row1} />
      <StatusRow items={row2} />
    </div>
  );
}

function StatusRow({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4">
      {items.map((item, i) => (
        <span key={item.label} className="whitespace-nowrap flex items-center gap-2">
          <span>
            <span className="font-semibold text-primary">{item.label}:</span>{' '}
            <span className="text-primary">{item.value}</span>
          </span>
          {i < items.length - 1 && <span className="text-muted">|</span>}
        </span>
      ))}
    </div>
  );
}

const ENHANCE_MODES: Array<{ key: 'expand' | 'shorten' | 'rephrase' | 'tone-academic' | 'clarity' | 'concision' | 'grammar'; i18nKey: 'ed_ai_rephrase' | 'ed_ai_expand' | 'ed_ai_shorten' | 'ed_ai_academic' | 'ed_ai_clarity' | 'ed_ai_concision' | 'ed_ai_grammar'; icon: string }> = [
  { key: 'rephrase', i18nKey: 'ed_ai_rephrase', icon: '🔁' },
  { key: 'expand', i18nKey: 'ed_ai_expand', icon: '➕' },
  { key: 'shorten', i18nKey: 'ed_ai_shorten', icon: '➖' },
  { key: 'tone-academic', i18nKey: 'ed_ai_academic', icon: '🎓' },
  { key: 'clarity', i18nKey: 'ed_ai_clarity', icon: '💡' },
  { key: 'concision', i18nKey: 'ed_ai_concision', icon: '✂️' },
  { key: 'grammar', i18nKey: 'ed_ai_grammar', icon: '📝' },
];

function EnhanceMenu({
  onPick,
  disabled,
  t,
}: {
  onPick: (mode: typeof ENHANCE_MODES[number]['key']) => void;
  disabled?: boolean;
  t: (k: string) => string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="px-3 py-1 rounded-md bg-violet-500 text-white text-xs font-semibold hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed"
        title={disabled ? t('ed_ai_disabled') : t('ed_ai_enhance')}
      >
        ✏️ {t('ed_ai_enhance')} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg w-56 py-1">
            {ENHANCE_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  onPick(m.key);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
              >
                {m.icon} {t(m.i18nKey)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type EnhanceMode = typeof ENHANCE_MODES[number]['key'];

function AIMenu({
  disabled,
  onReview,
  onScore,
  onEnhance,
  onSuggestCitation,
  onDetectGaps,
  onCompare,
  onDeepResearch,
  onStructureCheck,
  onManuscriptTool,
  t,
}: {
  disabled?: boolean;
  onReview?: () => void;
  onScore?: () => void;
  onEnhance?: (mode: EnhanceMode) => void;
  onSuggestCitation?: () => void;
  onDetectGaps?: () => void;
  onCompare?: () => void;
  onDeepResearch?: () => void;
  onStructureCheck?: () => void;
  onManuscriptTool?: (mode: 'abstract' | 'titles' | 'discussion' | 'conclusion') => void;
  t: (k: string) => string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  function pick(fn?: () => void): void {
    fn?.();
    setOpen(false);
    setEnhanceOpen(false);
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="px-2.5 py-1 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-semibold hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-40 disabled:cursor-not-allowed"
        title={disabled ? t('ed_ai_disabled') : 'AI'}
      >
        ✨ AI ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg w-56 py-1">
            <MenuGroup label="Metin" />
            {onReview && (
              <MenuItem icon="🔍" label={t('ed_ai_review')} onClick={() => pick(onReview)} />
            )}
            {onEnhance && (
              <div
                onMouseEnter={() => setEnhanceOpen(true)}
                onMouseLeave={() => setEnhanceOpen(false)}
                className="relative"
              >
                <button className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal">
                  ✏️ {t('ed_ai_enhance')} ▸
                </button>
                {enhanceOpen && (
                  <div className="absolute top-0 right-full mr-1 z-30 bg-white border border-border rounded-lg shadow-lg w-44 py-1">
                    {ENHANCE_MODES.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => {
                          onEnhance(m.key);
                          setOpen(false);
                          setEnhanceOpen(false);
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
                      >
                        {m.icon} {t(m.i18nKey)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {onScore && <MenuItem icon="📊" label={t('ed_ai_score')} onClick={() => pick(onScore)} />}
            <MenuGroup label={t('ed_group_citation')} />
            {onSuggestCitation && (
              <MenuItem icon="🎯" label={t('ed_ai_suggest_citation')} onClick={() => pick(onSuggestCitation)} />
            )}
            {onDetectGaps && (
              <MenuItem icon="🩹" label={t('ed_ai_gap_detect')} onClick={() => pick(onDetectGaps)} />
            )}
            <MenuGroup label="Belge" />
            {onCompare && (
              <MenuItem icon="⚖️" label={t('ed_ai_compare')} onClick={() => pick(onCompare)} />
            )}
            {onDeepResearch && (
              <MenuItem icon="🗺️" label={t('ed_ai_deep_research')} onClick={() => pick(onDeepResearch)} />
            )}
            {onStructureCheck && (
              <MenuItem icon="🩺" label={t('ed_ai_structure_check')} onClick={() => pick(onStructureCheck)} />
            )}
            {onManuscriptTool && (
              <>
                <MenuItem icon="A" label={t('ed_ai_abstract')} onClick={() => pick(() => onManuscriptTool('abstract'))} />
                <MenuItem icon="T" label={t('ed_ai_titles')} onClick={() => pick(() => onManuscriptTool('titles'))} />
                <MenuItem icon="D" label={t('ed_ai_discussion')} onClick={() => pick(() => onManuscriptTool('discussion'))} />
                <MenuItem icon="C" label={t('ed_ai_conclusion')} onClick={() => pick(() => onManuscriptTool('conclusion'))} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
    >
      {icon} {label}
    </button>
  );
}

function MenuGroup({ label }: { label: string }): JSX.Element {
  return (
    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted font-semibold">
      {label}
    </div>
  );
}

function SectionInserter({ editor }: { editor: any }): JSX.Element {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-md text-xs font-semibold text-secondary hover:bg-slate-100"
      >
        + {lang === 'tr' ? 'Bölüm' : 'Section'} ▾
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
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
        active ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function LinkButton({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  const active = editor.isActive('link');
  return (
    <ToolbarButton
      active={active}
      title={active ? t('ed_link_remove') : t('ed_link')}
      onClick={() => {
        if (active) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        const prev = editor.getAttributes('link')?.href ?? '';
        const url = window.prompt(t('ed_link_url'), prev);
        if (url === null) return;
        const trimmed = url.trim();
        if (!trimmed) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
      }}
    >
      🔗
    </ToolbarButton>
  );
}

function ImageUrlButton({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  return (
    <ToolbarButton
      title={t('ed_image_from_url')}
      onClick={() => {
        const url = window.prompt(t('ed_image_url'), '');
        if (url === null) return;
        const trimmed = url.trim();
        if (!trimmed) return;
        editor.chain().focus().setImage({ src: trimmed }).run();
      }}
    >
      🖼
    </ToolbarButton>
  );
}

const TEXT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Gray', value: '#6b7280' },
];

const HIGHLIGHT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Purple', value: '#e9d5ff' },
  { name: 'Teal', value: '#99f6e4' },
  { name: 'Gray', value: '#e5e7eb' },
];

function ColorPicker({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const current: string | undefined = editor.getAttributes('textStyle').color;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('ed_text_color')}
        className="px-2 py-1 rounded-md text-xs font-semibold text-secondary hover:bg-slate-100 transition flex flex-col items-center leading-none"
      >
        <span style={{ color: current ?? 'inherit' }}>A</span>
        <span className="block w-4 h-1 rounded-sm mt-0.5" style={{ background: current ?? '#94a3b8' }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg p-2 w-44">
            <div className="grid grid-cols-5 gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  title={c.name}
                  onClick={() => {
                    editor.chain().focus().setColor(c.value).run();
                    setOpen(false);
                  }}
                  className={`w-6 h-6 rounded-md border transition hover:scale-110 ${
                    current === c.value ? 'border-primary ring-2 ring-teal/40' : 'border-border'
                  }`}
                  style={{ background: c.value }}
                />
              ))}
            </div>
            <button
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className="mt-2 w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 text-secondary"
            >
              ✕ {t('ed_no_color')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HighlightPicker({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const active = editor.isActive('highlight');
  const current: string | undefined = editor.getAttributes('highlight').color;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('ed_highlight')}
        className={`px-2 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
          active ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-100'
        }`}
      >
        <span
          className="inline-block w-3 h-3 rounded-sm border border-border"
          style={{ background: current ?? '#fef08a' }}
        />
        <span className="text-[11px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg p-2 w-44">
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  title={c.name}
                  onClick={() => {
                    editor.chain().focus().toggleHighlight({ color: c.value }).run();
                    setOpen(false);
                  }}
                  className={`w-7 h-6 rounded-md border transition hover:scale-110 ${
                    current === c.value ? 'border-primary ring-2 ring-teal/40' : 'border-border'
                  }`}
                  style={{ background: c.value }}
                />
              ))}
            </div>
            <button
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
              className="mt-2 w-full text-left px-2 py-1 text-xs rounded hover:bg-slate-100 text-secondary"
            >
              ✕ {t('ed_no_highlight')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function getActiveTableAttrs(editor: any) {
  if (!editor) return null;
  const { state } = editor;
  const { selection } = state;
  let tableNode: any = null;
  let tablePos = -1;
  state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'table') {
      if (selection.from >= pos && selection.to <= pos + node.nodeSize) {
        tableNode = node;
        tablePos = pos;
      }
      return false;
    }
    return true;
  });
  if (tableNode) {
    return {
      pos: tablePos,
      title: tableNode.attrs?.title ?? '',
      footnote: tableNode.attrs?.footnote ?? '',
    };
  }
  return null;
}

function TableMenu({
  editor,
  t,
  onInsertRequest,
}: {
  editor: any;
  t: (k: string) => string;
  onInsertRequest?: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const inTable = editor.isActive('table');
  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!inTable) {
            if (onInsertRequest) onInsertRequest();
            else editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          } else {
            setOpen((v) => !v);
          }
        }}
        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
          inTable ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-100'
        }`}
        title={inTable ? t('ed_insert_table') : t('ed_insert_table')}
      >
        {inTable ? '⊞ ▾' : '⊞'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg w-48 py-1">
            <button
              onClick={() => {
                const attrs = getActiveTableAttrs(editor);
                if (attrs) {
                  const newTitle = window.prompt(t('ed_table_title_prompt'), attrs.title);
                  if (newTitle !== null) {
                    const newFootnote = window.prompt(t('ed_table_footnote_prompt'), attrs.footnote);
                    if (newFootnote !== null) {
                      const node = editor.state.doc.nodeAt(attrs.pos);
                      if (node) {
                        editor.view.dispatch(
                          editor.state.tr.setNodeMarkup(attrs.pos, undefined, {
                            ...node.attrs,
                            title: newTitle,
                            footnote: newFootnote,
                          })
                        );
                      }
                    }
                  }
                }
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal font-semibold border-b border-border"
            >
              📝 {t('ed_edit_table_metadata')}
            </button>
            <button
              onClick={() => { editor.chain().focus().addColumnAfter().run(); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              {t('ed_add_col')}
            </button>
            <button
              onClick={() => { editor.chain().focus().addRowAfter().run(); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              {t('ed_add_row')}
            </button>
            <button
              onClick={() => { editor.chain().focus().deleteColumn().run(); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              {t('ed_del_col')}
            </button>
            <button
              onClick={() => { editor.chain().focus().deleteRow().run(); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal"
            >
              {t('ed_del_row')}
            </button>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => { editor.chain().focus().deleteTable().run(); setOpen(false); }}
              className="block w-full text-left px-3 py-1.5 text-xs text-red hover:bg-red-bg"
            >
              {t('ed_delete_table')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EquationButton({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  return (
    <button
      onClick={() => {
        const latex = prompt(t('eq_prompt'), '');
        if (latex) editor.chain().focus().insertEquation(latex).run();
      }}
      className="px-2.5 py-1 rounded-md text-xs font-semibold text-secondary hover:bg-slate-100 transition"
      title={t('eq_insert')}
    >
      Σ
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

function getPrecedingHeadingInfo(editor: any): { text: string; level: number } {
  const { state } = editor;
  const { selection } = state;
  const { from } = selection;

  let level = 2;
  let text = '';

  state.doc.nodesBetween(0, from, (node: any) => {
    if (node.type.name === 'heading') {
      let t = '';
      node.forEach((child: any) => {
        if (child.isText) t += child.text;
      });
      if (t.trim()) {
        text = t;
        level = node.attrs?.level ?? 2;
      }
    }
  });

  if (!text) {
    state.doc.descendants((node: any) => {
      if (node.type.name === 'heading' && !text) {
        let t = '';
        node.forEach((child: any) => {
          if (child.isText) t += child.text;
        });
        if (t.trim()) {
          text = t;
          level = node.attrs?.level ?? 2;
        }
      }
    });
  }

  return { text, level };
}

function autoNumberAllHeadings(editor: any) {
  const { state, view } = editor;
  const { tr } = state;
  const counters = [0, 0, 0];
  const headingsToUpdate: Array<{ pos: number; endPos: number; newText: string }> = [];

  state.doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'heading') {
      const level = node.attrs?.level ?? 2;
      const idx = Math.min(level - 1, 2);
      counters[idx]++;
      for (let i = idx + 1; i < counters.length; i++) {
        counters[i] = 0;
      }

      const prefix = counters.slice(0, idx + 1).join('.') + '. ';

      let text = '';
      node.forEach((child: any) => {
        if (child.isText) text += child.text;
      });

      const match = text.match(/^([0-9a-zA-Z]+(?:[\.\-\s\)]+[0-9a-zA-Z]+)*)([\.\-\s\)]+)/);
      let cleanText = text;
      if (match && isNumberingPrefix(match[1])) {
        cleanText = text.substring(match[0].length);
      }

      const newText = prefix + cleanText.trim();

      headingsToUpdate.push({
        pos: pos + 1,
        endPos: pos + node.nodeSize - 1,
        newText,
      });
    }
  });

  for (let i = headingsToUpdate.length - 1; i >= 0; i--) {
    const { pos, endPos, newText } = headingsToUpdate[i];
    tr.insertText(newText, pos, endPos);
  }

  view.dispatch(tr);
}

/* ─── Symbol Pool Data ─── */
const SYMBOL_CATEGORIES: Array<{ key: string; symbols: Array<{ char: string; name: string }> }> = [
  {
    key: 'greek',
    symbols: [
      { char: 'α', name: 'alpha' }, { char: 'β', name: 'beta' }, { char: 'γ', name: 'gamma' },
      { char: 'δ', name: 'delta' }, { char: 'ε', name: 'epsilon' }, { char: 'ζ', name: 'zeta' },
      { char: 'η', name: 'eta' }, { char: 'θ', name: 'theta' }, { char: 'ι', name: 'iota' },
      { char: 'κ', name: 'kappa' }, { char: 'λ', name: 'lambda' }, { char: 'μ', name: 'mu' },
      { char: 'ν', name: 'nu' }, { char: 'ξ', name: 'xi' }, { char: 'π', name: 'pi' },
      { char: 'ρ', name: 'rho' }, { char: 'σ', name: 'sigma' }, { char: 'τ', name: 'tau' },
      { char: 'υ', name: 'upsilon' }, { char: 'φ', name: 'phi' }, { char: 'χ', name: 'chi' },
      { char: 'ψ', name: 'psi' }, { char: 'ω', name: 'omega' },
      { char: 'Α', name: 'Alpha' }, { char: 'Β', name: 'Beta' }, { char: 'Γ', name: 'Gamma' },
      { char: 'Δ', name: 'Delta' }, { char: 'Θ', name: 'Theta' }, { char: 'Λ', name: 'Lambda' },
      { char: 'Σ', name: 'Sigma' }, { char: 'Φ', name: 'Phi' }, { char: 'Ψ', name: 'Psi' },
      { char: 'Ω', name: 'Omega' },
    ],
  },
  {
    key: 'math',
    symbols: [
      { char: '±', name: 'plus-minus' }, { char: '×', name: 'times' }, { char: '÷', name: 'divide' },
      { char: '≠', name: 'not equal' }, { char: '≈', name: 'approx' }, { char: '≤', name: 'less equal' },
      { char: '≥', name: 'greater equal' }, { char: '∞', name: 'infinity' }, { char: '√', name: 'sqrt' },
      { char: '∑', name: 'sum' }, { char: '∏', name: 'product' }, { char: '∫', name: 'integral' },
      { char: '∂', name: 'partial' }, { char: '∇', name: 'nabla' }, { char: '∈', name: 'element of' },
      { char: '∉', name: 'not element' }, { char: '⊂', name: 'subset' }, { char: '⊃', name: 'superset' },
      { char: '∪', name: 'union' }, { char: '∩', name: 'intersection' }, { char: '∅', name: 'empty set' },
      { char: '∀', name: 'for all' }, { char: '∃', name: 'exists' }, { char: '∴', name: 'therefore' },
      { char: '∵', name: 'because' }, { char: '∝', name: 'proportional' }, { char: '⊥', name: 'perpendicular' },
      { char: '∠', name: 'angle' }, { char: '≡', name: 'identical' }, { char: '∓', name: 'minus-plus' },
    ],
  },
  {
    key: 'arrows',
    symbols: [
      { char: '→', name: 'right arrow' }, { char: '←', name: 'left arrow' },
      { char: '↑', name: 'up arrow' }, { char: '↓', name: 'down arrow' },
      { char: '↔', name: 'left right' }, { char: '⇒', name: 'implies' },
      { char: '⇐', name: 'implied by' }, { char: '⇔', name: 'iff' },
      { char: '↗', name: 'upper right' }, { char: '↘', name: 'lower right' },
      { char: '↙', name: 'lower left' }, { char: '↖', name: 'upper left' },
      { char: '⟶', name: 'long right' }, { char: '⟵', name: 'long left' },
      { char: '⇀', name: 'harpoon right' }, { char: '↩', name: 'return' },
    ],
  },
  {
    key: 'sub_super',
    symbols: [
      { char: '⁰', name: 'super 0' }, { char: '¹', name: 'super 1' }, { char: '²', name: 'super 2' },
      { char: '³', name: 'super 3' }, { char: '⁴', name: 'super 4' }, { char: '⁵', name: 'super 5' },
      { char: '⁶', name: 'super 6' }, { char: '⁷', name: 'super 7' }, { char: '⁸', name: 'super 8' },
      { char: '⁹', name: 'super 9' }, { char: '⁺', name: 'super +' }, { char: '⁻', name: 'super -' },
      { char: 'ⁿ', name: 'super n' }, { char: 'ⁱ', name: 'super i' },
      { char: '₀', name: 'sub 0' }, { char: '₁', name: 'sub 1' }, { char: '₂', name: 'sub 2' },
      { char: '₃', name: 'sub 3' }, { char: '₄', name: 'sub 4' }, { char: '₅', name: 'sub 5' },
      { char: '₆', name: 'sub 6' }, { char: '₇', name: 'sub 7' }, { char: '₈', name: 'sub 8' },
      { char: '₉', name: 'sub 9' }, { char: '₊', name: 'sub +' }, { char: '₋', name: 'sub -' },
    ],
  },
  {
    key: 'units',
    symbols: [
      { char: '°', name: 'degree' }, { char: '℃', name: 'celsius' }, { char: '℉', name: 'fahrenheit' },
      { char: 'µ', name: 'micro' }, { char: 'Å', name: 'angstrom' }, { char: 'ℓ', name: 'liter' },
      { char: '℧', name: 'mho' }, { char: 'Ω', name: 'ohm' }, { char: '‰', name: 'per mille' },
      { char: '‱', name: 'per ten thousand' }, { char: '†', name: 'dagger' }, { char: '‡', name: 'double dagger' },
    ],
  },
  {
    key: 'misc',
    symbols: [
      { char: '©', name: 'copyright' }, { char: '®', name: 'registered' }, { char: '™', name: 'trademark' },
      { char: '§', name: 'section' }, { char: '¶', name: 'paragraph' }, { char: '†', name: 'dagger' },
      { char: '‡', name: 'double dagger' }, { char: '•', name: 'bullet' }, { char: '…', name: 'ellipsis' },
      { char: '—', name: 'em dash' }, { char: '–', name: 'en dash' }, { char: '′', name: 'prime' },
      { char: '″', name: 'double prime' }, { char: '‴', name: 'triple prime' },
      { char: '♀', name: 'female' }, { char: '♂', name: 'male' },
      { char: '★', name: 'star' }, { char: '✓', name: 'check' }, { char: '✗', name: 'cross' },
      { char: '∎', name: 'end proof' },
    ],
  },
];

const RECENT_SYMBOLS_KEY = 'endnotere-recent-symbols';
const MAX_RECENT = 12;

function getRecentSymbols(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SYMBOLS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addRecentSymbol(char: string): void {
  try {
    const recent = getRecentSymbols().filter((c) => c !== char);
    recent.unshift(char);
    localStorage.setItem(RECENT_SYMBOLS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

function SymbolPool({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('greek');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRecent(getRecentSymbols());
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const insertSymbol = (char: string) => {
    editor.chain().focus().insertContent(char).run();
    addRecentSymbol(char);
    setRecent(getRecentSymbols());
  };

  // Flatten all symbols for search
  const allSymbols = useMemo(() => {
    const flat: Array<{ char: string; name: string; category: string }> = [];
    for (const cat of SYMBOL_CATEGORIES) {
      for (const s of cat.symbols) {
        flat.push({ ...s, category: cat.key });
      }
    }
    return flat;
  }, []);

  const filteredSymbols = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return allSymbols.filter(
      (s) => s.name.toLowerCase().includes(q) || s.char.includes(q)
    );
  }, [search, allSymbols]);

  const catKeyToLabel = (key: string): string => {
    const map: Record<string, string> = {
      greek: t('sym_greek'), math: t('sym_math'), arrows: t('sym_arrows'),
      misc: t('sym_misc'), sub_super: t('sym_sub_super'), units: t('sym_units'),
    };
    return map[key] || key;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-2.5 py-1 rounded-md text-xs font-semibold text-secondary hover:bg-slate-100 flex items-center gap-1 transition"
        title={t('sym_pool_title')}
      >
        Ω⁺
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-xl shadow-xl"
               style={{ width: '340px' }}>
            {/* Header */}
            <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-slate-50 rounded-t-xl">
              <span className="text-xs font-bold text-primary">{t('sym_pool_title')}</span>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-primary text-sm leading-none">✕</button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-border">
              <input
                ref={searchRef}
                type="text"
                placeholder={t('sym_search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-border rounded-lg focus:outline-none focus:border-teal bg-slate-50/30"
              />
            </div>

            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {/* Search results */}
              {filteredSymbols ? (
                <div className="p-3">
                  {filteredSymbols.length === 0 ? (
                    <div className="text-xs text-muted text-center py-4 italic">—</div>
                  ) : (
                    <div className="grid grid-cols-10 gap-0.5">
                      {filteredSymbols.map((s, i) => (
                        <button
                          key={`${s.char}-${i}`}
                          onClick={() => insertSymbol(s.char)}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-sm hover:bg-teal/10 hover:text-teal transition font-medium border border-transparent hover:border-teal/20"
                          title={s.name}
                        >
                          {s.char}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Recent symbols */}
                  {recent.length > 0 && (
                    <div className="px-3 pt-2.5 pb-1.5">
                      <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">{t('sym_recent')}</div>
                      <div className="flex flex-wrap gap-0.5">
                        {recent.map((c, i) => (
                          <button
                            key={`r-${i}`}
                            onClick={() => insertSymbol(c)}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-sm hover:bg-teal/10 hover:text-teal transition font-medium bg-teal/5 border border-teal/10"
                            title={c}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category tabs */}
                  <div className="px-3 pt-2 flex gap-1 flex-wrap">
                    {SYMBOL_CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => setActiveCategory(cat.key)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${
                          activeCategory === cat.key
                            ? 'bg-teal text-white'
                            : 'bg-slate-100 text-secondary hover:bg-slate-200'
                        }`}
                      >
                        {catKeyToLabel(cat.key)}
                      </button>
                    ))}
                  </div>

                  {/* Active category grid */}
                  <div className="p-3">
                    <div className="grid grid-cols-10 gap-0.5">
                      {SYMBOL_CATEGORIES.find((c) => c.key === activeCategory)?.symbols.map((s, i) => (
                        <button
                          key={`${s.char}-${i}`}
                          onClick={() => insertSymbol(s.char)}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-sm hover:bg-teal/10 hover:text-teal transition font-medium border border-transparent hover:border-teal/20"
                          title={s.name}
                        >
                          {s.char}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NumberingMenu({ editor, t }: { editor: any; t: (k: string) => string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [nextVals, setNextVals] = useState<{ next: string; nextSub: string; level: number } | null>(null);

  const handleOpen = () => {
    const info = getPrecedingHeadingInfo(editor);
    if (info.text) {
      const nextNum = getNextNumbering(info.text);
      if (nextNum) {
        setNextVals({
          next: nextNum.next,
          nextSub: nextNum.nextSub,
          level: info.level,
        });
        setOpen(true);
        return;
      }
    }
    setNextVals({
      next: '1. ',
      nextSub: '1.1. ',
      level: 2,
    });
    setOpen(true);
  };

  const insertHeading = (prefix: string, isSub: boolean) => {
    let level = nextVals?.level ?? 2;
    if (isSub) {
      level = Math.min(level + 1, 3);
    }
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: prefix }],
        },
        { type: 'paragraph' },
      ])
      .run();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="px-2.5 py-1 rounded-md text-xs font-semibold text-secondary hover:bg-slate-100 flex items-center gap-1"
        title={t('ed_numbering_help')}
      >
        🔢 {t('ed_numbering')} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-border rounded-lg shadow-lg w-64 py-1">
            <button
              onClick={() => insertHeading(nextVals?.next ?? '1. ', false)}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal font-medium"
            >
              ➕ {t('ed_numbering_next').replace('{val}', (nextVals?.next ?? '').trim())}
            </button>
            <button
              onClick={() => insertHeading(nextVals?.nextSub ?? '1.1. ', true)}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal font-medium"
            >
              ➕ {t('ed_numbering_sub').replace('{val}', (nextVals?.nextSub ?? '').trim())}
            </button>

            <div className="border-t border-border my-1" />

            <button
              onClick={() => {
                autoNumberAllHeadings(editor);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-xs hover:bg-teal-bg hover:text-teal text-teal font-semibold"
            >
              🔢 {t('ed_numbering_all')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { computeRefOrder };
