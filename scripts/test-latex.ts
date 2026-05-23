import { buildLatex } from '../lib/tex/build';
import type { Ref } from '../store/types';

const refs: Ref[] = [
  {
    id: 'r1',
    type: 'journal-article',
    authors: [
      { family: 'Smith', given: 'John' },
      { family: 'Jones', given: 'Kate' },
    ],
    title: 'A study of statins',
    containerTitle: 'NEJM',
    year: 2020,
    volume: '382',
    issue: '10',
    pages: '1234-1245',
    doi: '10.1056/NEJMoa1234567',
  },
  {
    id: 'r2',
    type: 'journal-article',
    authors: [{ family: 'Brown', given: 'Alice' }],
    title: 'Lipid lowering update',
    containerTitle: 'Lancet',
    year: 2021,
  },
];

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Introduction' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Statin therapy has been studied extensively ' },
        { type: 'citation', attrs: { refIds: ['r1'] } },
        { type: 'text', text: '. Combined with other agents ' },
        { type: 'citation', attrs: { refIds: ['r1', 'r2'] } },
        { type: 'text', text: ', outcomes improved.' },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Methods' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'We used ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
        { type: 'text', text: ' and ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
        { type: 'text', text: ' formatting.' },
      ],
    },
  ],
};

const out = buildLatex({ doc, refs, title: 'Statin Outcomes', style: 'vancouver' });
console.log('=== .tex ===');
console.log(out.tex);
console.log('=== .bib ===');
console.log(out.bib);
