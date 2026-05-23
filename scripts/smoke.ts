import { splitBodyAndBiblio, parseBiblioLines } from '../lib/refs/parse-biblio';
import { detectMarkers } from '../lib/markers/detect';
import { buildDocx } from '../lib/docx/build';
import { refsToRis } from '../lib/refs/ris';
import { parseDocx } from '../lib/docx/parse';
import { writeFile } from 'node:fs/promises';

const SAMPLE = `Giriş paragrafı. Önceki çalışmalar bunu göstermiştir [1]. Yeni veriler [2,3] ile çelişiyor. Detaylı meta-analiz [1-3] yapıldı.

Yöntemler ve sonuçlar [4]. Genişletilmiş tartışma [5].

Kaynaklar
1. Smith J, Jones K. Title of the first paper. J Cardiol. 2020;15(3):123-130. doi:10.1016/j.jcard.2020.01.001
2. Brown L. Cardiac biomarkers in heart failure. N Engl J Med. 2019;380:1234-1245.
3. Yilmaz A, Demir B. Türk popülasyonunda kardiyak risk faktörleri. Anadolu Kardiyol Derg. 2021;21(4):200-205.
4. Doe J. Methodology in observational studies. Lancet. 2018;392:1500-1510.
5. Garcia M, Lopez R. Treatment outcomes in acute coronary syndrome. Circulation. 2022;145(2):e10-e20. PMID: 35012345
`;

async function run(): Promise<void> {
  const split = splitBodyAndBiblio(SAMPLE);
  console.log('— Split —');
  console.log('Heading:', split.headingFound);
  console.log('Body lines:', split.bodyText.split('\n').length);
  console.log('Ref lines:', split.refLines.length);

  const { refs, lowConfidence } = parseBiblioLines(split.refLines);
  console.log('\n— Parsed refs —');
  refs.forEach((r, i) =>
    console.log(`  [${i + 1}]`, JSON.stringify({
      year: r.year,
      title: r.title?.slice(0, 50),
      authors: r.authors.length,
      doi: r.doi,
      pmid: r.pmid,
      conf: r.confidence,
    })),
  );
  console.log('Low confidence indices:', lowConfidence);

  const markers = detectMarkers(split.bodyText);
  console.log('\n— Markers —');
  markers.forEach((m) =>
    console.log(`  raw="${m.raw}" -> refs=${JSON.stringify(m.refNumbers)} @${m.startIndex}-${m.endIndex}`),
  );

  console.log('\n— RIS sample —');
  console.log(refsToRis(refs).split('\n').slice(0, 20).join('\n'));

  console.log('\n— Build active mode docx —');
  const blob = await buildDocx({ bodyText: split.bodyText, refs, markers, mode: 'active' });
  const buf = Buffer.from(await blob.arrayBuffer());
  await writeFile('/tmp/endnotere-smoke.docx', buf);
  console.log('Wrote /tmp/endnotere-smoke.docx', buf.length, 'bytes');

  console.log('\n— Round-trip parse —');
  const re = await parseDocx(buf);
  console.log('Re-parsed paragraphs:', re.paragraphs.length);
  console.log('Re-parsed plainText length:', re.plainText.length);
  console.log('First 200 chars:', re.plainText.slice(0, 200).replace(/\n/g, '\\n'));
  // Check ADDIN EN.CITE present in raw XML
  const hasField = re.documentXml.includes('ADDIN EN.CITE');
  console.log('Has ADDIN EN.CITE in document.xml:', hasField);
  if (!hasField) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
