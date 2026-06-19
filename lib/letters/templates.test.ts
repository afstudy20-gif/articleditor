import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCopyrightTransfer, buildTitlePage } from './templates';

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

describe('buildTitlePage author numbering', () => {
  it('marks each author with a superscript affiliation number, not a jammed digit', () => {
    const output = buildTitlePage({
      manuscriptTitle: 'Study',
      authors: [
        { name: 'John Doe', institution: 'Dept of X', email: 'j@x.com' },
        { name: 'Jane Smith', institution: 'Dept of Y' },
      ],
      lang: 'en',
    });

    // Regression: previously produced "John Doe1" (digit glued to the name).
    assert.ok(!output.includes('John Doe1'), 'name must not be glued to a plain digit');
    assert.ok(output.includes('John Doe¹'), 'first author carries superscript 1');
    assert.ok(output.includes('Jane Smith²'), 'second author carries superscript 2');
    // Affiliation legend keeps plain numbers on their own lines.
    assert.match(output, /\n1 Dept of X, Email: j@x\.com/);
    assert.match(output, /\n2 Dept of Y/);
  });

  it('renders superscript numbers for ten-plus authors', () => {
    const authors = Array.from({ length: 11 }, (_, i) => ({
      name: `Author ${i + 1}`,
      institution: `Dept ${i + 1}`,
    }));
    const output = buildTitlePage({
      manuscriptTitle: 'Big Study',
      authors,
      lang: 'en',
    });
    assert.ok(output.includes('Author 1¹'));
    assert.ok(output.includes('Author 10¹⁰'));
    assert.ok(output.includes('Author 11¹¹'));
  });

  it('falls back to the authorsStr placeholder when no structured authors', () => {
    const output = buildTitlePage({
      manuscriptTitle: 'Study',
      authorsStr: 'Plain text author list',
      lang: 'en',
    });
    assert.ok(output.includes('Plain text author list'));
  });
});
