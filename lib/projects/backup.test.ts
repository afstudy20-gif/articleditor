import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Project } from '@/store/types';
import { buildBackup, parseBackup, projectFilename, backupFilename } from './backup';

const project = {
  id: 'p1',
  title: 'Kalp Yetmezliği — Çalışma #1',
  refs: [],
} as unknown as Project;

describe('buildBackup / parseBackup round-trip', () => {
  it('produces version-1 JSON that parses back to the same projects', () => {
    const backup = buildBackup([project]);
    assert.equal(backup.version, 1);
    assert.ok(!Number.isNaN(Date.parse(backup.exported)));
    const restored = parseBackup(JSON.stringify(backup));
    assert.equal(restored.version, 1);
    assert.deepEqual(restored.projects, [project]);
  });

  it('accepts legacy payloads that use "notes" instead of "projects"', () => {
    const restored = parseBackup(JSON.stringify({ version: 1, notes: [project] }));
    assert.deepEqual(restored.projects, [project]);
  });

  it('defaults missing version/exported fields', () => {
    const restored = parseBackup(JSON.stringify({ projects: [] }));
    assert.equal(restored.version, 1);
    assert.ok(typeof restored.exported === 'string');
  });
});

describe('parseBackup rejection', () => {
  it('throws on garbage JSON', () => {
    assert.throws(() => parseBackup('not json'));
  });

  it('throws on non-object roots', () => {
    assert.throws(() => parseBackup('null'));
    assert.throws(() => parseBackup('42'));
    assert.throws(() => parseBackup('"str"'));
  });

  it('throws when neither projects nor notes is an array', () => {
    assert.throws(() => parseBackup('{}'));
    assert.throws(() => parseBackup('{"projects": "nope"}'));
  });
});

describe('filenames', () => {
  it('slugifies the project title with diacritics removed', () => {
    const name = projectFilename(project);
    assert.match(name, /^arted-kalp-yetmezligi-calisma-1-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('falls back to "proje" for unusable titles', () => {
    const name = projectFilename({ ...project, title: '???' } as Project);
    assert.match(name, /^arted-proje-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('backupFilename is date-stamped', () => {
    assert.match(backupFilename(), /^arted-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
