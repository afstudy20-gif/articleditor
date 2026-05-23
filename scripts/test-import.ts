import { importByAutoDetect } from '../lib/refs/import-auto';

const enwSample = `%0 Journal Article
%A Smith, John
%A Jones, Kate
%T A study of the impact of statins on cardiovascular outcomes
%J N Engl J Med
%D 2020
%V 382
%N 10
%P 1234-1245
%R 10.1056/NEJMoa1234567
%X This study evaluated the impact of statin therapy on cardiovascular outcomes.

%0 Journal Article
%A Brown, Alice
%T Second paper on lipid management
%J Lancet
%D 2021
%V 398
%P 567-578
`;

const bibSample = `@article{smith2020,
  author = {Smith, John and Jones, Kate},
  title = {A study of the impact of statins on cardiovascular outcomes},
  journal = {N Engl J Med},
  year = {2020},
  volume = {382},
  number = {10},
  pages = {1234--1245},
  doi = {10.1056/NEJMoa1234567}
}

@article{brown2021,
  author = {Brown, Alice},
  title = {Second paper on lipid management},
  journal = {Lancet},
  year = {2021},
  volume = {398},
  pages = {567--578}
}
`;

const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<xml><records>
<record>
  <ref-type name="Journal Article">17</ref-type>
  <contributors><authors>
    <author>Smith, John</author>
    <author>Jones, Kate</author>
  </authors></contributors>
  <titles>
    <title>A study of the impact of statins on cardiovascular outcomes</title>
    <secondary-title>N Engl J Med</secondary-title>
  </titles>
  <periodical><full-title>N Engl J Med</full-title></periodical>
  <dates><year>2020</year></dates>
  <volume>382</volume><number>10</number><pages>1234-1245</pages>
  <electronic-resource-num>10.1056/NEJMoa1234567</electronic-resource-num>
  <abstract>This study evaluated the impact of statin therapy.</abstract>
</record>
</records></xml>
`;

for (const [name, text] of [['ENW', enwSample], ['BibTeX', bibSample], ['EndNote XML', xmlSample]] as const) {
  console.log(`\n=== ${name} ===`);
  const { format, refs } = importByAutoDetect(text);
  console.log('Format:', format, '| refs:', refs.length);
  refs.forEach((r, i) =>
    console.log(`  [${i + 1}]`, r.year, '|', r.title?.slice(0, 50), '|', r.authors.length, 'authors', '|', r.doi ?? 'no doi'),
  );
}
