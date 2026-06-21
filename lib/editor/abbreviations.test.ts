import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAcronymMatch,
  findExactDefinition,
  extractAbbreviations,
  findSuggestions,
  splitScopes,
  analyzeBlocks,
  type DocBlock,
} from './abbreviations';

function block(text: string, pos: number, opts: { heading?: boolean; table?: boolean } = {}): DocBlock {
  return {
    isTable: opts.table ?? false,
    isHeading: opts.heading ?? false,
    text,
    pieces: [{ text, pos }],
  };
}

describe('isAcronymMatch', () => {
  it('matches standard acronyms', () => {
    assert.equal(isAcronymMatch('AI', 'Artificial Intelligence'), true);
    assert.equal(isAcronymMatch('DNN', 'Deep Neural Network'), true);
    assert.equal(isAcronymMatch('WHO', 'World Health Organization'), true);
  });

  it('matches acronyms with stopwords', () => {
    assert.equal(isAcronymMatch('WWW', 'World Wide Web'), true);
    assert.equal(isAcronymMatch('WHOUN', 'World Health Organization of the United Nations'), true);
  });

  it('matches single-word acronyms in-order', () => {
    assert.equal(isAcronymMatch('EEG', 'electroencephalogram'), true);
    assert.equal(isAcronymMatch('MRI', 'magnetic resonance imaging'), true); // multi-word
  });

  it('returns false for mismatches', () => {
    assert.equal(isAcronymMatch('XYZ', 'Artificial Intelligence'), false);
    assert.equal(isAcronymMatch('ABC', 'Deep Neural Network'), false);
  });
});

describe('findExactDefinition', () => {
  it('extracts correct definitions walking backwards', () => {
    assert.equal(findExactDefinition('DNN', 'We used a Deep Neural Network'), 'Deep Neural Network');
    assert.equal(
      findExactDefinition('WHOUN', 'collaboration with the World Health Organization of the United Nations'),
      'World Health Organization of the United Nations'
    );
  });

  it('returns fallback matches', () => {
    assert.equal(findExactDefinition('EEG', 'an electroencephalogram'), 'electroencephalogram');
  });

  it('returns null on mismatch', () => {
    assert.equal(findExactDefinition('XYZ', 'We used a Deep Neural Network'), null);
  });
});

describe('extractAbbreviations', () => {
  it('finds and counts defined abbreviations', () => {
    const text = `
      First, we introduce the Deep Neural Network (DNN) model.
      Then, the DNN calculates weights. We used another DNN.
      However, we did not define Artificial Intelligence (AI) yet.
    `;
    const list = extractAbbreviations(text);
    assert.equal(list.length, 2);

    const dnn = list.find((item) => item.acronym === 'DNN');
    assert.ok(dnn);
    assert.equal(dnn.definition, 'Deep Neural Network');
    assert.equal(dnn.count, 3);

    const ai = list.find((item) => item.acronym === 'AI');
    assert.ok(ai);
    assert.equal(ai.definition, 'Artificial Intelligence');
    assert.equal(ai.count, 1);
  });
});

describe('findSuggestions', () => {
  it('flags full definition usages without the acronym', () => {
    const text = `
      First, we define Deep Neural Network (DNN).
      In Section 2, we discuss the Deep Neural Network algorithm.
      Finally, we run the DNN.
    `;
    const abbreviations = [
      { acronym: 'DNN', definition: 'Deep Neural Network', count: 1 }
    ];

    const suggestions = findSuggestions(text, abbreviations);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].acronym, 'DNN');
    assert.equal(suggestions[0].definition, 'Deep Neural Network');
  });
});

