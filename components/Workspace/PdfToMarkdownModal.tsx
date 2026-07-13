'use client';

import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { isFsAccessSupported } from '@/lib/fs/workspace';
import { pdfFileToMarkdown, markdownFilenameFor } from '@/lib/pdf/pdf-to-markdown';
import { downloadBlob } from '@/lib/download';

type Props = {
  onClose: () => void;
  /** Saves the converted Markdown files back into this project's own asset pool — no citation library involved. */
  onSaveAsAssets: (files: File[]) => void | Promise<void>;
};

type ItemStatus = 'converting' | 'ok' | 'failed';

type Item = {
  key: string;
  filename: string;
  status: ItemStatus;
  markdown?: string;
  pages?: number;
  textPages?: number;
  error?: string;
  selected: boolean;
};

async function collectPdfHandles(
  dirHandle: FileSystemDirectoryHandle,
  prefix = '',
): Promise<Array<{ path: string; handle: FileSystemFileHandle }>> {
  const out: Array<{ path: string; handle: FileSystemFileHandle }> = [];
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (handle.kind === 'directory') {
      out.push(...(await collectPdfHandles(handle, `${prefix}${name}/`)));
    } else if (/\.pdf$/i.test(name)) {
      out.push({ path: `${prefix}${name}`, handle });
    }
  }
  return out;
}

function matchesQuery(item: Item, query: string): boolean {
  if (!query) return true;
  return item.filename.toLowerCase().includes(query.toLowerCase());
}

