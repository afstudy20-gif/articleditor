'use client';

import { useRef, useState } from 'react';
import JSZip from 'jszip';
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
import { queueProjectAssetAction, type ProjectAssetActionType } from '@/lib/assets/pending-action';
import { buildRichDocx } from '@/lib/docx/build-rich';
import { docxFilename, plainTextToTiptapDoc } from '@/lib/docx/plain-text';
import { AcademicImageConverterModal } from '@/components/Workspace/AcademicImageConverterModal';
import type { AcademicImageResult } from '@/lib/image/academic-converter';

type Props = {
  project: Project;
  onSaved: (updatedProject: Project) => void;
  onOpenManuscript: () => void;
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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeFilename(name: string, fallback = 'file'): string {
  const clean = name
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '');
  return clean || fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function assetIcon(asset: ProjectAsset): string {
  const name = asset.name.toLowerCase();
  if (asset.type.includes('pdf') || name.endsWith('.pdf')) return '📕';
  if (asset.type.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return '📝';
  if (asset.type.startsWith('image/')) return '🖼️';
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return '📊';
  return '📎';
}

function formatAddedAt(time: number): string {
  return new Date(time).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isDocx(asset: ProjectAsset): boolean {
  return /\.docx$/i.test(asset.name) || asset.type.includes('wordprocessingml');
}

function isPdf(asset: ProjectAsset): boolean {
  return /\.pdf$/i.test(asset.name) || asset.type.includes('pdf');
}

function isImage(asset: ProjectAsset): boolean {
  return asset.type.startsWith('image/');
}

function isTableLike(asset: ProjectAsset): boolean {
  return /\.(xlsx|csv|tsv|txt|html?)$/i.test(asset.name) || /text\/(csv|tab-separated-values|plain|html)/i.test(asset.type);
}

export function ProjectAssetsPanel({ project, onSaved, onOpenManuscript }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuAssetId, setMenuAssetId] = useState<string | null>(null);
  const [converterAsset, setConverterAsset] = useState<ProjectAsset | null>(null);
  const assets = project.assets ?? [];
  const submissionAssets = assets.filter((asset) => asset.submissionIncluded);
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
    downloadBlob(new Blob([dataUrlToBytes(asset.dataUrl)], { type: asset.type }), asset.name);
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

  const runManuscriptAction = (asset: ProjectAsset, type: ProjectAssetActionType) => {
    queueProjectAssetAction({ projectId: project.id, assetId: asset.id, type });
    setMenuAssetId(null);
    onOpenManuscript();
  };

  const openPdfReader = (asset: ProjectAsset, scan = false) => {
    try {
      const params = new URLSearchParams({
        projectId: project.id,
        assetId: asset.id,
        viewer: 'arted',
      });
      if (scan) params.set('scan', '1');
      window.open(`/reader?${params.toString()}`, '_blank', 'noopener,noreferrer');
      setMenuAssetId(null);
    } catch {
      setError('PDF reader açılamadı');
    }
  };

  const toggleSubmission = async (asset: ProjectAsset) => {
    setMenuAssetId(null);
    await updateProject(assets.map((item) => (
      item.id === asset.id
        ? { ...item, submissionIncluded: !item.submissionIncluded, updatedAt: Date.now() }
        : item
    )));
  };

  const saveConvertedImage = async (result: AcademicImageResult) => {
    const file = new File([result.blob], result.filename, { type: result.blob.type || 'application/octet-stream' });
    const now = Date.now();
    let diskPath: string | undefined;
    const root = isFsAccessSupported() ? await getWorkspaceRoot() : null;
    if (root && (await ensureWritePermission(root.handle))) {
      try {
        diskPath = (await saveFileToProjectAssets(root.handle, project.title, file)).path;
      } catch {
        diskPath = undefined;
      }
    }
    await updateProject([
      ...assets,
      {
        id: newId('asset'),
        name: result.filename,
        type: file.type,
        size: file.size,
        dataUrl: await fileToDataUrl(file),
        createdAt: now,
        updatedAt: now,
        diskPath,
      },
    ]);
  };

  const exportSubmissionPackage = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setError(null);
    try {
      const zip = new JSZip();
      const rootName = safeFilename(project.title, 'submission');
      const refsById = new Map(project.refs.map((ref) => [ref.id, ref]));
      const refOrder = new Map(project.refs.map((ref, index) => [ref.id, index + 1]));

      if (project.doc) {
        const manuscript = await buildRichDocx({
          doc: project.doc,
          refsById,
          refOrder,
          style: (project.settings?.style as any) ?? 'vancouver',
          mode: 'plain',
          title: project.title,
          abstractText: project.abstractText,
          keywords: project.keywords,
          includeDocumentTitle: true,
          includeBibliography: true,
          figureCaptionPlacement: project.settings?.figureCaptionPlacement ?? 'inline',
          fontFamily: project.settings?.fontFamily,
        });
        zip.file(`manuscript/${docxFilename(project.title)}`, await manuscript.arrayBuffer());
      }

      for (const document of project.documents ?? []) {
        const blob = await buildRichDocx({
          doc: plainTextToTiptapDoc(document.content),
          refsById,
          refOrder,
          style: 'vancouver',
          mode: 'plain',
          title: document.title,
          includeDocumentTitle: false,
          includeBibliography: false,
        });
        zip.file(`documents/${docxFilename(document.title)}`, await blob.arrayBuffer());
      }

      for (const asset of submissionAssets) {
        zip.file(`assets/${safeFilename(asset.name, 'asset')}`, dataUrlToBytes(asset.dataUrl));
      }

      zip.file('manifest.json', JSON.stringify({
        projectId: project.id,
        title: project.title,
        exportedAt: new Date().toISOString(),
        manuscriptIncluded: Boolean(project.doc),
        documents: (project.documents ?? []).map((document) => ({
          id: document.id,
          title: document.title,
          type: document.type,
          updatedAt: document.updatedAt,
        })),
        assets: submissionAssets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          size: asset.size,
          createdAt: asset.createdAt,
        })),
      }, null, 2));

      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
      downloadBlob(blob, `${rootName}-submission.zip`);
    } catch {
      setError('Submission paketi oluşturulamadı');
    } finally {
      setExportBusy(false);
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
                    <span className="block text-xs font-bold text-primary leading-snug truncate">
                      {asset.name}
                      {asset.submissionIncluded && (
                        <span className="ml-1 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1 py-0.5 align-middle">
                          paket
                        </span>
                      )}
                    </span>
                    <span className="block text-[9px] text-muted truncate">
                      {formatBytes(asset.size)} · Eklendi: {formatAddedAt(asset.createdAt)}
                      {asset.diskPath ? ` · ${asset.diskPath}` : ''}
                    </span>
                  </span>
                </button>
                <div className="relative flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMenuAssetId((current) => current === asset.id ? null : asset.id)}
                    className="text-[10px] font-bold text-sky-700 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-md px-2 py-1 transition"
                    title="Use"
                  >
                    Use
                  </button>
                  {menuAssetId === asset.id && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setMenuAssetId(null)}
                        aria-label="Menüyü kapat"
                      />
                      <div className="absolute right-0 top-8 z-50 w-52 rounded-lg border border-border bg-white shadow-lg p-1 text-left">
                        <button
                          type="button"
                          disabled={!isDocx(asset)}
                          onClick={() => runManuscriptAction(asset, 'import-docx')}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Editöre aktar
                        </button>
                        <button
                          type="button"
                          disabled={!isPdf(asset)}
                          onClick={() => openPdfReader(asset)}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          PDF reader’da aç
                        </button>
                        <button
                          type="button"
                          disabled={!isPdf(asset)}
                          onClick={() => openPdfReader(asset, true)}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Atıf kütüphanesine aktar
                        </button>
                        <button
                          type="button"
                          disabled={!isImage(asset)}
                          onClick={() => runManuscriptAction(asset, 'insert-figure')}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Figure ekle
                        </button>
                        <button
                          type="button"
                          disabled={!isImage(asset)}
                          onClick={() => {
                            setConverterAsset(asset);
                            setMenuAssetId(null);
                          }}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Akademik görsel dönüştür
                        </button>
                        <button
                          type="button"
                          disabled={!isTableLike(asset)}
                          onClick={() => runManuscriptAction(asset, 'import-table')}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Tabloya aktar
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleSubmission(asset)}
                          className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-slate-50"
                        >
                          {asset.submissionIncluded ? 'Submission paketinden çıkar' : 'Submission paketine ekle'}
                        </button>
                      </div>
                    </>
                  )}
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
      {submissionAssets.length > 0 && (
        <button
          type="button"
          disabled={exportBusy}
          onClick={() => void exportSubmissionPackage()}
          className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 mb-2"
        >
          {exportBusy ? 'Paket hazırlanıyor...' : `Submission ZIP indir (${submissionAssets.length})`}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="btn-secondary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-sky-200 text-sky-700 hover:bg-sky-50 transition"
      >
        {busy ? 'Ekleniyor...' : '➕ Dosya Ekle'}
      </button>
      {converterAsset && (
        <AcademicImageConverterModal
          asset={converterAsset}
          onClose={() => setConverterAsset(null)}
          onSave={saveConvertedImage}
        />
      )}
    </div>
  );
}
