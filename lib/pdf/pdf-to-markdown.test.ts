import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleTitleFromFilename,
  buildPdfMarkdown,
  groupIntoLines,
  splitLineIntoCells,
  renderMarkdownTable,
  renderLinesAsMarkdown,
  markdownFilenameFor,
  type PositionedItem,
} from './pdf-to-markdown';

describe('markdownFilenameFor', () => {
  it('replaces a .pdf extension with .md', () => {
    assert.equal(markdownFilenameFor('smith-2021.pdf'), 'smith-2021.md');
    assert.equal(markdownFilenameFor('Article.PDF'), 'Article.md');
  });

  it('flattens folder separators from a picked-folder relative path', () => {
    assert.equal(markdownFilenameFor('refs/subdir/a.pdf'), 'refs_subdir_a.md');
    assert.equal(markdownFilenameFor('refs\\a.pdf'), 'refs_a.md');
  });
});

describe('articleTitleFromFilename', () => {
  it('strips the extension and collapses separators to spaces', () => {
    assert.equal(articleTitleFromFilename('smith-2021_final.pdf'), 'smith 2021 final');
    assert.equal(articleTitleFromFilename('A.Study.Of.Things.pdf'), 'A Study Of Things');
  });

  it('handles names without separators or extensions', () => {
    assert.equal(articleTitleFromFilename('article'), 'article');
  });
});

describe('buildPdfMarkdown', () => {
  it('produces a heading, source note, page count, and joined page text', () => {
    const md = buildPdfMarkdown('smith-2021.pdf', [
      { pageNo: 1, text: 'Page one text.', images: [] },
      { pageNo: 2, text: 'Page two text.', images: [] },
    ]);
    assert.match(md, /^# smith 2021/);
    assert.match(md, /Source PDF: smith-2021\.pdf/);
    assert.match(md, /Extracted pages: 2\/2/);
    assert.match(md, /Page one text\.\n\nPage two text\./);
    assert.ok(!md.includes('Extracted figures'));
  });

  it('counts only non-empty pages toward "Extracted pages"', () => {
    const md = buildPdfMarkdown('scan.pdf', [
      { pageNo: 1, text: '', images: [] },
      { pageNo: 2, text: 'Some text.', images: [] },
      { pageNo: 3, text: '   ', images: [] },
    ]);
    assert.match(md, /Extracted pages: 1\/3/);
  });

  it('handles a document with zero pages', () => {
    const md = buildPdfMarkdown('empty.pdf', []);
    assert.match(md, /Extracted pages: 0\/0/);
  });

  it('embeds figures as markdown image refs and reports a count', () => {
    const md = buildPdfMarkdown('figs.pdf', [
      { pageNo: 1, text: 'Body text.', images: ['data:image/png;base64,AAA'] },
    ]);
    assert.match(md, /Extracted figures: 1/);
    assert.match(md, /!\[Figure p\.1\.1\]\(data:image\/png;base64,AAA\)/);
  });
});

// Helper to build a positioned item without repeating boilerplate.
function item(str: string, x: number, y: number, width = str.length * 6, hasEOL = false): PositionedItem {
  return { str, x, y, width, hasEOL };
}

describe('groupIntoLines', () => {
  it('groups items with close Y values into one line, in x-order', () => {
    const lines = groupIntoLines([item('Hello', 0, 100), item('world', 40, 101)]);
    assert.equal(lines.length, 1);
    assert.deepEqual(lines[0].items.map((i) => i.str), ['Hello', 'world']);
  });

  it('starts a new line when Y jumps beyond tolerance', () => {
    const lines = groupIntoLines([item('Line one', 0, 100), item('Line two', 0, 80)]);
    assert.equal(lines.length, 2);
  });

  it('respects hasEOL as an explicit line break even without a Y jump', () => {
    const lines = groupIntoLines([item('a', 0, 100, 6, true), item('b', 0, 100)]);
    assert.equal(lines.length, 2);
  });
});

describe('splitLineIntoCells', () => {
  it('keeps normally-spaced words as one cell', () => {
    const cells = splitLineIntoCells([item('The', 0, 0, 18), item('quick', 20, 0, 30), item('fox', 52, 0, 18)]);
    assert.deepEqual(cells, ['The quick fox']);
  });

  it('splits on a large horizontal gap (a real column boundary)', () => {
    const cells = splitLineIntoCells([
      item('Group', 0, 0, 30),
      item('N', 150, 0, 8), // gap of 120 >> threshold
      item('Age', 250, 0, 20),
    ]);
    assert.deepEqual(cells, ['Group', 'N', 'Age']);
  });

  it('returns an empty array for no items', () => {
    assert.deepEqual(splitLineIntoCells([]), []);
  });
});

describe('renderMarkdownTable', () => {
  it('renders a GitHub-flavored pipe table with a header separator', () => {
    const md = renderMarkdownTable([
      ['Group', 'N', 'Age'],
      ['Diabetic', '32', '58.4'],
    ]);
    assert.equal(md, '| Group | N | Age |\n| --- | --- | --- |\n| Diabetic | 32 | 58.4 |');
  });

  it('escapes pipe characters inside cells', () => {
    const md = renderMarkdownTable([['a|b', 'c']]);
    assert.ok(md.includes('a\\|b'));
  });

  it('returns empty string for no rows', () => {
    assert.equal(renderMarkdownTable([]), '');
  });
});

describe('renderLinesAsMarkdown', () => {
  const line = (cells: PositionedItem[], y: number) => ({ y, items: cells });

  it('renders a clean 3-column, 3-row grid as a Markdown table', () => {
    const lines = [
      line([item('Group', 0, 100, 30), item('N', 150, 100, 8), item('Age (y)', 250, 100, 40)], 100),
      line([item('Diabetic', 0, 80, 40), item('32', 150, 80, 12), item('58.4', 250, 80, 20)], 80),
      line([item('Control', 0, 60, 35), item('32', 150, 60, 12), item('56.1', 250, 60, 20)], 60),
    ];
    const md = renderLinesAsMarkdown(lines);
    assert.match(md, /\| Group \| N \| Age \(y\) \|/);
    assert.match(md, /\| --- \| --- \| --- \|/);
    assert.match(md, /\| Diabetic \| 32 \| 58\.4 \|/);
    assert.match(md, /\| Control \| 32 \| 56\.1 \|/);
  });

  it('never misrenders ordinary justified prose as a table', () => {
    const lines = [
      line(
        [
          item('This', 0, 100, 25),
          item('is', 30, 100, 12),
          item('a', 46, 100, 6),
          item('normal', 56, 100, 40),
          item('sentence', 100, 100, 55),
          item('with', 158, 100, 25),
          item('regular', 186, 100, 45),
          item('word', 234, 100, 25),
          item('spacing.', 262, 100, 45),
        ],
        100,
      ),
    ];
    const md = renderLinesAsMarkdown(lines);
    assert.equal(md, 'This is a normal sentence with regular word spacing.');
    assert.ok(!md.includes('|'));
  });

  it('requires at least two consecutive matching-width rows before treating a run as a table', () => {
    const lines = [
      line([item('Group', 0, 100, 30), item('N', 150, 100, 8), item('Age', 250, 100, 20)], 100),
      line([item('A short line.', 0, 80, 80)], 80),
    ];
    const md = renderLinesAsMarkdown(lines);
    assert.ok(!md.includes('|'), 'a single tabular-looking line alone should not become a table');
  });

  it('handles an empty line list', () => {
    assert.equal(renderLinesAsMarkdown([]), '');
  });
});
