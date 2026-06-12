import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getGuideline, GUIDELINES } from './guidelines';
import { scanChecklist, checklistToText, type ChecklistState } from './scan';

describe('guideline data', () => {
  it('has CONSORT and STROBE with their sub-lettered rows', () => {
    const consort = getGuideline('consort')!;
    const strobe = getGuideline('strobe')!;
    // Headline "25/22 items" expand to more rows because several topics split
    // into a/b sub-items (e.g. 1a/1b).
    assert.equal(consort.items.length, 37);
    assert.equal(strobe.items.length, 23);
    assert.ok(consort.items.some((i) => i.id === '25'));
    assert.ok(strobe.items.some((i) => i.id === '22'));
  });

  it('every item belongs to a declared section and has bilingual text', () => {
    for (const g of GUIDELINES) {
      const keys = new Set(g.sections.map((s) => s.key));
      for (const item of g.items) {
        assert.ok(keys.has(item.section), `${g.id}/${item.id} section`);
        assert.ok(item.en.length > 0 && item.tr.length > 0, `${g.id}/${item.id} text`);
      }
    }
  });
});

describe('scanChecklist', () => {
  it('flags items whose keywords appear and misses the rest', () => {
    const consort = getGuideline('consort')!;
    const text = 'This randomized trial reports the primary outcome with a 95% CI. Funding was provided by a grant.';
    const res = scanChecklist(text, consort);
    assert.equal(res.total, 37);
    assert.equal(res.status['1a'], 'likely'); // "randomiz"
    assert.equal(res.status['6a'], 'likely'); // "primary outcome"
    assert.equal(res.status['25'], 'likely'); // "funding" / "grant"
    assert.equal(res.status['23'], 'missing'); // no registration keyword
    assert.ok(res.likelyCount >= 3 && res.likelyCount < 25);
  });

  it('treats empty text as all-missing', () => {
    const strobe = getGuideline('strobe')!;
    const res = scanChecklist('', strobe);
    assert.equal(res.likelyCount, 0);
    assert.ok(Object.values(res.status).every((s) => s === 'missing'));
  });
});

describe('checklistToText', () => {
  it('renders decisions, locations and section headers', () => {
    const consort = getGuideline('consort')!;
    const state: ChecklistState = {
      decisions: { '1a': 'addressed', '23': 'na' },
      locations: { '1a': 'p.1' },
    };
    const out = checklistToText(consort, state, { lang: 'en', manuscriptTitle: 'My Trial' });
    assert.ok(out.includes('CONSORT 2010'));
    assert.ok(out.includes('Manuscript: My Trial'));
    assert.ok(out.includes('## Title and abstract'));
    assert.ok(/1a\t\[Yes\] · Loc: p\.1/.test(out));
    assert.ok(/23\t\[N\/A\]/.test(out));
  });

  it('localizes labels in Turkish', () => {
    const strobe = getGuideline('strobe')!;
    const out = checklistToText(strobe, { decisions: { '2': 'addressed' }, locations: {} }, { lang: 'tr' });
    assert.ok(out.includes('Raporlama Kontrol Listesi'));
    assert.ok(out.includes('[Evet]'));
  });
});
