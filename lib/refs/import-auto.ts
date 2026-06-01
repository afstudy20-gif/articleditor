import type { Ref } from '@/store/types';
import { parseRis } from './ris';
import { parseEnw } from './enw';
import { parseEndnoteXml } from './endnote-xml';
import { parseBibtex } from './bibtex';
import { parseNbib, looksLikeNbib } from './nbib';
import { parseCslJson, looksLikeCslJson } from './csl-json';
import { parseCsv, looksLikeCsv } from './csv';
import { parseCff, looksLikeCff } from './cff';
import { parsePubmedXml, looksLikePubmedXml } from './pubmed-xml';
import { parseRefLine } from './parse-biblio';

export type ImportFormat =
  | 'ris'
  | 'enw'
  | 'nbib'
  | 'endnote-xml'
  | 'pubmed-xml'
  | 'bibtex'
  | 'csl-json'
  | 'csv'
  | 'cff'
  | 'plaintext'
  | 'unknown';

export function detectImportFormat(text: string): ImportFormat {
  const sample = text.trim().slice(0, 1500);
  if (looksLikePubmedXml(sample)) return 'pubmed-xml';
  if (/<\?xml[\s\S]*<records>/i.test(text) || /<EndNote>/.test(text)) return 'endnote-xml';
  if (looksLikeCff(sample)) return 'cff';
  if (/^@\w+\s*\{/m.test(sample)) return 'bibtex';
  if (looksLikeNbib(sample)) return 'nbib';
  if (/^%0\s/m.test(sample) || /^%A\s/m.test(sample) || /^%T\s/m.test(sample)) return 'enw';
  if (/^TY\s*-\s/m.test(sample) || /\nER\s*-/.test(text)) return 'ris';
  if (looksLikeCslJson(sample)) return 'csl-json';
  if (looksLikeCsv(text)) return 'csv';
  // Plaintext fallback: needs at least one year-like token and some length.
  const trimmed = text.trim();
  if (trimmed.length >= 30 && /(?:19|20)\d{2}/.test(trimmed)) return 'plaintext';
  return 'unknown';
}

export function parsePlaintextRefs(text: string): Ref[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  // Group by blank-line separation OR by numbered prefix.
  const groups: string[] = [];
  let buf: string[] = [];
  const flush = (): void => {
    const joined = buf.join(' ').trim();
    if (joined.length > 20) groups.push(joined);
    buf = [];
  };
  const REF_START = /^(?:\d{1,4}[\.\)]|\[\d{1,4}\])\s+/;
  const anyNumbered = lines.some((l) => REF_START.test(l));
  if (anyNumbered) {
    for (const l of lines) {
      if (!l) continue;
      if (REF_START.test(l) && buf.length > 0) flush();
      buf.push(l);
    }
    flush();
  } else {
    // Blank-line separation, or one-per-line fallback.
    let blanks = 0;
    for (const l of lines) {
      if (!l) {
        blanks++;
        if (blanks >= 1 && buf.length > 0) flush();
        continue;
      }
      blanks = 0;
      buf.push(l);
    }
    flush();
    // If we ended up with just one big blob, try splitting by lines.
    if (groups.length <= 1 && lines.filter((l) => l).length >= 2) {
      groups.length = 0;
      for (const l of lines) {
        if (l.length > 20) groups.push(l);
      }
    }
  }
  return groups.map((raw, i) => parseRefLine(raw, `pt${i + 1}`).ref);
}

export function importByAutoDetect(text: string): { format: ImportFormat; refs: Ref[] } {
  const format = detectImportFormat(text);
  switch (format) {
    case 'ris':
      return { format, refs: parseRis(text) };
    case 'enw':
      return { format, refs: parseEnw(text) };
    case 'nbib':
      return { format, refs: parseNbib(text) };
    case 'endnote-xml':
      return { format, refs: parseEndnoteXml(text) };
    case 'pubmed-xml':
      return { format, refs: parsePubmedXml(text) };
    case 'bibtex':
      return { format, refs: parseBibtex(text) };
    case 'csl-json':
      return { format, refs: parseCslJson(text) };
    case 'csv':
      return { format, refs: parseCsv(text) };
    case 'cff':
      return { format, refs: parseCff(text) };
    case 'plaintext':
      return { format, refs: parsePlaintextRefs(text) };
    default:
      return { format: 'unknown', refs: [] };
  }
}

export function importByExtension(filename: string, text: string): { format: ImportFormat; refs: Ref[] } {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'ris':
      return { format: 'ris', refs: parseRis(text) };
    case 'nbib':
      return { format: 'nbib', refs: parseNbib(text) };
    case 'enw':
      return { format: 'enw', refs: parseEnw(text) };
    case 'xml':
    case 'enx':
      // EndNote XML and PubMed XML both use .xml — sniff inside.
      if (looksLikePubmedXml(text)) return { format: 'pubmed-xml', refs: parsePubmedXml(text) };
      return { format: 'endnote-xml', refs: parseEndnoteXml(text) };
    case 'bib':
    case 'bibtex':
      return { format: 'bibtex', refs: parseBibtex(text) };
    case 'json':
      return { format: 'csl-json', refs: parseCslJson(text) };
    case 'csv':
    case 'tsv':
      return { format: 'csv', refs: parseCsv(text) };
    case 'cff':
    case 'yaml':
    case 'yml':
      return { format: 'cff', refs: parseCff(text) };
    default:
      return importByAutoDetect(text);
  }
}

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  ris: 'RIS',
  enw: 'EndNote .enw',
  nbib: 'PubMed MEDLINE (.nbib)',
  'endnote-xml': 'EndNote XML',
  'pubmed-xml': 'PubMed XML',
  bibtex: 'BibTeX',
  'csl-json': 'CSL-JSON (Zotero / Pandoc)',
  csv: 'CSV / TSV',
  cff: 'Citation File Format (.cff)',
  plaintext: 'Düz metin (Vancouver/APA vb.)',
  unknown: 'Bilinmeyen format',
};
