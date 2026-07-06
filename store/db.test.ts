import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

// getDb() is browser-guarded and purge/trash helpers read localStorage —
// provide minimal browser globals before importing the module under test.
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

describe('Dexie schema migration v1 → v4', () => {
  before(async () => {
    // Seed a legacy version-1 database exactly as the first release created it.
    const legacy = new Dexie('endnotere-v1');
    legacy.version(1).stores({ projects: 'id, updatedAt' });
    await legacy.open();
    await legacy.table('projects').put({
      id: 'legacy-1',
      title: 'Pre-migration project',
      createdAt: 1,
      updatedAt: 1,
      refs: [{ id: 'r1', type: 'journal-article', authors: [], title: 'Old ref' }],
    });
    legacy.close();
  });

  it('upgrades without dropping existing projects and adds the new stores', async () => {
    const { getDb } = await import('./db');
    const db = getDb();
    await db.open();

    assert.equal(db.verno, 4);
    const survivor = await db.projects.get('legacy-1');
    assert.ok(survivor, 'legacy project must survive the upgrade');
    assert.equal(survivor?.title, 'Pre-migration project');
    assert.equal(survivor?.refs.length, 1);

    const stores = db.tables.map((t) => t.name).sort();
    assert.deepEqual(stores, ['kv', 'phrasebanks', 'projects', 'snapshots']);
  });

  it('snapshot cap prunes oldest snapshots beyond 30', async () => {
    const { getDb, createSnapshot, listSnapshots } = await import('./db');
    getDb();
    for (let i = 0; i < 33; i++) {
      await createSnapshot('legacy-1', { label: `s${i}`, refs: [] });
    }
    const snaps = await listSnapshots('legacy-1');
    // All 33 snapshots land in the same millisecond, so which 3 get pruned is
    // tie-dependent — assert the cap, not a specific ordering.
    assert.equal(snaps.length, 30);
  });

  it('kv store round-trips values', async () => {
    const { kvGet, kvSet, kvDelete } = await import('./db');
    await kvSet('k1', { nested: [1, 2, 3] });
    assert.deepEqual(await kvGet('k1'), { nested: [1, 2, 3] });
    await kvDelete('k1');
    assert.equal(await kvGet('k1'), undefined);
  });

  it('soft delete hides projects from the list and restore brings them back', async () => {
    const { saveProject, listProjects, softDeleteProject, restoreProject, createProject } =
      await import('./db');
    const p = createProject({ title: 'Trash me' });
    await saveProject(p);
    assert.ok((await listProjects()).some((x) => x.id === p.id));
    await softDeleteProject(p.id);
    assert.ok(!(await listProjects()).some((x) => x.id === p.id));
    await restoreProject(p.id);
    assert.ok((await listProjects()).some((x) => x.id === p.id));
  });
});
