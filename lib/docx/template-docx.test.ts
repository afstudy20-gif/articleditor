import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { buildTemplateDocx, getDocxTemplate } from './template-docx';
import type { Ref } from '@/store/types';

const TEMPLATE_PATH = join(process.cwd(), 'public', 'templates', 'jcm-template.dot');

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

const refsById = new Map([['r1', ref('r1', 'Smith', 2020)]]);
const refOrder = new Map([['r1', 1]]);

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Body sentence ' },
        { type: 'citation', attrs: { refIds: ['r1'] } },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sub Methods' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
      ],
    },
  ],
};

describe('buildTemplateDocx (JCM/MDPI)', () => {
  it('injects body with MDPI styles and keeps template parts', async () => {
    const tpl = getDocxTemplate('jcm');
    assert.ok(tpl, 'jcm template registered');
    const bytes = readFileSync(TEMPLATE_PATH);

    const blob = await buildTemplateDocx(bytes, tpl!, {
      doc, refsById, refOrder, style: 'vancouver', mode: 'active', title: 'My JCM Paper',
    });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    // MDPI style mapping applied (doc has an H1, so the Title paragraph is
    // intentionally suppressed — covered by the dedicated test below)
    assert.ok(xml.includes('<w:pStyle w:val="MDPI21heading1"/>'), 'h1 style');
    assert.ok(xml.includes('<w:pStyle w:val="MDPI22heading2"/>'), 'h2 style');
    assert.ok(xml.includes('<w:pStyle w:val="MDPI31text"/>'), 'body text style');
    assert.ok(xml.includes('<w:pStyle w:val="MDPI81references"/>'), 'references style');

    // Citation style forced to MDPI ACS; EndNote field present
    assert.ok(xml.includes('ADDIN EN.CITE'), 'active EndNote field');

    // Template sectPr survived (A4 page from MDPI: w=11906)
    assert.ok(xml.includes('w:pgSz w:w="11906"'), 'template page size kept');
    assert.ok(xml.includes('headerReference'), 'template header refs kept');

    // Template sample content gone
    assert.ok(!xml.includes('Type of the Paper'), 'template placeholder content removed');

    // Template package parts intact
    assert.ok(zip.file('word/styles.xml'), 'template styles.xml kept');
    const styles = await zip.file('word/styles.xml')!.async('string');
    assert.ok(styles.includes('MDPI31text'), 'MDPI styles present');
    assert.ok(zip.file('word/header3.xml'), 'template headers kept');
    assert.ok(zip.file('word/media/image1.png'), 'template media kept');

    // Lists: merged numbering ids
    assert.ok(xml.includes('<w:numId w:val="901"/>'), 'merged bullet numId used');
    const numbering = await zip.file('word/numbering.xml')!.async('string');
    assert.ok(numbering.includes('w:numId="901"'), 'numbering merged');
    // abstractNum still precedes first w:num (OOXML schema order)
    assert.ok(
      numbering.indexOf('w:abstractNumId="901"') < numbering.indexOf('<w:num '),
      'abstractNum before num elements',
    );

    // Content type rewritten to a normal document
    const ct = await zip.file('[Content_Types].xml')!.async('string');
    assert.ok(ct.includes('wordprocessingml.document.main+xml'), 'document content type');
    assert.ok(!ct.includes('wordprocessingml.template.main+xml'), 'template content type removed');
  });

  it('maps the document title to MDPI12title when no H1 exists', async () => {
    const tpl = getDocxTemplate('jcm')!;
    const bytes = readFileSync(TEMPLATE_PATH);
    const blob = await buildTemplateDocx(bytes, tpl, {
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only body.' }] }] },
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'Titled Paper',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes('<w:pStyle w:val="MDPI12title"/>'), 'title style');
    assert.ok(xml.includes('Titled Paper'), 'title text');
  });
});
