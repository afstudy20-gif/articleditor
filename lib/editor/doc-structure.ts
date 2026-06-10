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

function normalizeHeadingText(val: string): string {
  return val
    .toLowerCase()
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADING_SYNONYMS = new Set([
  'abstract', 'oz', 'ozet', 'summary',
  'introduction', 'background', 'giris',
  'methods', 'materials and methods', 'patients and methods', 'methodology', 'materials',
  'yontemler', 'yontem', 'metotlar', 'metot',
  'results', 'findings', 'bulgular', 'bulgu',
  'discussion', 'tartisma',
  'conclusion', 'conclusions', 'sonuc', 'sonuclar',
  'references', 'bibliography', 'kaynaklar', 'kaynak', 'referanslar', 'referans',
  'funding', 'conflict of interest', 'acknowledgements', 'tesekkur', 'tesekkurler'
]);

function isParagraphHeadingHeuristic(trimmedText: string): boolean {
  if (!trimmedText || trimmedText.length > 80) return false;
  const normalized = normalizeHeadingText(trimmedText);
  // Remove leading section numbers like 1., 1.1, 1-
  let clean = normalized.replace(/^[0-9\.\-\s]+/, '');
  // Remove Roman numerals like i. , ii. , iv.
  clean = clean.replace(/^(ix|iv|v?i{0,3})\b[\.\-\s]*/, '');
  // Remove single character prefixes like a. , b.
  clean = clean.replace(/^[a-z]\b[\.\-\s]*/, '');
  
  return HEADING_SYNONYMS.has(clean);
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
    const trimmed = text.trim();
    const isHeadingNode = node.type === 'heading';
    const isParagraphHeading = node.type === 'paragraph' && isParagraphHeadingHeuristic(trimmed);

    if (isHeadingNode || isParagraphHeading) {
      headings.push(text);
      if (ABSTRACT_RE.test(trimmed)) {
        inAbstract = true;
      } else if (inAbstract) {
        inAbstract = false;
        if (abstractParts.length > 0 && abstractText === undefined) {
          abstractText = abstractParts.join('\n').trim();
        }
      }
    } else if (inAbstract && trimmed) {
      abstractParts.push(text);
    }
    if (text) textParts.push(text);
  }
  if (abstractText === undefined && abstractParts.length > 0) {
    abstractText = abstractParts.join('\n').trim();
  }

  return { headings, plainText: textParts.join('\n'), abstractText };
}

