'use client';

import { useRef, useState } from 'react';
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

export function PdfFolderImportModal({ existingRefs, onClose, onAddRefs }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setItems(initial);

    for (const { path, file } of files) {
      try {
        const { text, textPages } = await pdfFileToMarkdown(file);
        if (textPages === 0) {
          setItems((prev) => prev.map((it) => (
            it.key === path
              ? { ...it, status: 'failed', error: 'Metin katmanı bulunamadı (taranmış PDF olabilir).' }
              : it
          )));
          continue;
        }
        let ref = refFromArticleText({ filename: path, text });
        setItems((prev) => prev.map((it) => (it.key === path ? { ...it, status: 'enriching', ref } : it)));
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
    if (isFsAccessSupported()) {
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
      return;
    }
    fileInputRef.current?.click();
  };

  const onFileInputChange = async (fileList: FileList | null) => {
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

  const selectedRefs = items.filter((it) => it.status === 'ok' && it.selected && it.ref).map((it) => it.ref!);
  const preview = appendUniqueRefs(existingRefs, selectedRefs);

  const addSelected = () => {
    if (preview.added.length === 0) return;
    onAddRefs(preview.added);
    onClose();
  };

  const okCount = items.filter((it) => it.status === 'ok').length;
  const failedCount = items.filter((it) => it.status === 'failed').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <strong className="text-sm">📚 PDF Klasöründen Atıf Kütüphanesine Aktar</strong>
          <button type="button" className="ml-auto text-muted hover:text-primary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-xs text-secondary">
            Bir klasör seç — içindeki tüm PDF&apos;ler taranır, makale başlığı, yazar, yıl ve (varsa) DOI/dergi
            bilgisi otomatik çıkarılır. Sonra istediklerini atıf kütüphanesine ekleyebilirsin.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => void onFileInputChange(e.target.files)}
          />

          {items.length === 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void pickFolder()}
              className="w-full py-8 border border-dashed border-border rounded-xl text-sm font-semibold text-sky-700 hover:bg-sky-50 transition disabled:opacity-50"
            >
              📁 {isFsAccessSupported() ? 'Klasör Seç' : 'PDF Dosyalarını Seç'}
            </button>
          )}

          {error && <p className="text-[11px] text-red font-semibold">{error}</p>}

          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>
                  {okCount} bulundu{failedCount > 0 ? `, ${failedCount} başarısız` : ''} · {items.length} PDF
                </span>
                <span className="flex gap-2">
                  <button type="button" className="underline" onClick={() => toggleAll(true)}>Tümünü seç</button>
                  <button type="button" className="underline" onClick={() => toggleAll(false)}>Hiçbirini seçme</button>
                </span>
              </div>

              <div className="border border-border rounded-lg divide-y divide-border">
                {items.map((it) => (
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
          <div className="p-3 border-t border-border">
            <button
              type="button"
              disabled={busy || preview.added.length === 0}
              onClick={addSelected}
              className="btn-primary w-full py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              Kütüphaneye ekle ({preview.added.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
