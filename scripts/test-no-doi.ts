import { enrichRef } from '../lib/lookup/enrich';
import type { Ref } from '../store/types';

// Simulate what the parser produces: title + first author family + year, no DOI.
const cases: Ref[] = [
  {
    id: 'r1',
    type: 'journal-article',
    authors: [{ family: 'Ference', given: 'BA' }],
    title: 'Low-density lipoproteins cause atherosclerotic cardiovascular disease',
    year: 2017,
    containerTitle: 'Eur Heart J',
  },
  {
    id: 'r2',
    type: 'journal-article',
    authors: [{ family: 'Mach', given: 'F' }],
    title: '2019 ESC/EAS Guidelines for the management of dyslipidaemias',
    year: 2020,
    containerTitle: 'Eur Heart J',
  },
  {
    id: 'r3',
    type: 'journal-article',
    authors: [{ family: 'Reddy', given: 'VS' }],
    title: 'Relationship between serum low-density lipoprotein cholesterol and in-hospital mortality',
    year: 2015,
    containerTitle: 'Am J Cardiol',
  },
];

async function run(): Promise<void> {
  for (const c of cases) {
    console.log(`\n=== ${c.authors[0].family} ${c.year}`);
    const t0 = Date.now();
    const out = await enrichRef(c);
    console.log(`  took ${Date.now() - t0}ms`);
    console.log('  DOI in:', c.doi || 'none');
    console.log('  DOI out:', out.doi || 'none');
    console.log('  PMID:', out.pmid || 'none');
    console.log('  abstract:', out.abstract ? `${out.abstract.slice(0, 80)}...` : 'NONE');
    console.log('  title:', out.title?.slice(0, 70));
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
