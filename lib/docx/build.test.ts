import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildDocx } from './build';

describe('buildDocx', () => {
  it('uses References as the default bibliography heading', async () => {
    const blob = await buildDocx({
      bodyText: 'Body',
      markers: [],
      refs: [],
      mode: 'plain',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    assert.ok(xml.includes('References'));
    assert.ok(!xml.includes('Kaynakça'));
    assert.ok(!xml.includes('Kaynaklar'));
  });
});
