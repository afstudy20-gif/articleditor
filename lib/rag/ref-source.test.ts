import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { Ref } from '@/store/types';
import {
  __setRefSourceKvGetForTest,
  resolvePdfForRef,
  sanitizeProjectDirName,
} from './ref-source';

type FileMap = Record<string, File>;
type DirectoryMap = Record<string, DirectoryStub>;

let restoreKvGet: (() => void) | null = null;

afterEach(() => {
  restoreKvGet?.();
  restoreKvGet = null;
});

describe('sanitizeProjectDirName', () => {
  it('cleans special characters', () => {
    assert.equal(sanitizeProjectDirName('..Bad / Name?:  Test'), '-Bad - Name-- Test');
  });
});

describe('resolvePdfForRef', () => {
  it('returns null when no source exists', async () => {
    mockKvGet();

    const source = await resolvePdfForRef({
      ref: makeRef('ref-1'),
      workspaceHandle: null,
    });

    assert.equal(source, null);
  });

  it('returns a File from kv blob with kv-blob origin', async () => {
    const blob = new Blob(['pdf bytes'], { type: 'application/pdf' });
    mockKvGet({ 'pdf-blob:ref-2': blob });

    const source = await resolvePdfForRef({
      ref: makeRef('ref-2'),
      workspaceHandle: null,
    });

    assert.equal(source?.origin, 'kv-blob');
    assert.equal(source?.file.name, 'ref.pdf');
    assert.equal(source?.file.type, 'application/pdf');
    assert.equal(await source?.file.text(), 'pdf bytes');
  });

  it('prefers workspace over kv blob when both exist', async () => {
    const workspaceFile = new File(['workspace pdf'], 'paper.pdf', { type: 'application/pdf' });
    const kvBlob = new Blob(['kv pdf'], { type: 'application/pdf' });
    mockKvGet({ 'pdf-blob:ref-3': kvBlob });

    const workspaceHandle = new DirectoryStub({
      'My Project': new DirectoryStub({
        sources: new DirectoryStub({}, { 'paper.pdf': workspaceFile }),
      }),
    }).asHandle();

    const source = await resolvePdfForRef({
      ref: makeRef('ref-3', 'paper.pdf'),
      projectTitle: 'My Project',
      workspaceHandle,
    });

    assert.equal(source?.origin, 'workspace');
    assert.equal(source?.file.name, 'paper.pdf');
    assert.equal(await source?.file.text(), 'workspace pdf');
  });

  it('falls back to kv blob when workspace file is missing', async () => {
    const kvBlob = new Blob(['kv fallback'], { type: 'application/pdf' });
    mockKvGet({ 'pdf-blob:ref-4': kvBlob });

    const workspaceHandle = new DirectoryStub().asHandle();
    const source = await resolvePdfForRef({
      ref: makeRef('ref-4', 'missing.pdf'),
      projectTitle: 'Missing Project',
      workspaceHandle,
    });

    assert.equal(source?.origin, 'kv-blob');
    assert.equal(source?.file.name, 'missing.pdf');
    assert.equal(await source?.file.text(), 'kv fallback');
  });
});

function mockKvGet(values: Record<string, Blob> = {}): void {
  restoreKvGet = __setRefSourceKvGetForTest(async <T,>(key: string): Promise<T | undefined> => {
    const value = values[key];
    return value === undefined ? undefined : (value as T);
  });
}

function makeRef(id: string, localPdfFilename?: string): Ref {
  return {
    id,
    type: 'journal-article',
    authors: [],
    ...(localPdfFilename === undefined ? {} : { localPdfFilename }),
  } as Ref & { localPdfFilename?: string };
}

class DirectoryStub {
  constructor(
    private readonly directories: DirectoryMap = {},
    private readonly files: FileMap = {},
  ) {}

  asHandle(): FileSystemDirectoryHandle {
    return {
      kind: 'directory',
      name: 'stub',
      queryPermission: async (): Promise<PermissionState> => 'granted',
      getDirectoryHandle: async (name: string) => {
        const directory = this.directories[name];
        if (!directory) throw new DOMException('Directory not found', 'NotFoundError');
        return directory.asHandle();
      },
      getFileHandle: async (name: string) => {
        const file = this.files[name];
        if (!file) throw new DOMException('File not found', 'NotFoundError');
        return {
          kind: 'file',
          name: file.name,
          getFile: async () => file,
        } as unknown as FileSystemFileHandle;
      },
    } as unknown as FileSystemDirectoryHandle;
  }
}
