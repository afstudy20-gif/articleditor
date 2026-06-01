'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import katex from 'katex';
import { insertBlockNode } from './insert-block';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    equation: {
      /** Insert a block math equation from a LaTeX string. */
      insertEquation: (latex: string) => ReturnType;
    };
  }
}

function EquationNodeView({ node, updateAttributes, editor }: any): JSX.Element {
  const latex: string = node.attrs.latex ?? '';
  let html = '';
  try {
    html = katex.renderToString(latex || '\\;', { displayMode: true, throwOnError: false });
  } catch {
    html = `<span style="color:#dc2626">${latex}</span>`;
  }

  const onEdit = (): void => {
    if (!editor?.isEditable) return;
    const next = window.prompt('LaTeX', latex);
    if (next !== null) updateAttributes({ latex: next });
  };

  return (
    <NodeViewWrapper
      as="div"
      className="enr-equation my-2 flex justify-center cursor-pointer rounded hover:bg-slate-50 py-1"
      data-latex={latex}
      title={latex}
      onDoubleClick={onEdit}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
}

export const Equation = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-latex]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-latex': HTMLAttributes.latex ?? '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EquationNodeView);
  },

  addCommands() {
    return {
      insertEquation:
        (latex: string) =>
        ({ chain }) =>
          insertBlockNode(chain(), { type: this.name, attrs: { latex } }).run(),
    };
  },
});
