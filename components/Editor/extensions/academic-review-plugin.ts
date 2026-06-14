import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { AcademicReviewCategory } from '@/lib/ai/academic-review';

export interface AcademicReviewDecoration {
  id: string;
  from: number;
  to: number;
  category: AcademicReviewCategory;
}

interface AcademicReviewPluginState {
  items: AcademicReviewDecoration[];
  activeId: string | null;
  decorations: DecorationSet;
}

type AcademicReviewMeta =
  | { type: 'set'; items: AcademicReviewDecoration[] }
  | { type: 'remove'; id: string }
  | { type: 'active'; id: string | null }
  | { type: 'clear' };

export const academicReviewPluginKey = new PluginKey<AcademicReviewPluginState>(
  'academicReviewSuggestions',
);

function buildDecorations(
  doc: any,
  items: ReadonlyArray<AcademicReviewDecoration>,
  activeId: string | null,
): DecorationSet {
  const decorations = items
    .filter((item) => item.from >= 0 && item.to > item.from && item.to <= doc.content.size)
    .map((item) =>
      Decoration.inline(item.from, item.to, {
        class: `enr-ai-issue enr-ai-issue-${item.category}${
          item.id === activeId ? ' enr-ai-issue-active' : ''
        }`,
        'data-ai-issue-id': item.id,
      }),
    );
  return DecorationSet.create(doc, decorations);
}

export const academicReviewPlugin = new Plugin<AcademicReviewPluginState>({
  key: academicReviewPluginKey,
  state: {
    init: (_, state) => ({
      items: [],
      activeId: null,
      decorations: DecorationSet.empty,
    }),
    apply(transaction, previous) {
      const meta = transaction.getMeta(academicReviewPluginKey) as AcademicReviewMeta | undefined;
      let items = previous.items
        .map((item) => ({
          ...item,
          from: transaction.mapping.map(item.from, 1),
          to: transaction.mapping.map(item.to, -1),
        }))
        .filter((item) => item.to > item.from);
      let activeId = previous.activeId;

      if (meta?.type === 'set') items = meta.items.map((item) => ({ ...item }));
      if (meta?.type === 'remove') {
        items = items.filter((item) => item.id !== meta.id);
        if (activeId === meta.id) activeId = null;
      }
      if (meta?.type === 'active') activeId = meta.id;
      if (meta?.type === 'clear') {
        items = [];
        activeId = null;
      }

      return {
        items,
        activeId,
        decorations: buildDecorations(transaction.doc, items, activeId),
      };
    },
  },
  props: {
    decorations(state) {
      return academicReviewPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
    },
  },
});

export const AcademicReviewDecorations = Extension.create({
  name: 'academicReviewDecorations',
  addProseMirrorPlugins() {
    return [academicReviewPlugin];
  },
});
