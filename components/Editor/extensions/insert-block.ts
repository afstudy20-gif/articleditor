import { TextSelection, NodeSelection } from '@tiptap/pm/state';

// Insert a block-level atom (figure/equation) and leave the cursor in a sane
// place after it — mirroring TipTap's own HorizontalRule behaviour. Without
// this, the post-insert selection is a NodeSelection wrapping the atom, so the
// next insertContent REPLACES it instead of appending. Also guarantees a
// trailing paragraph so the user can keep typing after a block at doc end.
export function insertBlockNode(chain: any, content: unknown): any {
  return chain.insertContent(content).command(({ tr, dispatch }: any) => {
    if (dispatch) {
      const { $to } = tr.selection;
      const posAfter = $to.end();
      if ($to.nodeAfter) {
        if ($to.nodeAfter.isTextblock) {
          tr.setSelection(TextSelection.create(tr.doc, $to.start()));
        } else if ($to.nodeAfter.isBlock) {
          tr.setSelection(NodeSelection.create(tr.doc, $to.pos));
        } else {
          tr.setSelection(TextSelection.create(tr.doc, $to.pos));
        }
      } else {
        const node = $to.parent.type.contentMatch.defaultType?.create();
        if (node) {
          tr.insert(posAfter, node);
          tr.setSelection(TextSelection.create(tr.doc, posAfter + 1));
        }
      }
      tr.scrollIntoView();
    }
    return true;
  });
}
