import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type FindOptions = {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  activeIndex: number;
};

export type FindMatch = { from: number; to: number };

export type FindPluginState = {
  options: FindOptions;
  matches: FindMatch[];
  decorations: DecorationSet;
};

export const findPluginKey = new PluginKey<FindPluginState>('articleEditorFind');

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function computeMatches(doc: any, opts: FindOptions): FindMatch[] {
  const { query, caseSensitive, wholeWord } = opts;
  if (!query || query.length === 0) return [];
  const matches: FindMatch[] = [];
  const flags = caseSensitive ? 'g' : 'gi';
  let pattern = escapeRegex(query);
  if (wholeWord) pattern = `\\b${pattern}\\b`;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    return [];
  }
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return true;
    const text: string = node.text ?? '';
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      matches.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
    return true;
  });
  return matches;
}

function buildDecorations(doc: any, matches: FindMatch[], activeIndex: number): DecorationSet {
  const decos = matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === activeIndex ? 'enr-find-active' : 'enr-find-match',
    }),
  );
  return DecorationSet.create(doc, decos);
}

export const findPlugin = new Plugin<FindPluginState>({
  key: findPluginKey,
  state: {
    init() {
      return {
        options: { query: '', caseSensitive: false, wholeWord: false, activeIndex: 0 },
        matches: [],
        decorations: DecorationSet.empty,
      };
    },
    apply(tr, value) {
      const meta = tr.getMeta(findPluginKey) as Partial<FindOptions> | { recompute: true } | undefined;
      if (meta) {
        const isRecompute = (meta as any).recompute === true;
        const opts: FindOptions = isRecompute
          ? value.options
          : { ...value.options, ...(meta as Partial<FindOptions>) };
        const matches = computeMatches(tr.doc, opts);
        const activeIndex =
          matches.length === 0
            ? 0
            : opts.activeIndex < 0
              ? 0
              : Math.min(opts.activeIndex, matches.length - 1);
        const decorations = buildDecorations(tr.doc, matches, activeIndex);
        return {
          options: { ...opts, activeIndex },
          matches,
          decorations,
        };
      }
      if (tr.docChanged && value.options.query) {
        const matches = computeMatches(tr.doc, value.options);
        const activeIndex =
          matches.length === 0 ? 0 : Math.min(value.options.activeIndex, matches.length - 1);
        return {
          options: { ...value.options, activeIndex },
          matches,
          decorations: buildDecorations(tr.doc, matches, activeIndex),
        };
      }
      if (tr.docChanged) {
        return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
      }
      return value;
    },
  },
  props: {
    decorations(state) {
      return findPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
    },
  },
});
