type TiptapInlineNode =
  | { type: 'text'; text: string }
  | { type: 'hardBreak' };

type TiptapParagraph = {
  type: 'paragraph';
  content?: TiptapInlineNode[];
};

export type PlainTextTiptapDocument = {
  type: 'doc';
  content: TiptapParagraph[];
};

/** Convert textarea content to paragraphs while preserving single line breaks. */
export function plainTextToTiptapDoc(text: string): PlainTextTiptapDocument {
  const normalized = text.replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/).filter((block) => block.length > 0);

  if (blocks.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  return {
    type: 'doc',
    content: blocks.map((block) => {
      const lines = block.split('\n');
      const content: TiptapInlineNode[] = [];

      lines.forEach((line, index) => {
        if (index > 0) content.push({ type: 'hardBreak' });
        if (line) content.push({ type: 'text', text: line });
      });

      return content.length > 0
        ? { type: 'paragraph', content }
        : { type: 'paragraph' };
    }),
  };
}

export function docxFilename(title: string): string {
  const safe = title
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, '_');

  return `${safe || 'document'}.docx`;
}
