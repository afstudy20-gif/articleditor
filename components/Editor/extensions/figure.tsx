'use client';

import { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { insertBlockNode } from './insert-block';

export type FigureKind = 'figure' | 'table';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figure: {
      insertFigure: (attrs: { src: string; caption?: string; kind?: FigureKind; figId?: string }) => ReturnType;
      insertFigureRef: (figId: string) => ReturnType;
    };
  }
}

/** Walk the doc and return the ordered list of figIds for a given kind. */
export function collectFigureIds(doc: any, kind: FigureKind): string[] {
  const ids: string[] = [];
  doc.descendants((n: any) => {
    if (n.type?.name === 'figure' && (n.attrs?.kind ?? 'figure') === kind) {
      const id = n.attrs?.figId;
      if (id) ids.push(id);
    }
    return true;
  });
  return ids;
}

/**
 * Captions of the figures already in the document. Several publishers require a graphical
 * abstract to differ from the paper's own figures, so the generator needs to know what is
 * already there.
 */
export function collectFigureCaptions(doc: any, kind: FigureKind = 'figure'): string[] {
  const captions: string[] = [];
  doc.descendants((n: any) => {
    if (n.type?.name === 'figure' && (n.attrs?.kind ?? 'figure') === kind) {
      const caption = String(n.attrs?.caption ?? '').trim();
      if (caption) captions.push(caption);
    }
    return true;
  });
  return captions;
}

/** 1-based number of a figure within its kind, or 0 if not found. */
function figureNumber(doc: any, figId: string, kind: FigureKind): number {
  const ids = collectFigureIds(doc, kind);
  const i = ids.indexOf(figId);
  return i < 0 ? 0 : i + 1;
}

function kindLabel(kind: FigureKind): string {
  return kind === 'table' ? 'Table' : 'Figure';
}

function useDocTick(editor: any): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    const on = (): void => setTick((t) => t + 1);
    editor.on('update', on);
    return () => editor.off('update', on);
  }, [editor]);
  return tick;
}

function FigureNodeView({ node, editor }: any): JSX.Element {
  useDocTick(editor);
  const kind: FigureKind = node.attrs.kind ?? 'figure';
  const src: string = node.attrs.src ?? '';
  const caption: string = node.attrs.caption ?? '';
  const figId: string = node.attrs.figId ?? '';
  const num = editor ? figureNumber(editor.state.doc, figId, kind) : 0;

  return (
    <NodeViewWrapper as="figure" className="enr-figure my-3 text-center" data-fig-id={figId} data-kind={kind}>
      {src && kind === 'figure' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={caption || `Figure ${num}`} className="max-w-full mx-auto rounded border border-border" />
      )}
      {kind === 'table' && src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={caption || `Table ${num}`} className="max-w-full mx-auto rounded border border-border" />
      )}
      <figcaption
        className="text-xs text-secondary mt-1"
        title="Edit this caption in the Figure Legends panel"
      >
        <strong>
          {kindLabel(kind)} {num || '?'}.
        </strong>{' '}
        {caption || <span className="text-muted italic">add caption…</span>}
      </figcaption>
    </NodeViewWrapper>
  );
}

function FigureRefNodeView({ node, editor }: any): JSX.Element {
  useDocTick(editor);
  const figId: string = node.attrs.figId ?? '';
  let label = 'Figure ?';
  if (editor) {
    for (const kind of ['figure', 'table'] as FigureKind[]) {
      const n = figureNumber(editor.state.doc, figId, kind);
      if (n > 0) {
        label = `${kindLabel(kind)} ${n}`;
        break;
      }
    }
  }
  return (
    <NodeViewWrapper
      as="span"
      className="enr-figref inline-block px-1 rounded text-xs bg-slate-100 text-secondary font-medium align-baseline"
      data-fig-id={figId}
    >
      {label}
    </NodeViewWrapper>
  );
}

export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      caption: { default: '' },
      kind: { default: 'figure' },
      figId: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-fig-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureNodeView);
  },

  addCommands() {
    return {
      insertFigure:
        (attrs) =>
        ({ chain }) =>
          insertBlockNode(chain(), {
            type: this.name,
            attrs: {
              src: attrs.src,
              caption: attrs.caption ?? '',
              kind: attrs.kind ?? 'figure',
              figId: attrs.figId ?? `fig_${Math.random().toString(36).slice(2, 10)}`,
            },
          }).run(),
    };
  },
});

export const FigureRef = Node.create({
  name: 'figureRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      figId: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-fig-ref]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-fig-ref': HTMLAttributes.figId ?? '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureRefNodeView);
  },

  addCommands() {
    return {
      insertFigureRef:
        (figId: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { figId } }),
    };
  },
});
