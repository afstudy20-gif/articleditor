import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTitlePageAuthors } from './parse-title-page-author';

describe('parseTitlePageAuthors', () => {
  it('parses a single pasted author with name and affiliation on one line', () => {
    const authors = parseTitlePageAuthors(`Fatih Akkaya Department of Cardiology, Faculty of Medicine, Ordu University, Ordu, Turkiye
ORCID: 0000-0002-9016-4986
Email: drfatihakkaya@gmail.com`);

    assert.deepEqual(authors, [
      {
        name: 'Fatih Akkaya',
        institution: 'Department of Cardiology, Faculty of Medicine, Ordu University, Ordu, Turkiye',
        email: 'drfatihakkaya@gmail.com',
        orcid: '0000-0002-9016-4986',
      },
    ]);
  });

  it('parses multiple authors separated by contact lines', () => {
    const authors = parseTitlePageAuthors(`Fatih Akkaya
Department of Cardiology, Ordu University
ORCID: 0000-0002-9016-4986
Email: drfatihakkaya@gmail.com
Ahmet Kaya
Department of Cardiology, Example University
Email: ahmet@example.com`);

    assert.equal(authors.length, 2);
    assert.equal(authors[0].name, 'Fatih Akkaya');
    assert.equal(authors[1].name, 'Ahmet Kaya');
    assert.equal(authors[1].email, 'ahmet@example.com');
  });

  it('accepts labeled Turkish name lines', () => {
    const authors = parseTitlePageAuthors(`Ad Soyad: Ayse Demir
Kardiyoloji Bölümü, Ordu Üniversitesi
E-posta: ayse@example.com`);

    assert.equal(authors[0].name, 'Ayse Demir');
    assert.equal(authors[0].institution, 'Kardiyoloji Bölümü, Ordu Üniversitesi');
    assert.equal(authors[0].email, 'ayse@example.com');
  });

  it('normalizes common email label variants', () => {
    const authors = parseTitlePageAuthors(`Name: Fatih Akkaya
Department of Cardiology, Ordu University
E-mail address: drfatihakkaya@gmail.com
ORCID: 0000-0002-9016-4986
Name: Ahmet Kaya
Department of Cardiology, Example University
E mail: ahmet@example.com`);

    assert.equal(authors.length, 2);
    assert.equal(authors[0].email, 'drfatihakkaya@gmail.com');
    assert.equal(authors[1].email, 'ahmet@example.com');
  });

  it('parses a single-line parenthetical author block', () => {
    const authors = parseTitlePageAuthors(
      'Nihan Bahadır  Department of Cardiology, Faculty of Medicine, Ordu University, Ordu, Türkiye (ORCID: 0000-0001-6130-1884, Email: dr.nihanbahadir@gmail.com)',
    );

    assert.equal(authors.length, 1);
    assert.equal(authors[0].name, 'Nihan Bahadır');
    assert.equal(
      authors[0].institution,
      'Department of Cardiology, Faculty of Medicine, Ordu University, Ordu, Türkiye',
    );
    assert.equal(authors[0].email, 'dr.nihanbahadir@gmail.com');
    assert.equal(authors[0].orcid, '0000-0001-6130-1884');
  });
});
