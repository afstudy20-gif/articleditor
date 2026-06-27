'use client';

import { useRef, useState } from 'react';
import type { Project, ProjectAsset } from '@/store/types';
import { saveProject } from '@/store/db';
import { newId } from '@/lib/id';
import {
  deleteWorkspacePath,
  ensureWritePermission,
  getWorkspaceRoot,
  isFsAccessSupported,
  saveFileToProjectAssets,
} from '@/lib/fs/workspace';

type Props = {
  project: Project;
  onSaved: (updatedProject: Project) => void;
};

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function assetIcon(asset: ProjectAsset): string {
  const name = asset.name.toLowerCase();
  if (asset.type.includes('pdf') || name.endsWith('.pdf')) return '📕';
  if (asset.type.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return '📝';
  if (asset.type.startsWith('image/')) return '🖼️';
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return '📊';
  return '📎';
}

export function ProjectAssetsPanel({ project, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assets = project.assets ?? [];
  const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);

  const updateProject = async (nextAssets: ProjectAsset[]) => {
    const updatedProject: Project = {
      ...project,
      assets: nextAssets,
      updatedAt: Date.now(),
    };
    await saveProject(updatedProject);
    onSaved(updatedProject);
  };

  const addFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const root = isFsAccessSupported() ? await getWorkspaceRoot() : null;
      const canMirror = root ? await ensureWritePermission(root.handle) : false;
      const newAssets: ProjectAsset[] = [];

      for (const file of selected) {
        const now = Date.now();
        let diskPath: string | undefined;
        if (root && canMirror) {
          try {
            diskPath = (await saveFileToProjectAssets(root.handle, project.title, file)).path;
          } catch {
            diskPath = undefined;
          }
        }
        newAssets.push({
          id: newId('asset'),
          name: file.name || 'file',
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: await fileToDataUrl(file),
          createdAt: now,
          updatedAt: now,
          diskPath,
        });
      }

      await updateProject([...assets, ...newAssets]);
    } catch {
      setError('Dosyalar eklenemedi');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const downloadAsset = (asset: ProjectAsset) => {
    const a = document.createElement('a');
    a.href = asset.dataUrl;
    a.download = asset.name;
    a.click();
  };

  const openAsset = (asset: ProjectAsset) => {
    const win = window.open();
    if (win) {
      win.document.title = asset.name;
      win.location.href = asset.dataUrl;
      return;
    }
    downloadAsset(asset);
  };

  const deleteAsset = async (asset: ProjectAsset) => {
    if (!confirm(`Silinsin mi?\n${asset.name}`)) return;
    setBusy(true);
    setError(null);
    try {
      if (asset.diskPath) {
        const root = isFsAccessSupported() ? await getWorkspaceRoot() : null;
        if (root && (await ensureWritePermission(root.handle))) {
          await deleteWorkspacePath(root.handle, asset.diskPath).catch(() => undefined);
        }
      }
      await updateProject(assets.filter((item) => item.id !== asset.id));
    } catch {
      setError('Dosya silinemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6 flex flex-col justify-between hover:shadow-md transition border-2 border-transparent hover:border-sky-500/20 group relative overflow-hidden bg-white">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
        }}
      />
      <div className="absolute top-0 right-0 p-3 text-3xl opacity-10 group-hover:scale-110 transition duration-300">📦</div>
      <div className="flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="inline-block text-[10px] uppercase font-extrabold tracking-widest text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full mb-3 w-fit">
              HAVUZ
            </span>
            <h2 className="text-xl font-bold text-primary mb-2">📦 Project Dosyaları</h2>
            <p className="text-xs text-secondary leading-relaxed">
              Word, PDF, grafik ve ek dosyalar
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-extrabold text-primary">{assets.length}</div>
            <div className="text-[9px] text-muted uppercase tracking-wider">{formatBytes(totalSize)}</div>
          </div>
        </div>

        <div className="flex-1 min-h-[160px] max-h-[260px] overflow-y-auto mb-6 pr-1 space-y-2">
          {assets.length === 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-full min-h-[140px] flex flex-col items-center justify-center text-center p-4 border border-dashed border-border rounded-xl bg-slate-50/50 hover:bg-slate-50 transition"
            >
              <span className="text-2xl mb-1 opacity-60">📎</span>
              <span className="text-[11px] text-muted max-w-[240px]">Dosya ekle</span>
            </button>
          ) : (
            assets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-white hover:border-sky-500/40 hover:bg-slate-50/20 shadow-sm transition gap-3"
              >
                <button
                  type="button"
                  onClick={() => openAsset(asset)}
                  className="flex items-center gap-2 min-w-0 text-left flex-1"
                >
                  <span className="text-base shrink-0">{assetIcon(asset)}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-primary leading-snug truncate">{asset.name}</span>
                    <span className="block text-[9px] text-muted truncate">
                      {formatBytes(asset.size)}
                      {asset.diskPath ? ` · ${asset.diskPath}` : ''}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadAsset(asset)}
                    className="p-1 text-muted hover:text-sky-700 hover:bg-sky-50 rounded transition"
                    title="İndir"
                  >
                    ⬇️
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAsset(asset)}
                    className="p-1 text-muted hover:text-red hover:bg-red-50 rounded transition"
                    title="Sil"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-red font-semibold mb-2">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-sky-200 text-sky-700 hover:bg-sky-50 transition"
      >
        {busy ? 'Ekleniyor...' : '➕ Dosya Ekle'}
      </button>
    </div>
  );
}
