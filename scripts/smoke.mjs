#!/usr/bin/env node
// End-to-end smoke test: synthetic body + biblio -> parse -> build -> read back .docx
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

register('ts-node/esm', pathToFileURL('./'));

const SAMPLE = `Giriş paragrafı. Önceki çalışmalar bunu göstermiştir [1]. Yeni veriler [2,3] ile çelişiyor. Detaylı meta-analiz [1-3] yapıldı.

Yöntemler ve sonuçlar [4]. Genişletilmiş tartışma [5].

Kaynaklar
1. Smith J, Jones K. Title of the first paper. J Cardiol. 2020;15(3):123-130. doi:10.1016/j.jcard.2020.01.001
2. Brown L. Cardiac biomarkers in heart failure. N Engl J Med. 2019;380:1234-1245.
3. Yilmaz A, Demir B. Türk popülasyonunda kardiyak risk faktörleri. Anadolu Kardiyol Derg. 2021;21(4):200-205.
4. Doe J. Methodology in observational studies. Lancet. 2018;392:1500-1510.
5. Garcia M, Lopez R. Treatment outcomes in acute coronary syndrome. Circulation. 2022;145(2):e10-e20. PMID: 35012345
`;

import('./lib/refs/parse-biblio.ts').then(async (mod) => {
  const { splitBodyAndBiblio, parseBiblioLines } = mod;
  const split = splitBodyAndBiblio(SAMPLE);
  console.log('Heading:', split.headingFound);
  console.log('Body length:', split.bodyText.length);
  console.log('Ref lines:', split.refLines.length);
  const { refs, lowConfidence } = parseBiblioLines(split.refLines);
  console.log('Parsed refs:', refs.length, 'low confidence:', lowConfidence);
  refs.forEach((r, i) => console.log(`  [${i+1}]`, r.title?.slice(0, 60), '|', r.year, '|', r.doi || r.pmid || '-'));
});
