import type { Author, Ref, RefType } from '@/store/types';

// EndNote tagged format (.enw):
//   %0 Journal Article
//   %A Smith, J
//   %T Title
//   %J Journal
//   %D 2020
//   %V 15  %N 3  %P 123-130  %R 10.1234/abc  %X abstract

const TYPE_MAP: Record<string, RefType> = {
  'Journal Article': 'journal-article',
  Book: 'book',
  'Book Section': 'book-chapter',
  'Conference Proceedings': 'conference-paper',
  Thesis: 'thesis',
  'Web Page': 'webpage',
  'Generic': 'other',
};

export function parseEnw(text: string): Ref[] {
  // Records separated by blank lines.
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.startsWith('%'));

  return blocks.map((block, i) => parseEnwRecord(block, `enw-${i}`)).filter((r): r is Ref => r !== null);
}

function parseEnwRecord(block: string, id: string): Ref | null {
  const lines = block.split(/\n/);
  let type: RefType = 'journal-article';
  const authors: Author[] = [];
  let title: string | undefined;
  let containerTitle: string | undefined;
  let year: number | undefined;
  let volume: string | undefined;
  let issue: string | undefined;
  let pages: string | undefined;
  let doi: string | undefined;
  let pmid: string | undefined;
  let url: string | undefined;
  let abstract: string | undefined;
  let publisher: string | undefined;

  let currentTag: string | null = null;
  let currentValue: string[] = [];

  function flush(): void {
    if (!currentTag) return;
    const value = currentValue.join(' ').trim();
    switch (currentTag) {
      case '%0':
        type = TYPE_MAP[value] || 'journal-article';
        break;
      case '%A':
      case '%E': {
        const parts = value.split(',').map((p) => p.trim());
        if (parts.length >= 2) authors.push({ family: parts[0], given: parts[1] });
        else authors.push({ literal: value });
        break;
      }
      case '%T':
        title = value;
        break;
      case '%J':
      case '%B':
      case '%S':
        containerTitle = value;
        break;
      case '%D':
      case '%Y': {
        const y = parseInt(value.slice(0, 4), 10);
        if (Number.isFinite(y)) year = y;
        break;
      }
      case '%V':
        volume = value;
        break;
      case '%N':
        issue = value;
        break;
      case '%P':
        pages = value;
        break;
      case '%R':
        doi = cleanDoi(value);
        break;
      case '%M':
        if (/^\d{4,9}$/.test(value)) pmid = value;
        break;
      case '%U':
        url = value;
        break;
      case '%X':
        abstract = value;
        break;
      case '%I':
        publisher = value;
        break;
    }
    currentTag = null;
    currentValue = [];
  }

  for (const line of lines) {
    const m = line.match(/^(%[0-9A-Z])\s?(.*)$/);
    if (m) {
      flush();
      currentTag = m[1];
      currentValue = [m[2]];
    } else if (currentTag) {
      currentValue.push(line.trim());
    }
  }
  flush();

  if (!title && authors.length === 0 && !year) return null;

  return {
    id,
    type,
    authors,
    title,
    containerTitle,
    year,
    volume,
    issue,
    pages,
    publisher,
    doi,
    pmid,
    url,
    abstract,
  };
}

function cleanDoi(s: string): string {
  return s
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;)]+$/, '');
}
