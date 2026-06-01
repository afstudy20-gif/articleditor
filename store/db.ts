'use client';

import Dexie, { type EntityTable } from 'dexie';
import { newId } from '@/lib/id';
import type { Project, Snapshot, Ref } from './types';

export interface AppDB extends Dexie {
  projects: EntityTable<Project, 'id'>;
  snapshots: EntityTable<Snapshot, 'id'>;
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
  _db = db;
  return db;
}

const MAX_SNAPSHOTS_PER_PROJECT = 30;

export async function createSnapshot(
  projectId: string,
  data: { label: string; doc?: unknown; refs: Ref[]; auto?: boolean; wordCount?: number },
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
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = getDb();
  return db.projects.get(id);
}

export async function deleteProject(id: string): Promise<void> {
  const db = getDb();
  await db.projects.delete(id);
}
