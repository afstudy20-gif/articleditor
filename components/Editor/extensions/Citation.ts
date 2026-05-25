import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (refIds: string[]) => ReturnType;
      updateCitationRefIds: (pos: number, refIds: string[]) => ReturnType;
      deleteCitationAt: (pos: number) => ReturnType;
    };
  }
}

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      refIds: {
        default: [] as string[],
        parseHTML: (el) => {
          const v = (el as HTMLElement).getAttribute('data-ref-ids');
          return v ? v.split(',').filter(Boolean) : [];
        },
        renderHTML: (attrs) => ({
          'data-ref-ids': Array.isArray(attrs.refIds) ? attrs.refIds.join(',') : '',
        }),
      },
      highlighted: {
        default: false,
        rendered: false,
      },
      // Timestamp (ms) of the most recent insertion. NodeView uses this to
      // briefly tint the citation so users can spot where it landed.
      insertedAt: {
        default: 0,
        parseHTML: () => 0,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span.enr-citation' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'enr-citation',
      }),
      '[?]',
    ];
  },

  addCommands() {
    return {
      insertCitation:
        (refIds: string[]) =>
        ({ chain, state, editor }) => {
          const fromPos = state.selection.from;
          const ok = chain()
            .insertContent({
              type: this.name,
              attrs: { refIds, insertedAt: Date.now() },
            })
            .scrollIntoView()
            .run();
          if (ok && typeof window !== 'undefined') {
            // Flash the freshly-inserted citation directly via DOM class —
            // bypasses React/NodeView state races. Wait two animation frames
            // so ProseMirror finishes painting the new node before we look
            // it up via nodeDOM.
            const flash = (): void => {
              try {
                const dom = editor.view.nodeDOM(fromPos);
                const el = dom instanceof HTMLElement ? dom : null;
                if (!el) return;
                el.classList.add('enr-citation-fresh');
                setTimeout(() => el.classList.remove('enr-citation-fresh'), 3000);
              } catch {
                // ignore — DOM not ready or pos invalid
              }
            };
            requestAnimationFrame(() => requestAnimationFrame(flash));
          }
          return ok;
        },
      updateCitationRefIds:
        (pos: number, refIds: string[]) =>
        ({ tr, state, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'citation') return false;
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, refIds });
            dispatch(tr);
          }
          return true;
        },
      deleteCitationAt:
        (pos: number) =>
        ({ tr, state, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'citation') return false;
          if (dispatch) {
            tr.delete(pos, pos + node.nodeSize);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
