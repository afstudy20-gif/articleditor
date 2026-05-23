import { vancouverAuthorList, initialsOf, vancouverAuthor } from '../lib/refs/normalize';
import { buildDocx, assignRecNums } from '../lib/docx/build';
import { parseDocx } from '../lib/docx/parse';
import type { Ref } from '../store/types';
import { writeFile } from 'node:fs/promises';

console.log('initials("Vanessa S.") =', JSON.stringify(initialsOf('Vanessa S.')));
console.log('initials("Kyung Hoon") =', JSON.stringify(initialsOf('Kyung Hoon')));
console.log('initials("J-P") =', JSON.stringify(initialsOf('J-P')));
console.log('initials("J. P.") =', JSON.stringify(initialsOf('J. P.')));
console.log('initials("Fernando P.") =', JSON.stringify(initialsOf('Fernando P.')));

console.log('\nvancouverAuthor({family:"Reddy",given:"Vanessa S."}) =',
  JSON.stringify(vancouverAuthor({ family: 'Reddy', given: 'Vanessa S.' })));

const refs: Ref[] = [
  {
    id: 'r1',
    type: 'journal-article',
    year: 2015,
    title: 'Relationship between serum low-density lipoprotein cholesterol and in-hospital mortality',
    containerTitle: 'Am J Cardiol',
    volume: '115',
    issue: '5',
    pages: '557-562',
    doi: '10.1016/j.amjcard.2014.12.006',
    authors: [
      { family: 'Reddy', given: 'Vanessa S.' },
      { family: 'Bui', given: 'Quang T.' },
      { family: 'Jacobs', given: 'Joan R.' },
      { family: 'Begelman', given: 'Susan M.' },
      { family: 'Miller', given: 'Dave P.' },
      { family: 'French', given: 'William J.' },
    ],
  },
  {
    id: 'r2',
    type: 'journal-article',
    year: 2017,
    title: 'Low-density lipoproteins cause atherosclerotic cardiovascular disease. 1. Evidence from genetic, epidemiologic, and clinical studies',
    containerTitle: 'Eur Heart J',
    volume: '38',
    pages: '2459-2472',
    authors: [
      { family: 'Ference', given: 'Brian A.' },
      { family: 'Ginsberg', given: 'Henry N.' },
      { family: 'Graham', given: 'Ian' },
      { family: 'Ray', given: 'Kausik K.' },
      { family: 'Packard', given: 'Chris J.' },
      { family: 'Bruckert', given: 'Eric' },
      { family: 'Hegele', given: 'Robert' },
      { family: 'Krauss', given: 'Ronald' },
    ],
  },
];

console.log('\n— Vancouver list —');
console.log('Ref 1:', vancouverAuthorList(refs[0].authors, 6));
console.log('Ref 2 (8 authors, 6 cap):', vancouverAuthorList(refs[1].authors, 6));

async function run(): Promise<void> {
  const blob = await buildDocx({
    bodyText: 'Body [1,2].',
    markers: [{ startIndex: 5, endIndex: 10, raw: '[1,2]', refNumbers: [1, 2] }],
    refs: assignRecNums(refs),
    mode: 'active',
  });
  const buf = Buffer.from(await blob.arrayBuffer());
  await writeFile('/tmp/smoke3.docx', buf);
  const re = await parseDocx(buf);
  console.log('\n— Reference paragraphs in output —');
  for (const p of re.paragraphs) {
    if (/^\d+\./.test(p.text.trim())) console.log(' ', p.text.trim());
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
