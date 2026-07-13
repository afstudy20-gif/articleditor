import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getOpenAlexOpenAccess, getOpenAlexByDoi } from './openalex';

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('getOpenAlexOpenAccess', () => {
  it('extracts a legal OA fulltext URL when OpenAlex reports one', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        doi: '10.1000/xyz',
        open_access: { is_oa: true, oa_url: 'https://europepmc.org/articles/PMC123.pdf' },
      })) as typeof fetch;
    const info = await getOpenAlexOpenAccess('10.1000/xyz');
    assert.deepEqual(info, { isOa: true, oaUrl: 'https://europepmc.org/articles/PMC123.pdf' });
  });

  it('reports not-OA when OpenAlex has no open-access location', async () => {
    globalThis.fetch = (async () => jsonResponse({ doi: '10.1000/xyz', open_access: { is_oa: false } })) as typeof fetch;
    const info = await getOpenAlexOpenAccess('10.1000/xyz');
    assert.deepEqual(info, { isOa: false, oaUrl: null });
  });

  it('never returns a link outside OpenAlex/Unpaywall-sourced data (no piracy fallback)', async () => {
    // No open_access field at all — must resolve to "not found", not guess a URL.
    globalThis.fetch = (async () => jsonResponse({ doi: '10.1000/xyz' })) as typeof fetch;
    const info = await getOpenAlexOpenAccess('10.1000/xyz');
    assert.equal(info?.oaUrl, null);
  });

  it('returns null on a failed/missing lookup rather than throwing', async () => {
    globalThis.fetch = (async () => jsonResponse({}, false)) as typeof fetch;
    assert.equal(await getOpenAlexOpenAccess('10.1000/missing'), null);

    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    assert.equal(await getOpenAlexOpenAccess('10.1000/xyz'), null);
  });
});

describe('getOpenAlexByDoi (regression: shares the fetch helper with getOpenAlexOpenAccess)', () => {
  it('still returns bibliographic fields unaffected by the OA-info refactor', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        doi: 'https://doi.org/10.1000/xyz',
        title: 'A Test Paper',
        publication_year: 2021,
        open_access: { is_oa: true, oa_url: 'https://example.org/oa.pdf' },
      })) as typeof fetch;
    const ref = await getOpenAlexByDoi('10.1000/xyz');
    assert.equal(ref?.title, 'A Test Paper');
    assert.equal(ref?.year, 2021);
    assert.equal(ref?.doi, '10.1000/xyz');
  });
});
