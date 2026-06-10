import { Node, mergeAttributes } from '@tiptap/core';

export type CitationNodeOptions = {
  locator?: string;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (refIds: string[]) => ReturnType;
      updateCitationRefIds: (pos: number, refIds: string[]) => ReturnType;
      updateCitationOpts: (pos: number, opts: CitationNodeOptions) => ReturnType;
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
      // Per-citation rendering options (CSL-like). Persisted in the doc JSON
      // and in HTML data attributes so copy/paste keeps them.
      locator: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-locator') ?? '',
        renderHTML: (attrs) => (attrs.locator ? { 'data-locator': attrs.locator } : {}),
      },
      prefix: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-prefix') ?? '',
        renderHTML: (attrs) => (attrs.prefix ? { 'data-prefix': attrs.prefix } : {}),
      },
      suffix: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-suffix') ?? '',
        renderHTML: (attrs) => (attrs.suffix ? { 'data-suffix': attrs.suffix } : {}),
      },
      suppressAuthor: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-suppress-author') === '1',
        renderHTML: (attrs) => (attrs.suppressAuthor ? { 'data-suppress-author': '1' } : {}),
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
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { refIds, insertedAt: Date.now() },
            })
            .scrollIntoView()
            .run(),
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
      updateCitationOpts:
        (pos: number, opts: CitationNodeOptions) =>
        ({ tr, state, dispatch }) => {
          const node = state.doc.nodeAt(pos);
          if (!node || node.type.name !== 'citation') return false;
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              locator: opts.locator ?? '',
              prefix: opts.prefix ?? '',
              suffix: opts.suffix ?? '',
              suppressAuthor: opts.suppressAuthor ?? false,
            });
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
