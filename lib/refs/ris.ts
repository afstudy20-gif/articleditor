import type { Ref, RefType } from '@/store/types';

const TYPE_MAP: Record<RefType, string> = {
  'journal-article': 'JOUR',
  book: 'BOOK',
  'book-chapter': 'CHAP',
  'conference-paper': 'CONF',
  thesis: 'THES',
  webpage: 'ELEC',
  report: 'RPRT',
  other: 'GEN',
};

export function refsToRis(refs: Ref[]): string {
  return refs.map(refToRis).join('\n');
}

export function refToRis(ref: Ref): string {
  const lines: string[] = [];
  lines.push(`TY  - ${TYPE_MAP[ref.type] ?? 'GEN'}`);
  if (ref.enRecNum != null) lines.push(`ID  - ${ref.enRecNum}`);
  for (const a of ref.authors) {
    const name = formatAuthor(a);
    if (name) lines.push(`AU  - ${name}`);
  }
  if (ref.title) lines.push(`TI  - ${ref.title}`);
  if (ref.containerTitle) lines.push(`T2  - ${ref.containerTitle}`);
  if (ref.year) lines.push(`PY  - ${ref.year}`);
  if (ref.volume) lines.push(`VL  - ${ref.volume}`);
  if (ref.issue) lines.push(`IS  - ${ref.issue}`);
  if (ref.pages) {
    const m = ref.pages.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      lines.push(`SP  - ${m[1]}`);
      lines.push(`EP  - ${m[2]}`);
    } else {
      lines.push(`SP  - ${ref.pages}`);
    }
  }
  if (ref.publisher) lines.push(`PB  - ${ref.publisher}`);
  if (ref.doi) lines.push(`DO  - ${ref.doi}`);
  if (ref.pmid) lines.push(`AN  - ${ref.pmid}`);
  if (ref.url) lines.push(`UR  - ${ref.url}`);
  if (ref.raw) lines.push(`N1  - ${ref.raw}`);
  lines.push(`ER  - `);
  return lines.join('\n');
}

function formatAuthor(a: { family?: string; given?: string; literal?: string }): string {
  if (a.literal) return a.literal;
  if (a.family && a.given) return `${a.family}, ${a.given}`;
  if (a.family) return a.family;
  if (a.given) return a.given;
  return '';
}

export function parseRis(text: string): Ref[] {
  const blocks = text.split(/\r?\n\s*ER\s*-.*?(?:\r?\n|$)/g).filter((b) => b.trim().length > 0);
  const refs: Ref[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split(/\r?\n/);
    const ref: Ref = {
      id: `r${i + 1}`,
      type: 'journal-article',
      authors: [],
    };
    let pagesSp: string | undefined;
    let pagesEp: string | undefined;
    for (const line of lines) {
      const m = line.match(/^([A-Z][A-Z0-9])\s*-\s*(.*)$/);
      if (!m) continue;
      const tag = m[1];
      const val = m[2].trim();
      switch (tag) {
        case 'TY':
          ref.type = risTypeToInternal(val);
          break;
        case 'AU':
        case 'A1':
        case 'A2': {
          const parts = val.split(',').map((p) => p.trim());
          if (parts.length >= 2) ref.authors.push({ family: parts[0], given: parts[1] });
          else ref.authors.push({ literal: val });
          break;
        }
        case 'TI':
        case 'T1':
          ref.title = val;
          break;
        case 'T2':
        case 'JO':
        case 'JF':
        case 'JA':
          ref.containerTitle = val;
          break;
        case 'PY':
        case 'Y1': {
          const y = parseInt(val.slice(0, 4), 10);
          if (Number.isFinite(y)) ref.year = y;
          break;
        }
        case 'VL':
          ref.volume = val;
          break;
        case 'IS':
        case 'CP':
          ref.issue = val;
          break;
        case 'SP':
          pagesSp = val;
          break;
        case 'EP':
          pagesEp = val;
          break;
        case 'DO':
          ref.doi = val;
          break;
        case 'AN':
          if (/^\d+$/.test(val)) ref.pmid = val;
          break;
        case 'UR':
          ref.url = val;
          break;
        case 'PB':
          ref.publisher = val;
          break;
      }
    }
    if (pagesSp && pagesEp) ref.pages = `${pagesSp}-${pagesEp}`;
    else if (pagesSp) ref.pages = pagesSp;
    refs.push(ref);
  }
  return refs;
}

function risTypeToInternal(s: string): RefType {
  switch (s.toUpperCase()) {
    case 'JOUR':
      return 'journal-article';
    case 'BOOK':
      return 'book';
    case 'CHAP':
      return 'book-chapter';
    case 'CONF':
      return 'conference-paper';
    case 'THES':
      return 'thesis';
    case 'ELEC':
      return 'webpage';
    case 'RPRT':
      return 'report';
    default:
      return 'other';
  }
}
