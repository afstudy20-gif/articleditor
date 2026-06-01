// Extract structural signals from a TipTap doc JSON for compliance checks:
// the list of heading texts, full plain text, and the abstract body (text under
// an Abstract / Öz / Özet heading up to the next heading).

interface DocNode {
  type?: string;
  text?: string;
  attrs?: { level?: number };
  content?: DocNode[];
}

function isNode(v: unknown): v is DocNode {
  return typeof v === 'object' && v !== null;
}

function nodeText(n: DocNode): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'citation') return '';
  if (!Array.isArray(n.content)) return '';
  return n.content.map(nodeText).join('');
}

const ABSTRACT_RE = /^(abstract|öz|özet|summary)\b/i;

export interface DocStructure {
  headings: string[];
  plainText: string;
  abstractText?: string;
}

export function extractDocStructure(json: unknown): DocStructure {
  const headings: string[] = [];
  const textParts: string[] = [];
  let abstractText: string | undefined;

  const top = isNode(json) && Array.isArray(json.content) ? json.content : [];
  let inAbstract = false;
  const abstractParts: string[] = [];

  for (const node of top) {
    if (!isNode(node)) continue;
    const text = nodeText(node);
    if (node.type === 'heading') {
      headings.push(text);
      if (ABSTRACT_RE.test(text.trim())) {
        inAbstract = true;
      } else if (inAbstract) {
        inAbstract = false;
        if (abstractParts.length > 0 && abstractText === undefined) {
          abstractText = abstractParts.join('\n').trim();
        }
      }
    } else if (inAbstract && text.trim()) {
      abstractParts.push(text);
    }
    if (text) textParts.push(text);
  }
  if (abstractText === undefined && abstractParts.length > 0) {
    abstractText = abstractParts.join('\n').trim();
  }

  return { headings, plainText: textParts.join('\n'), abstractText };
}
