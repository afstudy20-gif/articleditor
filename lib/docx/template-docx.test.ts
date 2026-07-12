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

    // Regression: the byline's superscript-affiliation-number splitter used
    // to match a trailing space as part of the digit/comma token and then
    // .trim() it away, silently deleting the space between one author's
    // marker and the next author's name ("Akkaya 1, Nihan" -> "Akkaya1,Nihan").
    // Reconstruct the paragraph's full text from every run and compare
    // against the original — this must be byte-for-byte equal.
    const bylineParaFull = xml.slice(xml.lastIndexOf('<w:p>', bylineIdx), xml.indexOf('</w:p>', bylineIdx));
    const bylineRunTexts = [...bylineParaFull.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    assert.equal(bylineRunTexts.join(''), 'Fatih Akkaya 1, Nihan Bahadır 1 and Ayşe Yılmaz 2');
  });

  it('renders level-1 headings with an auto-incrementing outline number', async () => {
    // Regression: previously section headings rendered as plain bold body
    // text with no number. MDPI production output numbers them "1.", "2." …
    const tpl = getDocxTemplate('jcm')!;
    const bytes = readFileSync(TEMPLATE_PATH);
    const blob = await buildTemplateDocx(bytes, tpl, {
      doc: {
        type: 'doc',
        content: [
          // A leading paragraph ensures the editor title is used (not the first
          // heading), so both level-1 headings below are treated as section
          // headings and numbered.
          { type: 'paragraph', content: [{ type: 'text', text: 'Abstract placeholder.' }] },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Body.' }] },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Results' }] },
        ],
      },
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'Numbered Headings',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const numbering = await zip.file('word/numbering.xml')!.async('string');

    // The heading numbering list (903) is defined in numbering.xml.
    assert.ok(numbering.includes('w:numId="903"'), 'heading numbering list defined');
    assert.ok(
      numbering.includes('w:abstractNumId="903"'),
      'heading numbering abstractNum present',
    );

    // Each level-1 heading paragraph carries the heading numPr + the
    // production indent, on the body-text style (not MDPI21heading1).
    for (const headingText of ['Introduction', 'Results']) {
      const idx = xml.indexOf(headingText);
      assert.ok(idx > -1, `${headingText} present`);
      const para = xml.slice(xml.lastIndexOf('<w:p>', idx), idx);
      assert.ok(para.includes('<w:pStyle w:val="MDPI31text"/>'), `${headingText} on body style`);
      assert.ok(
        para.includes('<w:numId w:val="903"/>'),
        `${headingText} linked to heading numbering`,
      );
      assert.ok(
        para.includes('w:left="2835" w:hanging="283"'),
        `${headingText} production hanging indent`,
      );
    }
    // Headings must NOT carry the static MDPI21heading1 style on section headings.
    // (The References bibliography heading still uses MDPI21heading1, so only
    // verify the section-heading paragraphs are not using it.)
    assert.ok(
      !/<w:pStyle w:val="MDPI21heading1"\/><w:r><w:t[^>]*>Introduction/.test(xml),
      'section heading Introduction does not use static heading1 style',
    );
  });

  it('indents front-matter paragraphs (byline, affiliation, abstract) to the body gutter', async () => {
    // Regression: previously front-matter paragraphs inherited the
    // MDPI31text first-line indent; production output overrides it.
    const tpl = getDocxTemplate('jcm')!;
    const bytes = readFileSync(TEMPLATE_PATH);
    const blob = await buildTemplateDocx(bytes, tpl, {
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Fatih Akkaya 1, Nihan Bahadır 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '1 Department of Cardiology, Ordu University, Ordu' }] },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
        ],
      },
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'Indent Test',
      abstractText: 'Background: structured abstract.\n\nMethods: methods text.',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    // Byline sits flush-left (no first-line indent).
    const bylineIdx = xml.indexOf('Fatih Akkaya');
    const bylinePara = xml.slice(xml.lastIndexOf('<w:p>', bylineIdx), bylineIdx);
    assert.ok(
      bylinePara.includes('w:left="0" w:firstLine="0"'),
      'byline overrides first-line indent',
    );
    // Affiliation indented to the gutter in 8pt (sz=16).
    const affIdx = xml.indexOf('Department of Cardiology');
    const affPara = xml.slice(xml.lastIndexOf('<w:p>', affIdx), affIdx);
    assert.ok(
      affPara.includes('w:left="2552" w:firstLine="0"'),
      'affiliation gutter indent',
    );
    assert.ok(affPara.includes('<w:sz w:val="16"/>'), 'affiliation small font');
    // Abstract heading indented to the gutter.
    const absIdx = xml.indexOf('>Abstract<');
    const absPara = xml.slice(xml.lastIndexOf('<w:p>', absIdx), absIdx);
    assert.ok(
      absPara.includes('w:left="2552" w:firstLine="0"'),
      'abstract heading gutter indent',
    );
    // Abstract body paragraph indented to the gutter with bold label.
    const bgIdx = xml.indexOf('Background:');
    const bgPara = xml.slice(xml.lastIndexOf('<w:p>', bgIdx), bgIdx);
    assert.ok(
      bgPara.includes('w:left="2552" w:firstLine="0"'),
      'abstract body gutter indent',
    );
    // The label run is bold: the run rPr should contain <w:b/> right before
    // the "Background:" text run.
    const bgRun = xml.slice(bgIdx - 80, bgIdx + 20);
    assert.ok(
      bgRun.includes('<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Background'),
      'structured abstract label is bold',
    );
  });

  it('indents front-matter lists to the body gutter but leaves body lists untouched', async () => {
    const tpl = getDocxTemplate('jcm')!;
    const bytes = readFileSync(TEMPLATE_PATH);
    const blob = await buildTemplateDocx(bytes, tpl, {
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Author One 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '1 Department, University, City' }] },
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Front-matter item' }] }] },
            ],
          },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction' }] },
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body item' }] }] },
            ],
          },
        ],
      },
      refsById: new Map(),
      refOrder: new Map(),
      style: 'vancouver',
      mode: 'plain',
      title: 'List Indent Test',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    const frontIdx = xml.indexOf('Front-matter item');
    const frontPara = xml.slice(xml.lastIndexOf('<w:p>', frontIdx), frontIdx);
    assert.ok(
      frontPara.includes('w:left="2552"'),
      'front-matter list indented to gutter',
    );

    const bodyIdx = xml.indexOf('Body item');
    const bodyPara = xml.slice(xml.lastIndexOf('<w:p>', bodyIdx), bodyIdx);
    assert.ok(
      !bodyPara.includes('w:left="2552"'),
      'body list not overridden',
    );
  });
});
