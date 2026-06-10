'use client';

import { useEffect, useRef, useState } from 'react';
import type { FigureCaptionPlacement } from '@/lib/figures/export-layout';
import { newId } from '@/lib/id';

interface FigureEntry {
  figId: string;
  kind: 'figure' | 'table';
  src: string;
  caption: string;
  pos: number;
  nodeSize: number;
  number: number;
}

interface FiguresPanelProps {
  editor: any;
  onClose: () => void;
  t: (k: string) => string;
  captionPlacement: FigureCaptionPlacement;
  onCaptionPlacementChange: (placement: FigureCaptionPlacement) => void;
}

function collect(editor: any): FigureEntry[] {
  if (!editor) return [];
  const raw: Array<Omit<FigureEntry, 'number'>> = [];
  editor.state.doc.descendants((n: any, pos: number) => {
    if (n.type?.name === 'figure') {
      raw.push({
        figId: n.attrs?.figId ?? '',
        kind: (n.attrs?.kind ?? 'figure') as 'figure' | 'table',
        src: n.attrs?.src ?? '',
        caption: n.attrs?.caption ?? '',
        pos,
        nodeSize: n.nodeSize,
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

export function FiguresPanel({
  editor,
  onClose,
  t,
  captionPlacement,
  onCaptionPlacementChange,
}: FiguresPanelProps): JSX.Element {
  const [items, setItems] = useState<FigureEntry[]>(() => collect(editor));
  const [pendingImage, setPendingImage] = useState('');
  const [pendingFileName, setPendingFileName] = useState('');
  const [pendingCaption, setPendingCaption] = useState('');
  const [fileError, setFileError] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<FigureEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

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

  const chooseFile = (file: File | undefined): void => {
    if (!file) return;
    setFileError('');
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setFileError(t('fig_file_error'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(typeof reader.result === 'string' ? reader.result : '');
      setPendingFileName(file.name);
    };
    reader.onerror = () => setFileError(t('fig_file_error'));
    reader.readAsDataURL(file);
  };

  const insertPendingFigure = (): void => {
    if (!pendingImage) {
      fileRef.current?.click();
      return;
    }
    editor.chain().focus().insertFigure({
      src: pendingImage,
      caption: pendingCaption.trim(),
      kind: 'figure',
      figId: newId('fig'),
    }).run();
    setPendingImage('');
    setPendingFileName('');
    setPendingCaption('');
  };

  const updateCaption = (item: FigureEntry, caption: string): void => {
    const node = editor.state.doc.nodeAt(item.pos);
    if (!node || node.type?.name !== 'figure') return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(item.pos, undefined, {
        ...node.attrs,
        caption,
      }),
    );
  };

  const replaceImage = (file: File | undefined): void => {
    if (!file || !replaceTarget) return;
    setFileError('');
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      setFileError(t('fig_file_error'));
      setReplaceTarget(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const node = editor.state.doc.nodeAt(replaceTarget.pos);
      if (!node || node.type?.name !== 'figure' || typeof reader.result !== 'string') return;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(replaceTarget.pos, undefined, {
          ...node.attrs,
          src: reader.result,
        }),
      );
      setReplaceTarget(null);
    };
    reader.onerror = () => {
      setFileError(t('fig_file_error'));
      setReplaceTarget(null);
    };
    reader.readAsDataURL(file);
  };

  const remove = (item: FigureEntry): void => {
    const node = editor.state.doc.nodeAt(item.pos);
    if (!node || node.type?.name !== 'figure') return;
    editor.view.dispatch(editor.state.tr.delete(item.pos, item.pos + item.nodeSize));
  };

  return (
    <div className="card flex flex-col h-full min-h-0 overflow-hidden bg-white">
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">🖼 {t('fig_title')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 border-b border-border bg-white">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <input
            ref={replaceFileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event) => {
              replaceImage(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <div className="text-[11px] font-semibold text-primary mb-2">{t('fig_add_title')}</div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-md border border-dashed border-teal/60 bg-teal-bg/40 px-3 py-3 text-xs font-semibold text-teal hover:bg-teal-bg"
          >
            {pendingImage ? `✓ ${pendingFileName}` : `＋ ${t('fig_choose_file')}`}
          </button>
          {pendingImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingImage}
                alt=""
                className="mt-2 max-h-40 w-full rounded-md border border-border object-contain bg-slate-50"
              />
              <label className="block mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t('fig_caption_label')}
              </label>
              <textarea
                value={pendingCaption}
                onChange={(event) => setPendingCaption(event.target.value)}
                placeholder={t('fig_caption_placeholder')}
                className="mt-1 min-h-20 w-full resize-y rounded-md border border-border px-2.5 py-2 text-xs text-primary outline-none focus:border-teal"
              />
            </>
          )}
          {fileError && <p className="mt-1.5 text-[10px] text-red">{fileError}</p>}
          <button
            type="button"
            onClick={insertPendingFigure}
            className="mt-2 w-full rounded-md bg-teal px-3 py-2 text-xs font-semibold text-white hover:bg-teal-dark"
          >
            {t('fig_insert_at_cursor')}
          </button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{t('fig_insert_hint')}</p>
        </div>

        <div className="p-3 border-b border-border bg-slate-50">
          <div className="text-[11px] font-semibold text-primary mb-2">{t('fig_export_order')}</div>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => onCaptionPlacementChange('inline')}
              className={`text-left rounded-md border px-2.5 py-2 text-[11px] ${
                captionPlacement === 'inline'
                  ? 'border-teal bg-teal-bg text-primary'
                  : 'border-border bg-white text-secondary'
              }`}
            >
              <strong>{t('fig_export_inline')}</strong>
              <span className="block mt-0.5 text-muted">{t('fig_export_inline_hint')}</span>
            </button>
            <button
              type="button"
              onClick={() => onCaptionPlacementChange('after-bibliography')}
              className={`text-left rounded-md border px-2.5 py-2 text-[11px] ${
                captionPlacement === 'after-bibliography'
                  ? 'border-teal bg-teal-bg text-primary'
                  : 'border-border bg-white text-secondary'
              }`}
            >
              <strong>{t('fig_export_after_refs')}</strong>
              <span className="block mt-0.5 text-muted">{t('fig_export_after_refs_hint')}</span>
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted mt-2">{t('fig_export_note')}</p>
        </div>

        <div>
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted">{t('fig_empty')}</p>
          )}
          {items.map((it) => (
            <div key={it.figId || it.pos} className="border-b border-border p-3 text-xs">
              <div className="flex gap-2.5">
                {it.src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.src}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded border border-border object-contain bg-slate-50"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-primary">
                    {it.kind === 'table' ? t('fig_table') : t('fig_figure')} {it.number}
                  </div>
                  <textarea
                    value={it.caption}
                    onChange={(event) => updateCaption(it, event.target.value)}
                    placeholder={t('fig_caption_placeholder')}
                    className="mt-1 min-h-16 w-full resize-y rounded border border-border px-2 py-1.5 text-[11px] text-secondary outline-none focus:border-teal"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => jump(it.pos)} className="text-teal hover:underline">
                  {t('fig_jump')}
                </button>
                <button
                  onClick={() => editor.chain().focus().insertFigureRef(it.figId).run()}
                  className="text-secondary hover:text-primary"
                >
                  {t('fig_insert_ref')}
                </button>
                <button
                  onClick={() => {
                    setReplaceTarget(it);
                    replaceFileRef.current?.click();
                  }}
                  className="text-secondary hover:text-primary"
                >
                  {t('fig_replace_image')}
                </button>
                <button onClick={() => remove(it)} className="ml-auto text-red hover:underline">
                  {t('fig_delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