describe('splitScopes', () => {
  it('separates abstract, main text and each table', () => {
    const blocks: DocBlock[] = [
      block('Abstract', 1, { heading: true }),
      block('Uses magnetic resonance imaging (MRI).', 11),
      block('Introduction', 60, { heading: true }),
      block('We repeated magnetic resonance imaging (MRI) here.', 75),
      block('systolic blood pressure (SBP) row', 200, { table: true }),
    ];
    const { abstract, main, tables, sawAbstract } = splitScopes(blocks);
    assert.equal(sawAbstract, true);
    assert.ok(abstract.some((p) => p.text.includes('Uses magnetic')));
    assert.ok(!abstract.some((p) => p.text.includes('repeated')), 'main text not in abstract');
    assert.ok(main.some((p) => p.text.includes('repeated magnetic')));
    assert.equal(tables.length, 1);
    assert.ok(tables[0].some((p) => p.text.includes('systolic')));
  });

  it('puts everything in main when there is no abstract', () => {
    const { abstract, main, sawAbstract } = splitScopes([block('Just body text (BT) here.', 1)]);
    assert.equal(sawAbstract, false);
    assert.equal(abstract.length, 0);
    assert.ok(main.length > 0);
  });

  it('ignores bibliography content after a references heading', () => {
    const { main } = splitScopes([
      block('Percutaneous coronary intervention (PCI). PCI was successful.', 1),
      block('References', 80, { heading: true }),
      block('A paper mentioning percutaneous coronary intervention in its title.', 95),
    ]);
    assert.ok(main.some((p) => p.text.includes('PCI was successful')));
    assert.ok(!main.some((p) => p.text.includes('A paper mentioning')));
  });
});

describe('analyzeBlocks', () => {
  it('tracks the same acronym independently in abstract and main, with occurrence positions', () => {
    const blocks: DocBlock[] = [
      block('Abstract', 1, { heading: true }),
      block('Magnetic resonance imaging (MRI). MRI is shown.', 11),
      block('Methods', 70, { heading: true }),
      block('Magnetic resonance imaging (MRI) again. MRI helps. MRI again.', 85),
    ];
    const scopes = analyzeBlocks(blocks);
    const abstract = scopes.find((s) => s.kind === 'abstract');
    const main = scopes.find((s) => s.kind === 'main');
    assert.ok(abstract && main);

    const aMri = abstract.abbreviations.find((a) => a.acronym === 'MRI');
    const mMri = main.abbreviations.find((a) => a.acronym === 'MRI');
    assert.ok(aMri && mMri, 'MRI tracked in both scopes');
    assert.equal(aMri.count, 2);
    assert.equal(mMri.count, 3);
    assert.equal(aMri.occurrences.length, 2);

    // Occurrence positions fall inside the abstract block (starts at pos 11).
    for (const occ of aMri.occurrences) {
      assert.ok(occ.from >= 11 && occ.from < 11 + blocks[1].text.length, 'occurrence maps into abstract block');
      assert.equal(occ.to - occ.from, 3);
    }
  });

  it('reports table abbreviations in their own table scope', () => {
    const scopes = analyzeBlocks([
      block('Body without abbreviations.', 1),
      block('Left ventricular ejection fraction (LVEF). LVEF noted.', 100, { table: true }),
    ]);
    const table = scopes.find((s) => s.kind === 'table');
    assert.ok(table);
    assert.equal(table.index, 1);
    assert.ok(table.abbreviations.some((a) => a.acronym === 'LVEF'));
  });

  it('maps repeated full-term suggestions back to editor positions', () => {
    const scopes = analyzeBlocks([
      block('Deep Neural Network (DNN). The Deep Neural Network improved accuracy. DNN remained stable.', 20),
    ]);
    const main = scopes.find((s) => s.kind === 'main');
    assert.ok(main);
    assert.equal(main.suggestions.length, 1);
    assert.equal(main.suggestions[0].acronym, 'DNN');
    assert.equal(main.suggestions[0].textFound, 'Deep Neural Network');
    assert.ok(main.suggestions[0].from != null);
    assert.ok(main.suggestions[0].to != null);
    assert.equal(main.suggestions[0].to! - main.suggestions[0].from!, 'Deep Neural Network'.length);
  });

  it('does not flag repeated full terms inside the bibliography', () => {
    const scopes = analyzeBlocks([
      block('Percutaneous coronary intervention (PCI). PCI was successful.', 1),
      block('References', 80, { heading: true }),
      block('Trial of percutaneous coronary intervention outcomes.', 95),
    ]);
    const main = scopes.find((s) => s.kind === 'main');
    assert.ok(main);
    assert.equal(main.suggestions.length, 0);
  });
});

