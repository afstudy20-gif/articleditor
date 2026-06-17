'use client';

import { kvDelete, kvGet, kvSet } from '@/store/db';
import type { Project } from '@/store/types';

/**
 * Local workspace folder integration via the File System Access API.
 *
 * The user picks one root folder once; each project gets its own subfolder and
 * saved PDFs land in `<root>/<project>/sources/`. The directory handle is kept
 * in IndexedDB (structured-cloneable) and is never synced to the cloud.
 */

const ROOT_KEY = 'fs:workspaceRoot';

type StoredRoot = { handle: FileSystemDirectoryHandle; name: string };

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickWorkspaceRoot(): Promise<StoredRoot | null> {
  if (!isFsAccessSupported()) return null;
  const handle = await window.showDirectoryPicker({ id: 'arted-workspace', mode: 'readwrite' });
  const stored: StoredRoot = { handle, name: handle.name };
  await kvSet(ROOT_KEY, stored);
  return stored;
}

export async function getWorkspaceRoot(): Promise<StoredRoot | null> {
  const stored = await kvGet<StoredRoot>(ROOT_KEY);
  return stored ?? null;
}

export async function clearWorkspaceRoot(): Promise<void> {
  await kvDelete(ROOT_KEY);
}

/** Ensure read/write permission, prompting the user when needed (must run in a
 *  user gesture). Returns false when the user denies access. */
export async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

/** True only when write access is already granted — never prompts. Use for
 *  silent, best-effort background mirroring. */
export async function hasWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return (await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted';
}

/** Replace characters that are invalid or awkward in folder/file names. */
export function sanitizeName(name: string, fallback = 'untitled'): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Derive a `.pdf` filename from a File name or a source URL. */
export function derivePdfFilename(source: File | string): string {
  if (typeof source !== 'string') return sanitizeName(source.name || 'document.pdf', 'document.pdf');
  let base = 'document.pdf';
  try {
    const path = new URL(source).pathname;
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    if (last) base = last;
  } catch {
    /* keep default */
  }
  if (!/\.pdf$/i.test(base)) base += '.pdf';
  return sanitizeName(base, 'document.pdf');
}

/**
 * Write `bytes` to `<root>/<projectFolder>/sources/<filename>`. When a file of
 * the same name exists, a numeric suffix is appended so nothing is overwritten.
 * Returns the actual filename used and the human-readable relative path.
 */
export async function savePdfToProjectSources(
  root: FileSystemDirectoryHandle,
  projectName: string,
  filename: string,
  bytes: BufferSource,
): Promise<{ path: string; filename: string }> {
  const projectDirName = sanitizeName(projectName, 'project');
  const projectDir = await root.getDirectoryHandle(projectDirName, { create: true });
  const sourcesDir = await projectDir.getDirectoryHandle('sources', { create: true });

  const finalName = await uniqueName(sourcesDir, filename);
  const fileHandle = await sourcesDir.getFileHandle(finalName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(bytes);
  } finally {
    await writable.close();
  }
  return { path: `${projectDirName}/sources/${finalName}`, filename: finalName };
}

/**
 * Write annotations for a saved PDF to `sources/<pdfStem>.annotations.json` so
 * the drawings travel with the document. `pdfFilename` is the actual name the
 * PDF was saved under (so the two files stay paired).
 */
export async function writeAnnotationsJson(
  root: FileSystemDirectoryHandle,
  projectName: string,
  pdfFilename: string,
  annotations: Record<number, string>,
): Promise<string> {
  const projectDirName = sanitizeName(projectName, 'project');
  const projectDir = await root.getDirectoryHandle(projectDirName, { create: true });
  const sourcesDir = await projectDir.getDirectoryHandle('sources', { create: true });

  const stem = pdfFilename.replace(/\.pdf$/i, '');
  const name = `${stem}.annotations.json`;
  const fileHandle = await sourcesDir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(annotations, null, 2));
  } finally {
    await writable.close();
  }
  return `${projectDirName}/sources/${name}`;
}

/** Serialize a project for on-disk backup. Drops cached embeddings (large,
 *  regenerable) and keeps everything a human or re-import would need. */
export function projectToDiskJson(project: Project): string {
  const refs = project.refs.map((ref) => {
    const copy: Record<string, unknown> = { ...ref };
    delete copy.embedding;
    delete copy.embeddingSource;
    return copy;
  });
  const payload = {
    _schema: 1,
    _exportedFrom: 'arted',
    ...project,
    refs,
  };
  return JSON.stringify(payload, null, 2);
}

/** Write `<root>/<project>/project.json` (overwriting the previous copy). */
export async function writeProjectJson(
  root: FileSystemDirectoryHandle,
  project: Project,
): Promise<string> {
  const dirName = sanitizeName(project.title, 'project');
  const projectDir = await root.getDirectoryHandle(dirName, { create: true });
  const fileHandle = await projectDir.getFileHandle('project.json', { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(projectToDiskJson(project));
  } finally {
    await writable.close();
  }
  return `${dirName}/project.json`;
}

async function uniqueName(dir: FileSystemDirectoryHandle, filename: string): Promise<string> {
  const exists = async (name: string) => {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  };
  if (!(await exists(filename))) return filename;

  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}
