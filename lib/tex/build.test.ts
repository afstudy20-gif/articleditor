import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLatex } from './build';
import type { Ref } from '@/store/types';

const ref: Ref = {
  id: 'smith',
  type: 'journal-article',
  authors: [{ family: 'Smith', given: 'Jane' }],
  year: 2024,
  title: 'Clinical result',
  containerTitle: 'Journal of Tests',
  doi: '10.1000/example',
};

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('buildLatex', () => {
  it('generates a TeXworks/LuaLaTeX document and preserves rich blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Main' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Methods' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Sample' }] },
        {
          type: 'paragraph',
          attrs: { textAlign: 'justify' },
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and underlined', marks: [{ type: 'underline' }] },
            {
              type: 'citation',
              attrs: { refIds: ['smith'], locator: 'p. 12', prefix: 'see', suffix: 'for details' },
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
                {
                  type: 'orderedList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'table',
          attrs: {
            title: 'Baseline characteristics',
            footnote: 'Values are mean ± standard deviation.',
          },
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
              ],
            },
          ],
        },
        { type: 'equation', attrs: { latex: 'E = mc^2' } },
      ],
    };

    const output = buildLatex({
      doc,
      refs: [ref],
      title: 'Çalışma & Test',
      style: 'vancouver',
      language: 'tr',
    });

    assert.match(output.tex, /^% !TEX TS-program = LuaLaTeX/m);
    assert.match(output.tex, /^% !TEX encoding = UTF-8 Unicode/m);
    assert.ok(output.tex.includes('\\usepackage[english,turkish]{babel}'));
    assert.ok(output.tex.includes('\\usepackage{fontspec}'));
    assert.ok(output.tex.includes('style=numeric-comp'));
    assert.ok(output.tex.includes('\\section{Main}'));
    assert.ok(output.tex.includes('\\subsection{Methods}'));
    assert.ok(output.tex.includes('\\subsubsection{Sample}'));
    assert.ok(output.tex.includes('\\begin{justify}'));
    assert.ok(output.tex.includes('\\textbf{Bold}'));
    assert.ok(output.tex.includes('\\uline{ and underlined}'));
    assert.ok(output.tex.includes('see \\cite[p. 12]{smith2024} for details'));
    assert.ok(output.tex.includes('\\begin{itemize}'));
    assert.ok(output.tex.includes('\\begin{enumerate}'));
    assert.ok(output.tex.includes('\\begin{tabularx}{\\linewidth}'));
    assert.ok(output.tex.includes('\\caption{Baseline characteristics}'));
    assert.ok(output.tex.includes('\\footnotesize Values are mean ± standard deviation.'));
    assert.ok(output.tex.includes('\\textbf{A} & \\textbf{B} \\\\'));
    assert.ok(output.tex.includes('\\begin{equation*}'));
    assert.ok(output.tex.includes('\\printbibliography[title={References}]'));
    assert.ok(!output.tex.includes('title={Kaynakça}'));
    assert.ok(output.bib.includes('@article{smith2024,'));
  });

  it('extracts embedded images and preserves figure cross-references', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            { type: 'figureRef', attrs: { figId: 'result figure' } },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'figure',
          attrs: {
            src: onePixelPng,
            caption: 'Primary outcome',
            kind: 'figure',
            figId: 'result figure',
          },
        },
      ],
    };

    const output = buildLatex({ doc, refs: [], style: 'vancouver' });

    assert.deepEqual(output.assets.map((asset) => asset.filename), ['assets/figure-1.png']);
    assert.ok(output.assets[0].base64.length > 0);
    assert.ok(output.tex.includes('Figure~\\ref{fig:result-figure}'));
    assert.ok(output.tex.includes('\\includegraphics[width=\\linewidth'));
    assert.ok(output.tex.includes('{assets/figure-1.png}'));
    assert.ok(output.tex.includes('\\caption{Primary outcome}'));
    assert.ok(output.tex.includes('\\label{fig:result-figure}'));
    assert.equal(output.warnings.length, 1);
    assert.ok(output.warnings[0].includes('numeric-comp'));
  });

  it('can place figure legends after the bibliography without duplicate captions', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'figure',
        attrs: {
          src: onePixelPng,
          caption: 'Primary outcome by treatment group.',
          kind: 'figure',
          figId: 'primary',
        },
      }],
    };
    const output = buildLatex({
      doc,
      refs: [],
      style: 'vancouver',
      figureCaptionPlacement: 'after-bibliography',
    });

    assert.ok(output.tex.includes('\\section*{Figure Legends}'));
    assert.ok(output.tex.indexOf('\\printbibliography') < output.tex.indexOf('\\section*{Figure Legends}'));
    assert.ok(output.tex.includes('\\textbf{Figure 1.} Primary outcome by treatment group.'));
    assert.ok(!output.tex.includes('\\caption{Primary outcome by treatment group.}'));
    assert.ok(output.tex.includes('\\refstepcounter{figure}'));
  });

  it('uses portable author-year biblatex commands for APA citation options', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'citation', attrs: { refIds: ['smith'], locator: 'p. 4' } },
            { type: 'text', text: ' ' },
            { type: 'citation', attrs: { refIds: ['smith'], suppressAuthor: true } },
          ],
        },
      ],
    };

    const output = buildLatex({ doc, refs: [ref], style: 'apa' });
    assert.ok(output.tex.includes('style=authoryear'));
    assert.ok(output.tex.includes('sorting=nyt'));
    assert.ok(output.tex.includes('\\parencite[p. 4]{smith2024}'));
    assert.ok(output.tex.includes('\\mkbibparens{\\citeyear{smith2024}}'));
  });

  it('maps MDPI styles to portable numeric and author-year biblatex modes', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'citation', attrs: { refIds: ['smith'] } }],
      }],
    };

    const acs = buildLatex({ doc, refs: [ref], style: 'mdpi-acs' });
    assert.ok(acs.tex.includes('style=numeric-comp'));
    assert.ok(acs.tex.includes('sorting=none'));
    assert.ok(acs.tex.includes('maxbibnames=10'));
    assert.ok(acs.tex.includes('minbibnames=10'));
    assert.ok(acs.tex.includes('\\cite{smith2024}'));

    const chicago = buildLatex({ doc, refs: [ref], style: 'mdpi-chicago' });
    assert.ok(chicago.tex.includes('style=authoryear'));
    assert.ok(chicago.tex.includes('sorting=nyt'));
    assert.ok(chicago.tex.includes('maxbibnames=10'));
    assert.ok(chicago.tex.includes('minbibnames=10'));
    assert.ok(chicago.tex.includes('\\parencite{smith2024}'));

    const apa = buildLatex({ doc, refs: [ref], style: 'mdpi-apa' });
    assert.ok(apa.tex.includes('style=apa'));
    assert.ok(apa.tex.includes('sorting=nyt'));
  });

  it('reports unsupported external images instead of emitting a broken includegraphics path', () => {
    const output = buildLatex({
      doc: {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'https://example.com/plot.png' } }],
      },
      refs: [],
      style: 'vancouver',
    });

    assert.equal(output.assets.length, 0);
    assert.equal(output.warnings.length, 2);
    assert.ok(output.tex.includes('[external image]'));
    assert.ok(!output.tex.includes('\\includegraphics{https://'));
  });

  it('gives duplicate figure ids unique labels while resolving references to the first', () => {
    const output = buildLatex({
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'figureRef', attrs: { figId: 'same' } }] },
          { type: 'figure', attrs: { figId: 'same', caption: 'First', kind: 'figure' } },
          { type: 'figure', attrs: { figId: 'same', caption: 'Second', kind: 'figure' } },
        ],
      },
      refs: [],
      style: 'vancouver',
    });

    assert.ok(output.tex.includes('Figure~\\ref{fig:same}'));
    assert.ok(output.tex.includes('\\label{fig:same}'));
    assert.ok(output.tex.includes('\\label{fig:same-2}'));
    assert.ok(output.warnings.some((warning) => warning.includes('Duplicate figure/table id')));
  });
});
