import { enrichRef } from '../lib/lookup/enrich';
import type { Ref } from '../store/types';

const cases: Ref[] = [
  {
    id: 'r1',
    type: 'journal-article',
    authors: [{ family: 'Ference', given: 'BA' }],
    title: 'Low-density lipoproteins cause atherosclerotic cardiovascular disease',
    year: 2017,
    doi: '10.1016/j.atherosclerosis.2018.06.216',
    raw: 'Ference BA et al. ...',
  },
  {
    id: 'r2',
    type: 'journal-article',
    authors: [{ family: 'Reddy', given: 'VS' }],
    title: 'Relationship between serum low-density lipoprotein cholesterol and in-hospital mortality',
    year: 2015,
    doi: '10.1016/j.amjcard.2014.12.006',
  },
  {
    id: 'r3',
    type: 'journal-article',
    authors: [{ family: 'Mach', given: 'F' }],
    title: '2019 ESC/EAS Guidelines for the management of dyslipidaemias',
    year: 2019,
    doi: '10.1093/eurheartj/ehz826',
  },
];

async function run(): Promise<void> {
  for (const c of cases) {
    console.log('\n===', c.doi);
    const t0 = Date.now();
    const out = await enrichRef(c);
    console.log(`Took ${Date.now() - t0}ms`);
    console.log('  abstract:', out.abstract ? `${out.abstract.slice(0, 120)}...` : 'NONE');
    console.log('  pmid:', out.pmid);
    console.log('  title:', out.title?.slice(0, 80));
    console.log('  authors[0]:', out.authors[0]?.family, out.authors[0]?.given);
  }
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