describe('extractAbbreviations — Turkish letters and cross-lingual acronyms', () => {
  it('extracts Turkish-letter acronyms and their Turkish definitions', () => {
    // Regression: the ASCII-only regex dropped Ç/İ/Ö/Ş entirely.
    const text =
      'Bu çalışmada çıplak metal stent (ÇMS) ve ilaç salınımlı stent (İSS) karşılaştırıldı. ' +
      'Ölüm Bildirim Sistemi (ÖBS) üzerinden veriler toplandı.';
    const list = extractAbbreviations(text);
    const byAcr = new Map(list.map((a) => [a.acronym, a]));
    assert.ok(byAcr.has('ÇMS'), 'ÇMS missing');
    assert.ok(byAcr.has('İSS'), 'İSS missing');
    assert.ok(byAcr.has('ÖBS'), 'ÖBS missing');
    assert.match(byAcr.get('ÇMS')!.definition, /çıplak metal stent/);
    assert.match(byAcr.get('İSS')!.definition, /ilaç salınımlı stent/);
  });

  it('counts occurrences with typographic apostrophes (ÇMS’ye, İSS’nin)', () => {
    // Regression: \b word boundary does not treat Ç as a word char in JS, so
    // "ÇMS’ye" was not counted at all.
    const text =
      'Bu çalışmada çıplak metal stent (ÇMS) ve ilaç salınımlı stent (İSS) kullanıldı. ' +
      "İSS, ÇMS'ye kıyasla üstün. ÇMS’lerin sonuçları ve İSS’nin etkinliği.";
    const list = extractAbbreviations(text);
    const byAcr = new Map(list.map((a) => [a.acronym, a.count]));
    assert.ok((byAcr.get('ÇMS') ?? 0) >= 3, `expected ÇMS count >= 3, got ${byAcr.get('ÇMS')}`);
    assert.ok((byAcr.get('İSS') ?? 0) >= 3, `expected İSS count >= 3, got ${byAcr.get('İSS')}`);
  });

  it('falls back to preceding words for English acronyms in a Turkish text', () => {
    // Regression: "kararsız anjina pektoris (USAP)" was dropped because the
    // initial letters (K-A-P) don't spell USAP. The fallback takes the
    // preceding words as the definition instead of dropping the acronym.
    const text = 'Hastalara stabil anjina pektoris (SAP), kararsız anjina pektoris (USAP) tanısı kondu.';
    const list = extractAbbreviations(text);
    const usap = list.find((a) => a.acronym === 'USAP');
    assert.ok(usap, 'USAP missing');
    assert.match(usap!.definition, /kararsız anjina pektoris/);
  });

  it('handles composite acronyms (NSTEMI) with fewer words than letters', () => {
    const text =
      'ST yükselmesiz miyokard enfarktüsü (NSTEMI) ve ST yükselmeli miyokard enfarktüsü (STEMI) ayrıldı.';
    const list = extractAbbreviations(text);
    const nstemi = list.find((a) => a.acronym === 'NSTEMI');
    const stemi = list.find((a) => a.acronym === 'STEMI');
    assert.ok(nstemi, 'NSTEMI missing');
    assert.ok(stemi, 'STEMI missing');
    assert.match(nstemi!.definition, /yükselmesiz miyokard enfarktüsü/);
    assert.match(stemi!.definition, /yükselmeli miyokard enfarktüsü/);
  });

  it('isAcronymMatch recognizes Turkish initials', () => {
    assert.ok(isAcronymMatch('ÇMS', 'çıplak metal stent'));
    assert.ok(isAcronymMatch('İSS', 'ilaç salınımlı stent'));
    assert.ok(isAcronymMatch('KAH', 'koroner arter hastalığı'));
  });
});
