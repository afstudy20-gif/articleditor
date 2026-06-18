import type { Ref } from '@/store/types';
import { kvGet } from '@/store/db';

export type RefPdfSource = {
  file: File;
  origin: 'workspace' | 'kv-blob';
};

type RefWithLocalPdfFilename = Ref & { localPdfFilename?: string };
type KvGetFn = <T>(key: string) => Promise<T | undefined>;
type ReadPermissionDescriptor = { mode: 'read' };
type ReadPermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: ReadPermissionDescriptor) => Promise<PermissionState>;
};

let kvGetFn: KvGetFn = kvGet;

export function __setRefSourceKvGetForTest(fn: KvGetFn): () => void {
  const previous = kvGetFn;
  kvGetFn = fn;
  return () => {
    kvGetFn = previous;
  };
}

export function sanitizeProjectDirName(name: string): string {
  return name
    .replace(/^\.+|[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export async function resolvePdfForRef(opts: {
  ref: Ref;
  projectTitle?: string;
  workspaceHandle: FileSystemDirectoryHandle | null;
}): Promise<RefPdfSource | null> {
  const filename = (opts.ref as RefWithLocalPdfFilename).localPdfFilename;

  if (filename && opts.workspaceHandle) {
    const workspaceFile = await readWorkspacePdf({
      root: opts.workspaceHandle,
      projectDir: sanitizeProjectDirName(opts.projectTitle ?? 'project'),
      filename,
    });
    if (workspaceFile) {
      return { file: workspaceFile, origin: 'workspace' };
    }
  }

  const blob = await kvGetFn<Blob>(`pdf-blob:${opts.ref.id}`);
  if (!blob) return null;

  return {
    file: new File([blob], filename || 'ref.pdf', { type: 'application/pdf' }),
    origin: 'kv-blob',
  };
}

async function readWorkspacePdf(opts: {
  root: FileSystemDirectoryHandle;
  projectDir: string;
  filename: string;
}): Promise<File | null> {
  try {
    const permission = await (opts.root as ReadPermissionHandle).queryPermission?.({ mode: 'read' });
    if (permission !== undefined && permission !== 'granted') return null;
  } catch {
    return null;
  }

  return (
    (await readProjectSourcesPdf(opts.root, opts.projectDir, opts.filename)) ??
    (await readSourcesProjectPdf(opts.root, opts.projectDir, opts.filename))
  );
}

async function readProjectSourcesPdf(
  root: FileSystemDirectoryHandle,
  projectDir: string,
  filename: string,
): Promise<File | null> {
  try {
    const projectHandle = await root.getDirectoryHandle(projectDir);
    const sourcesHandle = await projectHandle.getDirectoryHandle('sources');
    const fileHandle = await sourcesHandle.getFileHandle(filename);
    return fileHandle.getFile();
  } catch {
    return null;
  }
}

async function readSourcesProjectPdf(
  root: FileSystemDirectoryHandle,
  projectDir: string,
  filename: string,
): Promise<File | null> {
  try {
    const sourcesHandle = await root.getDirectoryHandle('sources');
    const projectHandle = await sourcesHandle.getDirectoryHandle(projectDir);
    const fileHandle = await projectHandle.getFileHandle(filename);
    return fileHandle.getFile();
  } catch {
    return null;
  }
}
