import { splitBodyAndBiblio, parseBiblioLines } from '../lib/refs/parse-biblio';

const AUTO_LIST_DOC = `Some body text [1]. Other claim [2,3]. Continued [4-6].

References
Ray P, Severin F, Blom DJ. Low-density lipoproteins cause atherosclerotic cardiovascular disease. Eur Heart J. 2017;38:2459-2472.
Smith J, Jones K. Lipid lowering therapy update. J Cardiol. 2020;15:123-130.
Brown A, Davis B, Wilson C. Statin tolerability in cardiovascular prevention. Lancet. 2019;392:1500-1510.
Garcia M. PCSK9 inhibitors in clinical practice. N Engl J Med. 2021;385:1023-1034.
Lee S, Kim H. Real-world outcomes in primary prevention. Circulation. 2022;145:e10-e25.`;

const split = splitBodyAndBiblio(AUTO_LIST_DOC);
console.log('Heading:', split.headingFound, '| Body lines:', split.bodyText.split('\n').length, '| Ref lines:', split.refLines.length);
const { refs } = parseBiblioLines(split.refLines);
refs.forEach((r, i) => console.log(`  [${i + 1}]`, r.year, '|', r.title?.slice(0, 50), '|', r.authors.length, 'authors'));
console.log('PASS:', refs.length === 5);
