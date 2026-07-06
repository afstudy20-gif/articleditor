// Convert TipTap selection ↔ encoded plaintext with sentinel-marked citations.
// Used by AI rewrite flow: enhancer sends encoded text to LLM, then receives
// edited text (still containing sentinels) that must be reinserted into the
// document with the original citation nodes intact.

// Private-use-area sentinels (must match lib/ai/citation-safety.ts) so plain
// digits in prose are never mistaken for citation tokens.
const OPEN = '';
const CLOSE = '';

export type CitationNodeJSON = {
  type: 'citation';
  attrs: { refIds: string[] };
};

export type EncodedSelection = {
  encoded: string; // text with sentinels {n}
  nodes: CitationNodeJSON[]; // one entry per sentinel index
  from: number;
  to: number;
};

// Walk the ProseMirror slice between `from` and `to`, emitting plain text and
// sentinels for citation nodes. We do NOT collapse block boundaries — each
// block becomes a newline in the encoded text.
export function encodeSelection(
  state: any,
  from: number,
  to: number,
): EncodedSelection {
  const nodes: CitationNodeJSON[] = [];
  const out: string[] = [];
  const slice = state.doc.slice(from, to);
  let blockStarted = false;

  const walk = (node: any, depth: number): void => {
    if (!node) return;
    if (node.isText) {
      out.push(node.text ?? '');
      return;
    }
    if (node.type?.name === 'citation') {
      const idx = nodes.length;
      const refIds: string[] = node.attrs?.refIds ?? [];
      nodes.push({ type: 'citation', attrs: { refIds } });
      out.push(`${OPEN}${idx}${CLOSE}`);
      return;
    }
    if (node.type?.isBlock) {
      if (blockStarted) out.push('\n');
      blockStarted = true;
    }
    if (node.content && node.content.forEach) {
      node.content.forEach((child: any) => walk(child, depth + 1));
    }
  };

  slice.content.forEach((node: any) => walk(node, 0));

  return {
    encoded: out.join('').replace(/\n{3,}/g, '\n\n'),
    nodes,
    from,
    to,
  };
}

// Convert decoded text (with sentinels) back into a TipTap content array
// suitable for ed.chain().insertContentAt(range, contentArray).run().
// Newlines become paragraph breaks; sentinels become citation nodes.
export function decodeToTipTapContent(
  encodedAfter: string,
  nodes: CitationNodeJSON[],
): any[] {
  // Split text into paragraphs first (\n\n boundaries), then within each
  // paragraph split by sentinel and produce text + citation nodes.
  const paragraphs = encodedAfter.split(/\n{2,}/);
  const sentinelRe = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

  const out: any[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const inlineContent: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      sentinelRe.lastIndex = 0;
      while ((m = sentinelRe.exec(line))) {
        if (m.index > lastIndex) {
          inlineContent.push({ type: 'text', text: line.slice(lastIndex, m.index) });
        }
        const nodeIdx = parseInt(m[1], 10);
        const node = nodes[nodeIdx];
        if (node) inlineContent.push(node);
        lastIndex = m.index + m[0].length;
      }
      if (lastIndex < line.length) {
        inlineContent.push({ type: 'text', text: line.slice(lastIndex) });
      }
      if (i < lines.length - 1) {
        inlineContent.push({ type: 'hardBreak' });
      }
    }
    out.push({
      type: 'paragraph',
      content: inlineContent.length > 0 ? inlineContent : undefined,
    });
  }
  return out;
}

// Render encoded text as a human-readable preview (sentinels → "[N]" using
// node refIds resolved via refOrder map). Used by diff display.
export function encodedToPreview(
  encoded: string,
  nodes: CitationNodeJSON[],
  refOrder: Map<string, number>,
): string {
  const re = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');
  return encoded.replace(re, (_full, n) => {
    const node = nodes[parseInt(n, 10)];
    if (!node) return '[?]';
    const nums = node.attrs.refIds
      .map((id) => refOrder.get(id) ?? 0)
      .filter((x) => x > 0)
      .sort((a, b) => a - b);
    return nums.length > 0 ? `[${nums.join(',')}]` : '[?]';
  });
}
