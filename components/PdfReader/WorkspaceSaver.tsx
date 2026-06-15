'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProject } from '@/store/db';
import {
  derivePdfFilename,
  ensureWritePermission,
  getWorkspaceRoot,
  isFsAccessSupported,
  pickWorkspaceRoot,
  savePdfToProjectSources,
  writeAnnotationsJson,
  writeProjectJson,
} from '@/lib/fs/workspace';
import { docKeyForSource, loadAnnotations } from '@/lib/pdf/annotations';

type Props = {
  source: File | string | null;
  projectId: string | null;
  onToast: (message: string) => void;
};

async function getPdfBytes(source: File | string): Promise<Uint8Array> {
  if (typeof source !== 'string') {
    return new Uint8Array(await source.arrayBuffer());
  }
  const response = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(source)}`);
  if (!response.ok) {
    throw new Error(`PDF alınamadı (HTTP ${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function downloadFallback(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WorkspaceSaver({ source, projectId, onToast }: Props) {
  const [rootName, setRootName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supported = isFsAccessSupported();

  useEffect(() => {
    getWorkspaceRoot().then((root) => setRootName(root?.name ?? null));
  }, []);

  const choose = useCallback(async () => {
    try {
      const root = await pickWorkspaceRoot();
      if (root) {
        setRootName(root.name);
        onToast(`Çalışma klasörü: ${root.name}`);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      onToast('Klasör seçilemedi');
    }
  }, [onToast]);

  const save = useCallback(async () => {
    if (!source) {
      onToast('Önce bir PDF açın');
      return;
    }
    setSaving(true);
    try {
      const filename = derivePdfFilename(source);
      const bytes = await getPdfBytes(source);

      // Browsers without File System Access (Firefox/Safari) fall back to a
      // normal download so the file is still saved somewhere.
      if (!supported) {
        downloadFallback(bytes, filename);
        onToast(`İndirildi: ${filename}`);
        return;
      }

      if (!projectId) {
        onToast('Önce bir proje seçin');
        return;
      }
      const root = await getWorkspaceRoot();
      if (!root) {
        onToast('Önce çalışma klasörü seçin');
        return;
      }
      if (!(await ensureWritePermission(root.handle))) {
        onToast('Klasör izni verilmedi');
        return;
      }
      const project = await getProject(projectId);
      const projectName = project?.title ?? 'project';
      const { path, filename: savedName } = await savePdfToProjectSources(
        root.handle,
        projectName,
        filename,
        bytes,
      );
      // Mirror project metadata (refs + notes) next to the sources.
      if (project) {
        await writeProjectJson(root.handle, project);
      }
      // Mirror this PDF's annotations so the drawings travel with the document.
      const annotations = await loadAnnotations(docKeyForSource(source));
      if (Object.keys(annotations).length > 0) {
        await writeAnnotationsJson(root.handle, projectName, savedName, annotations);
      }
      onToast(`Kaydedildi: ${path}`);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }, [source, projectId, supported, onToast]);

  return (
    <div className="flex items-center gap-2">
      {supported && (
        <button
          type="button"
          onClick={choose}
          title={rootName ? `Çalışma klasörü: ${rootName}` : 'Çalışma klasörü seç'}
          className="flex max-w-[12rem] items-center gap-1 truncate rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          📁 {rootName ? rootName : 'Klasör seç'}
        </button>
      )}
      <button
        type="button"
        onClick={save}
        disabled={saving || !source}
        title={supported ? 'PDF’i projenin sources klasörüne kaydet' : 'PDF’i indir'}
        className="rounded bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? 'Kaydediliyor…' : supported ? 'Kaynaklara kaydet' : 'PDF indir'}
      </button>
    </div>
  );
}
