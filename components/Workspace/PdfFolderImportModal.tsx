'use client';

import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import type { Ref } from '@/store/types';
import { isFsAccessSupported } from '@/lib/fs/workspace';
import { pdfFileToMarkdown } from '@/lib/pdf/pdf-to-markdown';
import { refFromArticleText } from '@/lib/refs/article-metadata';
import { appendUniqueRefs } from '@/lib/refs/dedupe';

type Props = {
  existingRefs: Ref[];
  onClose: () => void;
  onAddRefs: (refs: Ref[]) => void;
};

type ItemStatus = 'converting' | 'enriching' | 'ok' | 'failed';

type Item = {
  key: string;
  filename: string;
  status: ItemStatus;
  ref?: Ref;
  markdown?: string;
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

/** Best-effort DOI/title enrichment via the server lookup proxy — only
 *  title + first author + year (or a DOI) ever leaves the browser. */
async function enrichViaServer(ref: Ref): Promise<Ref> {
  try {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'enrich', ref }),
    });
    if (!res.ok) return ref;
    const data = (await res.json().catch(() => null)) as { ref?: Ref } | null;
    return data?.ref ?? ref;
  } catch {
    return ref;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function mdFilename(item: Item): string {
  return item.filename.replace(/\.pdf$/i, '').replace(/[\\/]/g, '_') + '.md';
}

function matchesQuery(item: Item, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    item.filename,
    item.ref?.title,
    item.ref?.containerTitle,
    item.ref?.authors.map((a) => a.literal || `${a.family ?? ''} ${a.given ?? ''}`).join(' '),
    item.ref?.year != null ? String(item.ref.year) : '',
    item.ref?.doi,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function PdfFolderImportModal({ existingRefs, onClose, onAddRefs }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
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
        const { text, textPages, markdown } = await pdfFileToMarkdown(file);
        if (textPages === 0) {
          setItems((prev) => prev.map((it) => (
            it.key === path
              ? { ...it, status: 'failed', error: 'Metin katmanı bulunamadı (taranmış PDF olabilir).' }
              : it
          )));
          continue;
        }
        let ref = refFromArticleText({ filename: path, text });
        setItems((prev) => prev.map((it) => (it.key === path ? { ...it, status: 'enriching', ref, markdown } : it)));
        if (ref.doi || ref.title) {
          ref = await enrichViaServer(ref);
        }
        setItems((prev) => prev.map((it) => (it.key === path ? { ...it, status: 'ok', ref } : it)));
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

  const selectedRefs = items.filter((it) => it.status === 'ok' && it.selected && it.ref).map((it) => it.ref!);
  const preview = appendUniqueRefs(existingRefs, selectedRefs);

  const addSelected = () => {
    if (preview.added.length === 0) return;
    onAddRefs(preview.added);
    onClose();
  };

  const downloadOne = (item: Item) => {
    if (!item.markdown) return;
    downloadBlob(new Blob([item.markdown], { type: 'text/markdown' }), mdFilename(item));
  };

  const downloadAllMarkdown = async () => {
    const withMd = items.filter((it) => it.markdown);
    if (withMd.length === 0) return;
    if (withMd.length === 1) {
      downloadOne(withMd[0]);
      return;
    }
    const zip = new JSZip();
    for (const it of withMd) zip.file(mdFilename(it), it.markdown!);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'pdf-markdown.zip');
  };

  const okCount = items.filter((it) => it.status === 'ok').length;
  const failedCount = items.filter((it) => it.status === 'failed').length;
  const withMdCount = items.filter((it) => it.markdown).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <strong className="text-sm">📚 PDF → Markdown / Atıf Kütüphanesi</strong>
          <button type="button" className="ml-auto text-muted hover:text-primary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-xs text-secondary">
            Bir klasör ya da tek/çoklu PDF seç — her biri Markdown&apos;a dönüştürülür (metin, tablo ve
            figürler dahil); makale başlığı, yazar, yıl ve (varsa) DOI/dergi bilgisi otomatik çıkarılır.
            Sonra istediklerini atıf kütüphanesine ekleyebilir ya da Markdown olarak indirebilirsin.
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
                placeholder="Başlık, yazar, dergi veya dosya adında ara…"
                className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-white"
              />

              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>
                  {okCount} bulundu{failedCount > 0 ? `, ${failedCount} başarısız` : ''} · {items.length} PDF
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
                      {it.status === 'enriching' && <span className="text-muted">🔎 Zenginleştiriliyor — {it.ref?.title || it.filename}</span>}
                      {it.status === 'failed' && (
                        <span className="text-red">
                          ⚠️ {it.filename} — {it.error}
                        </span>
                      )}
                      {it.status === 'ok' && it.ref && (
                        <>
                          <div className="font-semibold text-primary truncate">{it.ref.title || it.filename}</div>
                          <div className="text-[10px] text-muted truncate">
                            {(it.ref.authors[0]?.literal || it.ref.authors[0]?.family || '—')}
                            {it.ref.containerTitle ? ` · ${it.ref.containerTitle}` : ''}
                            {it.ref.year ? ` · ${it.ref.year}` : ''}
                            {it.ref.doi ? ` · DOI: ${it.ref.doi}` : ''}
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

              {preview.duplicates.length > 0 && (
                <p className="text-[10px] text-muted">
                  {preview.duplicates.length} seçili öğe kütüphanede zaten var, eklenmeyecek.
                </p>
              )}
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
              disabled={busy || preview.added.length === 0}
              onClick={addSelected}
              className="btn-primary flex-1 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              Kütüphaneye ekle ({preview.added.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
