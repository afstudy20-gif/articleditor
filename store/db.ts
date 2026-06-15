'use client';

import Dexie, { type EntityTable } from 'dexie';
import { newId } from '@/lib/id';
import type { PhraseCategory, Project, ProjectNote, Snapshot, Ref, UserPhrasebank } from './types';

/** Generic local key/value row. Never synced — used for browser-bound objects
 *  like File System Access directory handles. */
export type KvRow = { key: string; value: unknown };

export interface AppDB extends Dexie {
  projects: EntityTable<Project, 'id'>;
  snapshots: EntityTable<Snapshot, 'id'>;
  phrasebanks: EntityTable<UserPhrasebank, 'id'>;
  kv: EntityTable<KvRow, 'key'>;
}

let _db: AppDB | null = null;

export function getDb(): AppDB {
  if (typeof window === 'undefined') {
    throw new Error('getDb() can only be called in the browser');
  }
  if (_db) return _db;
  const db = new Dexie('endnotere-v1') as AppDB;
  db.version(1).stores({
    projects: 'id, updatedAt',
  });
  // v2 adds versioned snapshots (restore points). Existing projects are
  // untouched — Dexie upgrades add the new object store only.
  db.version(2).stores({
    projects: 'id, updatedAt',
    snapshots: 'id, projectId, createdAt',
  });
  db.version(3).stores({
    projects: 'id, updatedAt',
    snapshots: 'id, projectId, createdAt',
    phrasebanks: 'id, updatedAt',
  });
  // v4 adds a local-only key/value store (e.g. the workspace folder handle).
  db.version(4).stores({
    projects: 'id, updatedAt',
    snapshots: 'id, projectId, createdAt',
    phrasebanks: 'id, updatedAt',
    kv: 'key',
  });
  _db = db;
  return db;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await getDb().kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await getDb().kv.put({ key, value });
}

export async function kvDelete(key: string): Promise<void> {
  await getDb().kv.delete(key);
}

const MAX_SNAPSHOTS_PER_PROJECT = 30;

export async function createSnapshot(
  projectId: string,
  data: { label: string; doc?: unknown; refs: Ref[]; auto?: boolean; wordCount?: number; supplementary?: string },
): Promise<Snapshot> {
  const db = getDb();
  const snap: Snapshot = {
    id: newId('snap'),
    projectId,
    label: data.label,
    createdAt: Date.now(),
    auto: data.auto ?? false,
    doc: data.doc,
    refs: data.refs,
    wordCount: data.wordCount,
    supplementary: data.supplementary,
  };
  await db.snapshots.put(snap);
  // Prune oldest beyond the cap to bound storage.
  const all = await db.snapshots.where('projectId').equals(projectId).sortBy('createdAt');
  if (all.length > MAX_SNAPSHOTS_PER_PROJECT) {
    const excess = all.slice(0, all.length - MAX_SNAPSHOTS_PER_PROJECT);
    await db.snapshots.bulkDelete(excess.map((s) => s.id));
  }
  return snap;
}

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const db = getDb();
  const rows = await db.snapshots.where('projectId').equals(projectId).sortBy('createdAt');
  return rows.reverse(); // newest first
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return getDb().snapshots.get(id);
}

export async function deleteSnapshot(id: string): Promise<void> {
  await getDb().snapshots.delete(id);
}

export function createProject(partial: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: newId('p'),
    title: partial.title ?? 'Yeni Makale',
    createdAt: now,
    updatedAt: now,
    refs: partial.refs ?? [],
    doc: partial.doc,
    bodyText: partial.bodyText,
    settings: partial.settings ?? { style: 'vancouver' },
  };
}

export async function saveProject(p: Project): Promise<void> {
  const db = getDb();
  await db.projects.put({ ...p, updatedAt: Date.now() });
}

export async function listProjects(): Promise<Project[]> {
  const db = getDb();
  const all = await db.projects.orderBy('updatedAt').reverse().toArray();
  return all.filter((p) => !p.deleted);
}

export async function listDeletedProjects(): Promise<Project[]> {
  const db = getDb();
  const all = await db.projects.orderBy('updatedAt').reverse().toArray();
  return all.filter((p) => p.deleted && p.deleted !== 1);
}

