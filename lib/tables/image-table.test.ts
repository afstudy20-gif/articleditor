import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseImageDataUrl,
  buildImageTablePrompt,
  buildCliImageTablePrompt,
  imageResultToParsedTable,
  IMAGE_TABLE_MIME_TYPES,
} from './image-table';
import type { ImageTableResultT } from '@/lib/ai/schemas';

// 1×1 transparent PNG.
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('parseImageDataUrl', () => {
  it('decodes a supported base64 image data URL', () => {
    const out = parseImageDataUrl(`data:image/png;base64,${PNG_1PX}`);
    assert.ok(out);
    assert.equal(out!.mimeType, 'image/png');
    assert.equal(out!.base64, PNG_1PX);
    assert.ok(out!.dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(out!.byteLength > 0);
  });

  it('accepts every declared mime type', () => {
    for (const mime of IMAGE_TABLE_MIME_TYPES) {
      const out = parseImageDataUrl(`data:${mime};base64,${PNG_1PX}`);
      assert.ok(out, mime);
      assert.equal(out!.mimeType, mime);
    }
  });

  it('rejects unsupported types and non-data-URLs without throwing', () => {
    assert.equal(parseImageDataUrl(`data:image/svg+xml;base64,${PNG_1PX}`), null);
    assert.equal(parseImageDataUrl(`data:application/pdf;base64,${PNG_1PX}`), null);
    assert.equal(parseImageDataUrl('not a data url'), null);
    assert.equal(parseImageDataUrl('data:image/png;base64,'), null);
    assert.equal(parseImageDataUrl(''), null);
  });

  it('strips whitespace from the base64 payload', () => {
    const out = parseImageDataUrl(`data:image/png;base64,${PNG_1PX.slice(0, 8)}\n  ${PNG_1PX.slice(8)}`);
    assert.ok(out);
    assert.equal(out!.base64, PNG_1PX);
  });
});

describe('buildImageTablePrompt', () => {
  it('demands exact rectangular transcription and JSON-only output', () => {
    const p = buildImageTablePrompt('en');
    assert.match(p, /EXACTLY as it appears/);
    assert.match(p, /rectangular grid/);
    assert.match(p, /Return valid JSON only/);
    assert.match(p, /hasHeader/);
  });

  it('tells the model not to translate captions to the UI language', () => {
    assert.match(buildImageTablePrompt('tr'), /do not translate to Turkish/);
    assert.match(buildImageTablePrompt('en'), /do not translate to English/);
  });
});

describe('buildCliImageTablePrompt', () => {
  it('carries the same JSON schema and fidelity rules, condensed', () => {
    const p = buildCliImageTablePrompt('en');
    assert.match(p, /EXACTLY as a rectangular JSON grid/);
    assert.match(p, /"hasHeader":true/);
    assert.match(p, /Return ONLY that JSON/);
    assert.match(p, /do not translate to English/);
  });

  it('is meaningfully shorter than the full API-provider prompt', () => {
    assert.ok(buildCliImageTablePrompt('en').length < buildImageTablePrompt('en').length);
  });

  it('respects the language for the translate-note only, not the schema', () => {
    assert.match(buildCliImageTablePrompt('tr'), /do not translate to Turkish/);
  });
});

describe('imageResultToParsedTable', () => {
  const base: ImageTableResultT = { hasHeader: true, rows: [['A', 'B'], ['1', '2']] };

  it('passes a clean grid straight through', () => {
    const t = imageResultToParsedTable(base);
    assert.ok(t);
    assert.deepEqual(t!.rows, [['A', 'B'], ['1', '2']]);
    assert.equal(t!.hasHeader, true);
    assert.equal(t!.format, 'html');
  });

  it('pads ragged rows to the widest row', () => {
    const t = imageResultToParsedTable({ hasHeader: false, rows: [['a', 'b', 'c'], ['x']] });
    assert.deepEqual(t!.rows, [['a', 'b', 'c'], ['x', '', '']]);
  });

  it('drops trailing empty rows and columns', () => {
    const t = imageResultToParsedTable({
      hasHeader: true,
      rows: [['A', 'B', ''], ['1', '2', ''], ['', '', '']],
    });
    assert.deepEqual(t!.rows, [['A', 'B'], ['1', '2']]);
  });

  it('trims cell whitespace and carries title/footnote', () => {
    const t = imageResultToParsedTable({
      hasHeader: true,
      rows: [[' A ', 'B'], ['1', ' 2 ']],
      title: '  Table 1. Demographics ',
      footnote: ' n = 160 ',
    });
    assert.deepEqual(t!.rows, [['A', 'B'], ['1', '2']]);
    assert.equal(t!.title, 'Table 1. Demographics');
    assert.equal(t!.footnote, 'n = 160');
  });

  it('returns null when the grid has no content', () => {
    assert.equal(imageResultToParsedTable({ hasHeader: false, rows: [['', '  ']] }), null);
  });
});
