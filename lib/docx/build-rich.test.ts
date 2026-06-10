import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildRichDocx, sniffDimensions } from './build-rich';
import type { Ref } from '@/store/types';

function ref(id: string, family: string, year: number): Ref {
  return {
    id,
    type: 'journal-article',
    authors: [{ family, given: 'A.' }],
    year,
    title: `Title ${family}`,
    containerTitle: 'J Test',
  };
}

const rZ = ref('rz', 'Zeta', 2020);
const rA = ref('ra', 'Alpha', 2021);
const refsById = new Map([['rz', rZ], ['ra', rA]]);
const refOrder = new Map([['rz', 1], ['ra', 2]]);

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Methods' }] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'justify' },
      content: [
        { type: 'text', text: 'Bold claim', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and italic note', marks: [{ type: 'italic' }] },
        { type: 'citation', attrs: { refIds: ['rz'] } },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item one' }] }],
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              attrs: {},
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H1' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: {},
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v1' }] }],
            },
          ],
        },
      ],
    },
  ],
};

async function documentXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}

describe('buildRichDocx', () => {
  it('preserves headings, marks, lists, tables and active citation fields', async () => {
    const blob = await buildRichDocx({
      doc, refsById, refOrder, style: 'vancouver', mode: 'active', title: 'My Paper',
    });
    const xml = await documentXml(blob);
    assert.ok(xml.includes('<w:pStyle w:val="Heading2"/>'), 'real heading level');
    assert.ok(xml.includes('<w:b/>'), 'bold run');
    assert.ok(xml.includes('<w:i/>'), 'italic run');
    assert.ok(xml.includes('<w:numPr>'), 'list numbering');
    assert.ok(xml.includes('<w:tbl>'), 'table element');
    assert.ok(xml.includes('ADDIN EN.CITE'), 'active EndNote field');
    assert.ok(xml.includes('<w:jc w:val="both"/>'), 'justified alignment');

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const styles = await zip.file('word/styles.xml')!.async('string');
    assert.ok(styles.includes('Times New Roman'), 'editor font, not Calibri');
    assert.ok(zip.file('word/numbering.xml'), 'numbering part present');
  });

  it('apa: citation resolves correct ref against sorted bibliography', async () => {
    const blob = await buildRichDocx({
      doc, refsById, refOrder, style: 'apa', mode: 'plain',
    });
    const xml = await documentXml(blob);
    // Bibliography sorted: Alpha first, Zeta second. The cited ref is Zeta —
    // plain in-text APA shows (Zeta, 2020).
    assert.ok(xml.includes('Zeta'), 'cited author appears');
    const alphaIdx = xml.indexOf('Title Alpha');
    const zetaIdx = xml.indexOf('Title Zeta');
    assert.ok(alphaIdx > -1 && zetaIdx > -1 && alphaIdx < zetaIdx, 'bibliography alphabetical');
    assert.ok(/\(Zeta,?\s*2020\)/.test(xml), 'APA in-text citation for the actually cited ref');
  });

  it('exports MDPI ACS citations and full-title bibliography entries', async () => {
    const blob = await buildRichDocx({
      doc,
      refsById,
      refOrder,
      style: 'mdpi-acs',
      mode: 'plain',
    });
    const xml = await documentXml(blob);

    assert.ok(xml.includes('[1]'));
    assert.ok(xml.includes('Title Zeta'));
    assert.ok(xml.includes('Zeta, A.'));
  });
});

describe('sniffDimensions', () => {
  it('reads PNG IHDR', () => {
    // Minimal PNG header: signature + IHDR with 2x3 px
    const png = new Uint8Array(26);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dv = new DataView(png.buffer);
    dv.setUint32(16, 2);
    dv.setUint32(20, 3);
    assert.deepEqual(sniffDimensions(png, 'png'), { width: 2, height: 3 });
  });
});