export async function softDeleteProject(id: string): Promise<void> {
  const db = getDb();
  const p = await db.projects.get(id);
  if (p) {
    p.deleted = Date.now();
    await saveProject(p);
  }
}

export async function restoreProject(id: string): Promise<void> {
  const db = getDb();
  const p = await db.projects.get(id);
  if (p) {
    p.deleted = null;
    await saveProject(p);
  }
}

export async function purgeProject(id: string): Promise<void> {
  const db = getDb();
  const p = await db.projects.get(id);
  if (p) {
    p.deleted = 1;
    await saveProject(p);
    if (typeof window !== 'undefined' && !localStorage.getItem('gdrive_sync_token')) {
      await db.projects.delete(id);
    }
  }
}

export async function emptyTrash(): Promise<void> {
  const db = getDb();
  const all = await db.projects.toArray();
  const deletedProjects = all.filter((p) => p.deleted && p.deleted !== 1);
  const isSigned = typeof window !== 'undefined' && !!localStorage.getItem('gdrive_sync_token');
  for (const p of deletedProjects) {
    if (isSigned) {
      p.deleted = 1;
      await saveProject(p);
    } else {
      await db.projects.delete(p.id);
    }
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = getDb();
  return db.projects.get(id);
}

export async function addNoteToProject(
  projectId: string,
  note: Omit<ProjectNote, 'id' | 'createdAt'>,
): Promise<ProjectNote> {
  const db = getDb();
  const project = await db.projects.get(projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  const full: ProjectNote = { ...note, id: newId('note'), createdAt: Date.now() };
  const next: Project = {
    ...project,
    notes: [...(project.notes ?? []), full],
    updatedAt: Date.now(),
  };
  await db.projects.put(next);
  return full;
}

export async function deleteNoteFromProject(projectId: string, noteId: string): Promise<void> {
  const db = getDb();
  const project = await db.projects.get(projectId);
  if (!project?.notes) return;
  await db.projects.put({
    ...project,
    notes: project.notes.filter((n) => n.id !== noteId),
    updatedAt: Date.now(),
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.projects.delete(id);
}

export async function createPhrasebank(data: {
  name: string;
  categories: PhraseCategory[];
  sourceFileName?: string;
  active?: boolean;
}): Promise<UserPhrasebank> {
  const db = getDb();
  const now = Date.now();
  const shouldActivate = data.active ?? (await db.phrasebanks.count()) === 0;
  const bank: UserPhrasebank = {
    id: newId('pb'),
    name: data.name.trim() || 'Phrasebank',
    createdAt: now,
    updatedAt: now,
    active: shouldActivate,
    categories: data.categories,
    sourceFileName: data.sourceFileName,
  };
  await db.transaction('rw', db.phrasebanks, async () => {
    if (shouldActivate) {
      const activeRows = (await db.phrasebanks.toArray()).filter((row) => row.active);
      await Promise.all(activeRows.map((row) => db.phrasebanks.update(row.id, { active: false })));
    }
    await db.phrasebanks.put(bank);
  });
  return bank;
}

export async function listPhrasebanks(): Promise<UserPhrasebank[]> {
  const db = getDb();
  return db.phrasebanks.orderBy('updatedAt').reverse().toArray();
}

export async function getActivePhrasebank(): Promise<UserPhrasebank | undefined> {
  const db = getDb();
  const active = (await db.phrasebanks.toArray()).find((row) => row.active);
  if (active) return active;
  return db.phrasebanks.orderBy('updatedAt').reverse().first();
}

export async function updatePhrasebank(
  id: string,
  patch: Partial<Omit<UserPhrasebank, 'id' | 'createdAt'>>,
): Promise<void> {
  await getDb().phrasebanks.update(id, { ...patch, updatedAt: Date.now() });
}

export async function setActivePhrasebank(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.phrasebanks, async () => {
    const rows = await db.phrasebanks.toArray();
    await Promise.all(rows.map((row) => db.phrasebanks.update(row.id, { active: row.id === id })));
  });
}

export async function deletePhrasebank(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.phrasebanks, async () => {
    const existing = await db.phrasebanks.get(id);
    await db.phrasebanks.delete(id);
    if (existing?.active) {
      const next = await db.phrasebanks.orderBy('updatedAt').reverse().first();
      if (next) await db.phrasebanks.update(next.id, { active: true, updatedAt: Date.now() });
    }
  });
}
