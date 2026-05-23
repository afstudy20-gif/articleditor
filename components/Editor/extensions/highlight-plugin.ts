import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const citationHighlightKey = new PluginKey<{ activeRefId: string | null }>('enrCitationHighlight');

export const citationHighlightPlugin = new Plugin<{ activeRefId: string | null }>({
  key: citationHighlightKey,
  state: {
    init: () => ({ activeRefId: null }),
    apply(tr, value) {
      const meta = tr.getMeta(citationHighlightKey);
      if (meta !== undefined) {
        return { activeRefId: meta === null ? null : String(meta) };
      }
      return value;
    },
  },
  props: {
    decorations(state) {
      const plugState = citationHighlightKey.getState(state);
      const activeRefId = plugState?.activeRefId;
      if (!activeRefId) return DecorationSet.empty;
      const decos: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'citation') {
          const ids: string[] = node.attrs?.refIds ?? [];
          if (ids.includes(activeRefId)) {
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'enr-citation-active',
              }),
            );
          }
        }
        return true;
      });
      return DecorationSet.create(state.doc, decos);
    },
  },
});
