import type { TitlePageAuthor } from './templates';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const ORCID_RE = /(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i;
const AFFILIATION_RE =
  /\b(?:department|dept\.?|faculty|university|hospital|clinic|institute|school|college|center|centre|division|unit|program|medicine|cardiology|anabilim|bölüm|bolum|fakülte|fakulte|üniversite|universite|hastane|klinik|enstitü|enstitu|merkez|tıp|tip)\b/i;
const NAME_LABEL_RE = /^(?:name|author|corresponding\s+author|isim|ad\s+soyad|yazar)\s*[:：-]\s*/i;
const EMAIL_LABEL_SOURCE = String.raw`(?:e[\s-]?mail(?:\s+address)?|email(?:\s+address)?|mail|e[\s-]?posta)`;
const META_LABEL_RE = new RegExp(String.raw`^(?:${EMAIL_LABEL_SOURCE}|orcid)\s*[:：-]\s*`, 'i');
const CONTACT_LABEL_RE = new RegExp(String.raw`[(:]?\s*\b(?:${EMAIL_LABEL_SOURCE}|orcid)\b\s*[:：-]?\s*`, 'gi');

export function parseTitlePageAuthors(raw: string): TitlePageAuthor[] {
  const blocks = splitAuthorBlocks(raw);
  const authors = blocks
    .map(parseAuthorBlock)
    .filter((author): author is TitlePageAuthor => Boolean(author?.name.trim()));
  return dedupeAuthors(authors);
}

function splitAuthorBlocks(raw: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  let currentHasContact = false;

  const flush = (): void => {
    if (current.length > 0) blocks.push(current);
    current = [];
    currentHasContact = false;
  };

  for (const originalLine of raw.split(/\r?\n/)) {
    const line = cleanLine(originalLine);
    if (!line) {
      flush();
      continue;
    }
    const isContactLine = EMAIL_RE.test(line) || ORCID_RE.test(line);
    if (currentHasContact && !isContactLine && !META_LABEL_RE.test(line)) {
      flush();
    }
    current.push(line);
    currentHasContact = currentHasContact || isContactLine;
  }
  flush();
  return blocks;
}

function parseAuthorBlock(lines: string[]): TitlePageAuthor | null {
  const joined = lines.join(' ');
  const email = joined.match(EMAIL_RE)?.[0] ?? '';
  const orcid = joined.match(ORCID_RE)?.[1] ?? '';
  const contentLines = lines
    .map((line) => stripContactFields(line))
    .map(cleanLine)
    .filter(Boolean);

  if (contentLines.length === 0) return email || orcid ? { name: '', email, orcid, institution: '' } : null;

  const labeledIndex = contentLines.findIndex((line) => NAME_LABEL_RE.test(line));
  let name = '';
  let institutionLines: string[] = [];

  if (labeledIndex >= 0) {
    name = contentLines[labeledIndex].replace(NAME_LABEL_RE, '').trim();
    institutionLines = contentLines.filter((_, index) => index !== labeledIndex);
  } else {
    const first = contentLines[0];
    const affiliationStart = first.search(AFFILIATION_RE);
    if (affiliationStart > 0) {
      name = first.slice(0, affiliationStart).trim();
      institutionLines = [first.slice(affiliationStart).trim(), ...contentLines.slice(1)];
    } else {
      name = first.trim();
      institutionLines = contentLines.slice(1);
    }
  }

  return {
    name: cleanName(name),
    institution: cleanInstitution(institutionLines.join(' ')),
    email,
    orcid,
  };
}

function stripContactFields(line: string): string {
  return line
    .replace(EMAIL_RE, '')
    .replace(ORCID_RE, '')
    .replace(META_LABEL_RE, '')
    .replace(CONTACT_LABEL_RE, '')
    .trim();
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function cleanName(name: string): string {
  return name
    .replace(/^[\d\s,.;:*†‡§-]+/, '')
    .replace(/[\s,.;:*†‡§-]+$/, '')
    .trim();
}

function cleanInstitution(institution: string): string {
  return institution
    .replace(/^[\s,.;:-]+/, '')
    .replace(/[\s,.;:)]+$/, '')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeAuthors(authors: TitlePageAuthor[]): TitlePageAuthor[] {
  const seen = new Set<string>();
  const out: TitlePageAuthor[] = [];
  for (const author of authors) {
    const key = (author.email || author.name).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(author);
  }
  return out;
}
