import type { Ref } from '@/store/types';
import { parseRis } from './ris';
import { parseEnw } from './enw';
import { parseEndnoteXml } from './endnote-xml';
import { parseBibtex } from './bibtex';

export type ImportFormat = 'ris' | 'enw' | 'endnote-xml' | 'bibtex' | 'unknown';

export function detectImportFormat(text: string): ImportFormat {
  const sample = text.trim().slice(0, 500);
  if (/<\?xml[\s\S]*<records>/i.test(text) || /<EndNote>/.test(text)) return 'endnote-xml';
  if (/^@\w+\s*\{/m.test(sample)) return 'bibtex';
  if (/^%0\s/m.test(sample) || /^%A\s/m.test(sample) || /^%T\s/m.test(sample)) return 'enw';
  if (/^TY\s*-\s/m.test(sample) || /\nER\s*-/.test(text)) return 'ris';
  return 'unknown';
}

export function importByAutoDetect(text: string): { format: ImportFormat; refs: Ref[] } {
  const format = detectImportFormat(text);
  switch (format) {
    case 'ris':
      return { format, refs: parseRis(text) };
    case 'enw':
      return { format, refs: parseEnw(text) };
    case 'endnote-xml':
      return { format, refs: parseEndnoteXml(text) };
    case 'bibtex':
      return { format, refs: parseBibtex(text) };
    default:
      return { format: 'unknown', refs: [] };
  }
}

export function importByExtension(filename: string, text: string): { format: ImportFormat; refs: Ref[] } {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'ris':
      return { format: 'ris', refs: parseRis(text) };
    case 'enw':
    case 'nbib':
      return { format: 'enw', refs: parseEnw(text) };
    case 'xml':
    case 'enx':
      return { format: 'endnote-xml', refs: parseEndnoteXml(text) };
    case 'bib':
    case 'bibtex':
      return { format: 'bibtex', refs: parseBibtex(text) };
    default:
      return importByAutoDetect(text);
  }
}

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  ris: 'RIS',
  enw: 'EndNote .enw',
  'endnote-xml': 'EndNote XML',
  bibtex: 'BibTeX',
  unknown: 'Bilinmeyen format',
};
