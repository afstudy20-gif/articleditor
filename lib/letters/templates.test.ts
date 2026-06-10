import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCopyrightTransfer } from './templates';

describe('buildCopyrightTransfer', () => {
  it('builds an English CC BY statement that retains author copyright', () => {
    const output = buildCopyrightTransfer({
      journalName: 'Journal of Tests',
      manuscriptTitle: 'A Clinical Study',
      authors: ['A. Author', 'B. Author'],
      correspondingAuthor: 'A. Author',
      date: '2026-06-11',
      variant: 'cc-by',
      lang: 'en',
    });

    assert.ok(output.includes('OPEN ACCESS LICENSE STATEMENT (CC BY 4.0)'));
    assert.ok(output.includes('The author(s) retain copyright'));
    assert.ok(output.includes('A. Author'));
    assert.ok(output.includes('2026-06-11'));
  });

  it('builds a Turkish transfer agreement with signature rows', () => {
    const output = buildCopyrightTransfer({
      journalName: 'Test Dergisi',
      manuscriptTitle: 'Klinik Çalışma',
      authors: ['A. Yazar'],
      correspondingAuthor: 'A. Yazar',
      variant: 'transfer',
      lang: 'tr',
    });

    assert.ok(output.includes('TELİF HAKKI DEVİR SÖZLEŞMESİ'));
    assert.ok(output.includes('İMZALAR'));
    assert.ok(output.includes('İmza: ____________________'));
  });
});
