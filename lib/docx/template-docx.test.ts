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
    assert.ok(xml.includes('<w:pStyle w:val="MDPI31text"/>'), 'body text style');
    assert.ok(xml.includes('<w:pStyle w:val="MDPI81references"/>'), 'references style');

    // Sub-headings (level 2) render as bold MDPI31text, NOT MDPI22heading2
    // (which is italic in the template). Find the "Sub Methods" paragraph:
    // it should carry MDPI31text and its run should be bold.
    assert.ok(!xml.includes('<w:pStyle w:val="MDPI22heading2"/>'), 'h2 not mapped to italic MDPI22heading2');
    const subIdx = xml.indexOf('Sub Methods');
    assert.ok(subIdx > -1, 'sub-heading text present');
    const subParaStart = xml.lastIndexOf('<w:p>', subIdx);
    const subParaSlice = xml.slice(subParaStart, subIdx);
    assert.ok(subParaSlice.includes('<w:pStyle w:val="MDPI31text"/>'), 'sub-heading uses MDPI31text');
    assert.ok(subParaSlice.includes('<w:r><w:rPr><w:b/></w:rPr>'), 'sub-heading run is bold');

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

  it('renders abstract/keywords block with MDPI production styles', async () => {
    const tpl = getDocxTemplate('jcm')!;
    const bytes = readFileSync(TEMPLATE_PATH);
    const blob = await buildTemplateDocx(bytes, tpl, {
      doc: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Intro' }] }] },
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'Paper With Abstract',
      abstractText: 'Background paragraph one.\n\nMethods paragraph two.',
      keywords: ['lipid paradox', 'STEMI'],
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    // "Abstract" heading is plain body text (MDPI31text), not MDPI21heading1.
    const absIdx = xml.indexOf('>Abstract<');
    assert.ok(absIdx > -1, 'abstract heading text present');
    const absPara = xml.slice(xml.lastIndexOf('<w:p>', absIdx), absIdx);
    assert.ok(absPara.includes('<w:pStyle w:val="MDPI31text"/>'), 'abstract heading uses MDPI31text');

    // Keywords paragraph uses the dedicated MDPI18keywords style.
    const kwIdx = xml.indexOf('Keywords:');
    assert.ok(kwIdx > -1, 'keywords label present');
    const kwPara = xml.slice(xml.lastIndexOf('<w:p>', kwIdx), kwIdx);
    assert.ok(kwPara.includes('<w:pStyle w:val="MDPI18keywords"/>'), 'keywords style');

    // An MDPI19line ruled separator paragraph follows the abstract block.
    assert.ok(xml.includes('<w:pStyle w:val="MDPI19line"/>'), 'abstract separator rule present');
  });

  it('renders article type, byline, affiliations and back matter with MDPI styles', async () => {
    const tpl = getDocxTemplate('jcm')!;
    const bytes = readFileSync(TEMPLATE_PATH);
    const frontDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Fatih Akkaya 1, Nihan Bahadır 1 and Ayşe Yılmaz 2' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '1 Department of Cardiology, Ordu University, Ordu, Türkiye' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '* Correspondence: author@example.org' }],
        },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body sentence with 12 patients.' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Author Contributions: Conceptualization, F.A.; writing, N.B.' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Conflicts of Interest: The authors declare no conflict of interest.' }],
        },
      ],
    };
    const blob = await buildTemplateDocx(bytes, tpl, {
      doc: frontDoc,
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'Front Matter Paper',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    // Article type line precedes the title.
    const atIdx = xml.indexOf('<w:pStyle w:val="MDPI11articletype"/>');
    const titleIdx = xml.indexOf('<w:pStyle w:val="MDPI12title"/>');
    assert.ok(atIdx > -1, 'article type style present');
    assert.ok(xml.slice(atIdx, xml.indexOf('</w:p>', atIdx)).includes('Article'), 'article type text');
    assert.ok(titleIdx > atIdx, 'article type comes before the title');

    // Byline and affiliation/correspondence lines mapped to journal styles.
    const bylineIdx = xml.indexOf('Fatih Akkaya');
    const bylinePara = xml.slice(xml.lastIndexOf('<w:p>', bylineIdx), bylineIdx);
    assert.ok(bylinePara.includes('<w:pStyle w:val="MDPI13authornames"/>'), 'byline style');
    const affIdx = xml.indexOf('Department of Cardiology');
    const affPara = xml.slice(xml.lastIndexOf('<w:p>', affIdx), affIdx);
    assert.ok(affPara.includes('<w:pStyle w:val="MDPI16affiliation"/>'), 'affiliation style');
    const corrIdx = xml.indexOf('Correspondence:');
    const corrPara = xml.slice(xml.lastIndexOf('<w:p>', corrIdx), corrIdx);
    assert.ok(corrPara.includes('<w:pStyle w:val="MDPI16affiliation"/>'), 'correspondence style');

    // Ordinary body text after the first heading stays MDPI31text.
    const bodyIdx = xml.indexOf('Body sentence with 12 patients.');
    const bodyPara = xml.slice(xml.lastIndexOf('<w:p>', bodyIdx), bodyIdx);
    assert.ok(bodyPara.includes('<w:pStyle w:val="MDPI31text"/>'), 'body keeps normal style');

    // Back-matter sections mapped to MDPI62backmatter.
    for (const label of ['Author Contributions:', 'Conflicts of Interest:']) {
      const idx = xml.indexOf(label);
      assert.ok(idx > -1, `${label} present`);
      const para = xml.slice(xml.lastIndexOf('<w:p>', idx), idx);
      assert.ok(para.includes('<w:pStyle w:val="MDPI62backmatter"/>'), `${label} back-matter style`);
    }
  });
});
