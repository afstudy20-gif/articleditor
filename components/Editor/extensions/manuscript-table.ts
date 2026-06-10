import { Table, TableView } from '@tiptap/extension-table';

export class ManuscriptTableView extends TableView {
  constructor(node: any, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.syncMetadata();
  }

  update(node: any): boolean {
    const updated = super.update(node);
    if (updated) this.syncMetadata();
    return updated;
  }

  private syncMetadata(): void {
    this.table.setAttribute('data-table-title', this.node.attrs?.title ?? '');
    this.table.setAttribute('data-table-footnote', this.node.attrs?.footnote ?? '');
  }
}

/**
 * Stores publication metadata on the editable TipTap table itself. The title
 * and footnote are rendered around the table with CSS and reused by exporters.
 */
export const ManuscriptTable = Table.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-table-title') ?? '',
        renderHTML: (attributes) => ({
          'data-table-title': attributes.title ?? '',
        }),
      },
      footnote: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-table-footnote') ?? '',
        renderHTML: (attributes) => ({
          'data-table-footnote': attributes.footnote ?? '',
        }),
      },
    };
  },
});
