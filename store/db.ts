'use client';

import Dexie, { type EntityTable } from 'dexie';
import type { Project } from './types';

export interface AppDB extends Dexie {
  projects: EntityTable<Project, 'id'>;
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
  _db = db;
  return db;
}

export function createProject(partial: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: `p_${now}_${Math.random().toString(36).slice(2, 8)}`,
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
