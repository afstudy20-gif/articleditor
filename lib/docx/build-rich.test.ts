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
      attrs: {
        title: 'Baseline characteristics',
        footnote: 'Values are presented as mean ± standard deviation.',
      },
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
    // Publication three-line table look
    assert.ok(xml.includes('Table 1.'), 'numbered table caption');
    assert.ok(xml.includes('Baseline characteristics'), 'table title');
    assert.ok(xml.includes('Values are presented as mean ± standard deviation.'), 'table footnote');
    assert.ok(xml.includes('<w:tblW w:w="5000" w:type="pct"/>'), 'full-width table');
    assert.ok(!xml.includes('insideV'), 'no vertical grid lines');
    assert.ok(!xml.includes('F2F2F2'), 'no grey header shading');
    assert.ok(xml.includes('<w:tblHeader/>'), 'header row repeats across pages');
    assert.ok(xml.includes('ADDIN EN.CITE'), 'active EndNote field');
    assert.ok(xml.includes('<w:jc w:val="both"/>'), 'justified alignment');
    assert.ok(xml.includes('References'), 'English bibliography heading');
    assert.ok(!xml.includes('Kaynakça'), 'no localized bibliography heading');

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const styles = await zip.file('word/styles.xml')!.async('string');
    assert.ok(styles.includes('Times New Roman'), 'editor font, not Calibri');
    assert.match(
      styles,
      /w:styleId="Heading2"[\s\S]*?<w:rPr><w:b\/><\/w:rPr>/,
      'heading style remains bold',
    );
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

  it('exports SAGE Vancouver citations as superscript EndNote fields', async () => {
    const blob = await buildRichDocx({
      doc,
      refsById,
      refOrder,
      style: 'sage-vancouver',
      mode: 'active',
    });
    const xml = await documentXml(blob);

    assert.ok(xml.includes('ADDIN EN.CITE'));
    assert.ok(xml.includes('<w:vertAlign w:val="superscript"/>'));
    assert.ok(xml.includes('1. Zeta A. Title Zeta. J Test. 2020.'));
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

  it('can move figure captions into Figure Legends after References', async () => {
    const figureDoc = {
      type: 'doc',
      content: [{
        type: 'figure',
        attrs: {
          src: '',
          caption: 'Primary outcome by treatment group.',
          kind: 'figure',
          figId: 'primary',
        },
      }],
    };
    const blob = await buildRichDocx({
      doc: figureDoc,
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      figureCaptionPlacement: 'after-bibliography',
    });
    const xml = await documentXml(blob);

    assert.ok(xml.indexOf('References') < xml.indexOf('Figure Legends'));
    assert.ok(xml.indexOf('Figure Legends') < xml.indexOf('Primary outcome by treatment group.'));
    assert.equal(xml.match(/Primary outcome by treatment group\./g)?.length, 1);
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