export function PdfToMarkdownModal({ onClose, onSaveAsAssets }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFiles = async (files: Array<{ path: string; file: File }>) => {
    setBusy(true);
    setError(null);
    const initial: Item[] = files.map(({ path }) => ({
      key: path,
      filename: path,
      status: 'converting',
      selected: true,
    }));
    setItems((prev) => [...prev, ...initial]);

    for (const { path, file } of files) {
      try {
        const { markdown, totalPages, textPages } = await pdfFileToMarkdown(file);
        if (textPages === 0) {
          setItems((prev) => prev.map((it) => (
            it.key === path
              ? { ...it, status: 'failed', error: 'Metin katmanı bulunamadı (taranmış PDF olabilir).' }
              : it
          )));
          continue;
        }
        setItems((prev) => prev.map((it) => (
          it.key === path ? { ...it, status: 'ok', markdown, pages: totalPages, textPages } : it
        )));
      } catch (err) {
        setItems((prev) => prev.map((it) => (
          it.key === path
            ? { ...it, status: 'failed', error: err instanceof Error ? err.message : String(err) }
            : it
        )));
      }
    }
    setBusy(false);
  };

  const pickFolder = async () => {
    setError(null);
    if (!isFsAccessSupported()) {
      folderInputRef.current?.click();
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const handles = await collectPdfHandles(dirHandle);
      if (handles.length === 0) {
        setError('Klasörde PDF bulunamadı.');
        return;
      }
      const files = await Promise.all(
        handles.map(async ({ path, handle }) => ({ path, file: await handle.getFile() })),
      );
      await processFiles(files);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onFileListChosen = async (fileList: FileList | null) => {
    if (!fileList) return;
    const pdfs = Array.from(fileList).filter((f) => /\.pdf$/i.test(f.name));
    if (pdfs.length === 0) {
      setError('Seçilen dosyalar arasında PDF yok.');
      return;
    }
    await processFiles(pdfs.map((file) => ({ path: file.name, file })));
  };

  const toggleSelected = (key: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, selected: !it.selected } : it)));
  };

  const toggleAll = (selected: boolean) => {
    setItems((prev) => prev.map((it) => (it.status === 'ok' ? { ...it, selected } : it)));
  };

  const visibleItems = useMemo(() => items.filter((it) => matchesQuery(it, query)), [items, query]);
  const selectedOk = items.filter((it) => it.status === 'ok' && it.selected && it.markdown);

  const downloadOne = (item: Item) => {
    if (!item.markdown) return;
    downloadBlob(new Blob([item.markdown], { type: 'text/markdown' }), markdownFilenameFor(item.filename));
  };

  const downloadAllMarkdown = async () => {
    const withMd = items.filter((it) => it.markdown);
    if (withMd.length === 0) return;
    if (withMd.length === 1) {
      downloadOne(withMd[0]);
      return;
    }
    const zip = new JSZip();
    for (const it of withMd) zip.file(markdownFilenameFor(it.filename), it.markdown!);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'pdf-markdown.zip');
  };

  const saveSelectedAsAssets = async () => {
    if (selectedOk.length === 0 || saving) return;
    setSaving(true);
    try {
      const files = selectedOk.map(
        (it) => new File([it.markdown!], markdownFilenameFor(it.filename), { type: 'text/markdown' }),
      );
      await onSaveAsAssets(files);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const okCount = items.filter((it) => it.status === 'ok').length;
  const failedCount = items.filter((it) => it.status === 'failed').length;
  const withMdCount = items.filter((it) => it.markdown).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <strong className="text-sm">📝 PDF → Markdown</strong>
          <button type="button" className="ml-auto text-muted hover:text-primary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-xs text-secondary">
            Bir klasör ya da tek/çoklu PDF seç — sadece Markdown&apos;a dönüştürülür (metin, tablo ve
            figürler dahil). Atıf kütüphanesine hiçbir şey eklenmez, dışarıya ağ isteği gitmez. Sonucu
            indirebilir ya da doğrudan bu projenin dosya havuzuna kaydedebilirsin.
          </p>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => void onFileListChosen(e.target.files)}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => void onFileListChosen(e.target.files)}
          />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void pickFolder()}
              className="flex-1 py-3 border border-dashed border-border rounded-xl text-xs font-semibold text-sky-700 hover:bg-sky-50 transition disabled:opacity-50"
            >
              📁 Klasör Seç
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-3 border border-dashed border-border rounded-xl text-xs font-semibold text-sky-700 hover:bg-sky-50 transition disabled:opacity-50"
            >
              📄 PDF Dosyası Seç (tek/çoklu)
            </button>
          </div>

          {error && <p className="text-[11px] text-red font-semibold">{error}</p>}

          {items.length > 0 && (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Dosya adında ara…"
                className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-white"
              />

              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>
                  {okCount} dönüştürüldü{failedCount > 0 ? `, ${failedCount} başarısız` : ''} · {items.length} PDF
                  {query && visibleItems.length !== items.length ? ` · ${visibleItems.length} eşleşme` : ''}
                </span>
                <span className="flex gap-2">
                  <button type="button" className="underline" onClick={() => toggleAll(true)}>Tümünü seç</button>
                  <button type="button" className="underline" onClick={() => toggleAll(false)}>Hiçbirini seçme</button>
                </span>
              </div>

              <div className="border border-border rounded-lg divide-y divide-border">
                {visibleItems.length === 0 && (
                  <p className="p-3 text-[11px] text-muted text-center">Eşleşen sonuç yok.</p>
                )}
                {visibleItems.map((it) => (
                  <div key={it.key} className="flex items-start gap-2 p-2.5 text-xs">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      disabled={it.status !== 'ok'}
                      checked={it.status === 'ok' && it.selected}
                      onChange={() => toggleSelected(it.key)}
                    />
                    <div className="min-w-0 flex-1">
                      {it.status === 'converting' && <span className="text-muted">⏳ Dönüştürülüyor — {it.filename}</span>}
                      {it.status === 'failed' && (
                        <span className="text-red">
                          ⚠️ {it.filename} — {it.error}
                        </span>
                      )}
                      {it.status === 'ok' && (
                        <>
                          <div className="font-semibold text-primary truncate">{it.filename}</div>
                          <div className="text-[10px] text-muted truncate">
                            {it.textPages}/{it.pages} sayfa metin içeriyor
                          </div>
                        </>
                      )}
                    </div>
                    {it.markdown && (
                      <button
                        type="button"
                        onClick={() => downloadOne(it)}
                        className="shrink-0 text-[10px] font-semibold text-sky-700 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded px-2 py-1"
                        title="Markdown indir (.md)"
                      >
                        ⬇️ .md
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-3 border-t border-border flex gap-2">
            <button
              type="button"
              disabled={withMdCount === 0}
              onClick={() => void downloadAllMarkdown()}
              className="btn-secondary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              {withMdCount > 1 ? `Markdown indir (.zip, ${withMdCount})` : 'Markdown indir (.md)'}
            </button>
            <button
              type="button"
              disabled={saving || selectedOk.length === 0}
              onClick={() => void saveSelectedAsAssets()}
              className="btn-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Kaydediliyor...' : `Proje dosyalarına ekle (${selectedOk.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
