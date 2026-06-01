// Extract readable plain text from a TipTap doc JSON. Citations collapse to a
// single marker so snapshot diffs focus on prose, not re-numbered brackets.

interface DocNode {
  type?: string;
  text?: string;
  content?: DocNode[];
}

function isNode(v: unknown): v is DocNode {
  return typeof v === 'object' && v !== null;
}

export function docToText(json: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (!isNode(n)) return;
    if (n.type === 'text') {
      out.push(n.text ?? '');
      return;
    }
    if (n.type === 'citation') {
      out.push('[cite]');
      return;
    }
    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
    if (n.type === 'paragraph' || n.type === 'heading') out.push('\n');
  };
  walk(json);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
