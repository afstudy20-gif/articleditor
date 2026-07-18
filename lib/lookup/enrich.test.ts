import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '@/store/types';
import { enrichRef } from './enrich';

// enrichRef talks to CrossRef / OpenAlex / PubMed through global fetch — route
// requests by URL to canned responses so no network is touched.

const realFetch = globalThis.fetch;
let routes: Array<{ match: (url: string) => boolean; respond: () => Response }> = [];
let requested: string[] = [];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  routes = [];
  requested = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    requested.push(url);
    const route = routes.find((r) => r.match(url));
    if (route) return route.respond();
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function ref(overrides: Partial<Ref>): Ref {
  return { id: 'r1', type: 'journal-article', authors: [], ...overrides } as Ref;
}

const CROSSREF_WORK = {
  message: {
    type: 'journal-article',
    author: [{ family: 'Smith', given: 'John' }],
    title: ['A canonical study of things'],
    'container-title': ['Journal of Research'],
    issued: { 'date-parts': [[2020]] },
    volume: '12',
    page: '45-67',
    DOI: '10.1000/xyz',
    abstract: '<jats:p>The abstract body.</jats:p>',
  },
};

describe('enrichRef — DOI path', () => {
  it('cleans DOI prefixes and merges CrossRef metadata into empty fields', async () => {
    routes.push({
      match: (u) => u.includes('api.crossref.org/works/'),
      respond: () => jsonResponse(CROSSREF_WORK),
    });
    const out = await enrichRef(ref({ doi: 'https://doi.org/10.1000/xyz', userNote: 'keep me' }));
    assert.equal(out.doi, '10.1000/xyz');
    assert.equal(out.title, 'A canonical study of things');
    assert.equal(out.year, 2020);
    assert.equal(out.containerTitle, 'Journal of Research');
    assert.equal(out.abstract, 'The abstract body.');
    assert.equal(out.userNote, 'keep me');
    assert.ok(requested.some((u) => u.includes('10.1000%2Fxyz')));
  });

  it('prefers authoritative fetched fields but never blanks fields the fetch lacks', async () => {
    routes.push({
      match: (u) => u.includes('api.crossref.org/works/'),
      respond: () => jsonResponse(CROSSREF_WORK),
    });
    const out = await enrichRef(
      ref({ doi: '10.1000/xyz', pages: '1-2', pmid: '999', abstract: 'my own abstract' }),
    );
    // Exact-DOI match is authoritative: fresh bibliographic fields win…
    assert.equal(out.abstract, 'The abstract body.');
    assert.equal(out.pages, '45-67');
    // …but fields CrossRef did not return survive untouched.
    assert.equal(out.pmid, '999');
  });

  it('fills volume/issue/pages from PubMed when CrossRef omits them (ahead-of-print)', async () => {
    // CrossRef resolves the DOI but has no volume/issue/pages yet (online-first).
    routes.push({
      match: (u) => u.includes('api.crossref.org/works/'),
      respond: () =>
        jsonResponse({
          message: {
            type: 'journal-article',
            author: [{ family: 'Sun', given: 'Y' }],
            title: ['Aggregate index of systemic inflammation'],
            'container-title': ['Anatolian Journal of Cardiology'],
            issued: { 'date-parts': [[2026]] },
            DOI: '10.14744/anatoljcardiol.2026.5439',
            abstract: '<jats:p>Existing abstract.</jats:p>',
          },
        }),
    });
    // PubMed esearch by [doi] resolves the PMID…
    routes.push({
      match: (u) => u.includes('esearch.fcgi'),
      respond: () => jsonResponse({ esearchresult: { idlist: ['41877468'] } }),
    });
    // …and esummary carries the biblio fields CrossRef lacked.
    routes.push({
      match: (u) => u.includes('esummary.fcgi'),
      respond: () =>
        jsonResponse({
          result: {
            uids: ['41877468'],
            '41877468': {
              uid: '41877468',
              title: 'Aggregate index of systemic inflammation',
              source: 'Anatol J Cardiol',
              pubdate: '2026 Mar 24',
              authors: [{ name: 'Sun Y', authtype: 'Author' }],
              volume: '30',
              issue: '7',
              pages: '455-64',
              elocationid: 'doi: 10.14744/AnatolJCardiol.2026.5439',
            },
          },
        }),
    });
    const out = await enrichRef(ref({ doi: '10.14744/anatoljcardiol.2026.5439' }));
    assert.equal(out.volume, '30');
    assert.equal(out.issue, '7');
    assert.equal(out.pages, '455-64');
    assert.equal(out.pmid, '41877468');
    // Pre-existing abstract from CrossRef is not overwritten.
    assert.equal(out.abstract, 'Existing abstract.');
    assert.ok(requested.some((u) => u.includes('esummary.fcgi')));
  });

  it('does not query PubMed when CrossRef already supplies full biblio', async () => {
    routes.push({
      match: (u) => u.includes('api.crossref.org/works/'),
      respond: () =>
        jsonResponse({
          message: {
            type: 'journal-article',
            author: [{ family: 'Smith', given: 'J' }],
            title: ['Complete record'],
            'container-title': ['Journal'],
            issued: { 'date-parts': [[2020]] },
            volume: '5',
            issue: '2',
            page: '10-20',
            DOI: '10.1000/full',
            abstract: '<jats:p>Body.</jats:p>',
          },
        }),
    });
    const out = await enrichRef(ref({ doi: '10.1000/full' }));
    assert.equal(out.volume, '5');
    assert.equal(out.issue, '2');
    assert.equal(out.pages, '10-20');
    assert.ok(!requested.some((u) => u.includes('esearch.fcgi')));
    assert.ok(!requested.some((u) => u.includes('esummary.fcgi')));
  });

  it('returns the ref unchanged (bar DOI cleaning) when all providers fail', async () => {
    // No routes → every fetch 404s; catch()s downgrade to null.
    const original = ref({ doi: 'doi:10.1000/broken.', title: 'Original title' });
    const out = await enrichRef(original);
    assert.equal(out.doi, '10.1000/broken');
    assert.equal(out.title, 'Original title');
  });
});

describe('enrichRef — search path safety', () => {
  it('does not adopt an unrelated candidate from search results', async () => {
    routes.push({
      match: (u) => u.includes('api.crossref.org/works?'),
      respond: () =>
        jsonResponse({
          message: {
            items: [
              {
                type: 'journal-article',
                author: [{ family: 'Completely', given: 'Different' }],
                title: ['Unrelated paper about other topics entirely'],
                issued: { 'date-parts': [[1999]] },
                DOI: '10.9999/other',
              },
            ],
          },
        }),
    });
    const original = ref({
      title: 'Machine learning for cardiac imaging outcomes',
      authors: [{ family: 'Smith', given: 'J' }],
      year: 2021,
    });
    const out = await enrichRef(original);
    assert.equal(out.title, 'Machine learning for cardiac imaging outcomes');
    assert.equal(out.year, 2021);
    assert.notEqual(out.doi, '10.9999/other');
  });
});
