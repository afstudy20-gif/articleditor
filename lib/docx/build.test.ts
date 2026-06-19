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
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');

    assert.ok(xml.includes('References'));
    assert.ok(!xml.includes('Kaynakça'));
    assert.ok(!xml.includes('Kaynaklar'));
    assert.equal(zip.file('word/header1.xml'), null);
    assert.equal(zip.file('word/footer1.xml'), null);
    assert.ok(!xml.includes('headerReference'));
    assert.ok(!xml.includes('footerReference'));
    assert.ok(!rels.includes('/header'));
    assert.ok(!rels.includes('/footer'));
  });
});
