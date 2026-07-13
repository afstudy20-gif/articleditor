import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupBriefcaseFiles } from './drive-briefcase';

describe('groupBriefcaseFiles', () => {
  it('lists a plain (non-chunked) file as-is', () => {
    const entries = groupBriefcaseFiles([
      { id: 'f1', name: 'notes.pdf', mimeType: 'application/pdf', size: '1024', modifiedTime: '2026-01-01T00:00:00Z' },
    ]);
    assert.deepEqual(entries, [
      {
        id: 'f1',
        fileId: 'f1',
        name: 'notes.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        modifiedTime: '2026-01-01T00:00:00Z',
        chunked: false,
      },
    ]);
  });

  it('merges chunked parts into one logical entry, ordered by part index', () => {
    const entries = groupBriefcaseFiles([
      {
        id: 'p2',
        name: 'big.zip.part2of2',
        mimeType: 'application/octet-stream',
        size: '500',
        modifiedTime: '2026-01-02T00:00:00Z',
        appProperties: { arted: 'briefcase', artedGroup: 'g1', artedPart: '2', artedParts: '2', artedSize: '1000', artedType: 'application/zip' },
      },
      {
        id: 'p1',
        name: 'big.zip.part1of2',
        mimeType: 'application/octet-stream',
        size: '500',
        modifiedTime: '2026-01-01T00:00:00Z',
        appProperties: { arted: 'briefcase', artedGroup: 'g1', artedPart: '1', artedParts: '2', artedSize: '1000', artedType: 'application/zip' },
      },
    ]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, 'big.zip');
    assert.equal(entries[0].chunked, true);
    assert.equal(entries[0].size, 1000);
    assert.deepEqual(entries[0].partIds, ['p1', 'p2']);
    assert.equal(entries[0].incomplete, false);
  });

  it('flags a group as incomplete when fewer parts are present than declared', () => {
    const entries = groupBriefcaseFiles([
      {
        id: 'p1',
        name: 'big.zip.part1of3',
        mimeType: 'application/octet-stream',
        size: '500',
        modifiedTime: '2026-01-01T00:00:00Z',
        appProperties: { arted: 'briefcase', artedGroup: 'g1', artedPart: '1', artedParts: '3', artedSize: '1500', artedType: 'application/zip' },
      },
    ]);
    assert.equal(entries[0].incomplete, true);
  });

  it('sorts entries newest-first by modifiedTime', () => {
    const entries = groupBriefcaseFiles([
      { id: 'old', name: 'a.pdf', mimeType: 'application/pdf', size: '10', modifiedTime: '2026-01-01T00:00:00Z' },
      { id: 'new', name: 'b.pdf', mimeType: 'application/pdf', size: '10', modifiedTime: '2026-06-01T00:00:00Z' },
    ]);
    assert.deepEqual(entries.map((e) => e.id), ['new', 'old']);
  });

  it('returns an empty list for no files', () => {
    assert.deepEqual(groupBriefcaseFiles([]), []);
  });
});
