'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Project, Ref } from '@/store/types';
import { createProject, listProjects, saveProject, deleteProject } from '@/store/db';
import { backupFilename, backupToBlob, buildBackup, parseBackup } from '@/lib/projects/backup';
import { Dropzone } from '@/components/Convert/Dropzone';
import { PasteBox } from '@/components/Convert/PasteBox';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines } from '@/lib/refs/parse-biblio';
import { detectMarkers } from '@/lib/markers/detect';

const EditorClient = dynamic(() => import('./EditorClient').then((m) => m.EditorClient), {
  ssr: false,
  loading: () => <div className="text-muted p-8">Yükleniyor…</div>,
});

function EditPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [conversionBusy, setConversionBusy] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [convTab, setConvTab] = useState<'upload' | 'paste'>('upload');
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProjects().then((ps) => {
      setProjects(ps);
      setLoaded(true);
      const open = searchParams.get('open');
      if (open && ps.some((p) => p.id === open)) {
        setActiveId(open);
        router.replace('/edit');
      }
    });
  }, [searchParams, router]);

  async function newProject(): Promise<void> {
    const p = createProject();
    await saveProject(p);
    const ps = await listProjects();
    setProjects(ps);
    setActiveId(p.id);
  }

  async function refreshList(): Promise<void> {
    setProjects(await listProjects());
  }

  async function exportAll(): Promise<void> {
    const ps = await listProjects();
    const blob = backupToBlob(buildBackup(ps));
    triggerDownload(blob, backupFilename());
  }

  async function importBackup(file: File): Promise<void> {
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      if (!Array.isArray(backup.projects) || backup.projects.length === 0) {
        setImportMsg('Yedek boş.');
        return;
      }
      const existing = await listProjects();
      const existingIds = new Set(existing.map((p) => p.id));
      let added = 0;
      let skipped = 0;
      for (const p of backup.projects) {
        if (!p?.id) continue;
        if (existingIds.has(p.id)) {
          skipped++;
          continue;
        }
        await saveProject({ ...p, updatedAt: p.updatedAt ?? Date.now() });
        added++;
      }
      await refreshList();
      setImportMsg(`${added} proje eklendi, ${skipped} mevcut atlandı.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setImportMsg(`İçeri aktarma hatası: ${msg}`);
    }
  }

  async function handleConvertFile(file: File): Promise<void> {
    setConversionBusy(true);
    setConversionError(null);
    try {
      const buf = await file.arrayBuffer();
      const { plainText } = await parseDocx(buf);
      await convertAndOpen(plainText, file.name.replace(/\.docx$/i, '') || 'Dönüştürülen Makale');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConversionError(`Dosya işlenemedi: ${msg}`);
    } finally {
      setConversionBusy(false);
    }
  }

  async function handleConvertText(text: string): Promise<void> {
    setConversionBusy(true);
    setConversionError(null);
    try {
      await convertAndOpen(text, 'Yapıştırılan Metin');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConversionError(`İşlenemedi: ${msg}`);
    } finally {
      setConversionBusy(false);
    }
  }

  async function convertAndOpen(text: string, defaultTitle: string): Promise<void> {
    const split = splitBodyAndBiblio(text);
    const { refs: parsedRefs } = parseBiblioLines(split.refLines);

    const refsWithIds: Ref[] = parsedRefs.map((r, i) => ({
      ...r,
      id: `r_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    }));

    // Build TipTap doc: paragraphs with citation nodes inserted at [N], [N,M], [N-M] markers.
    const paragraphs = split.bodyText.split(/\r?\n+/).filter((p) => p.trim().length > 0);
    const tiptapDoc = {
      type: 'doc',
      content:
        paragraphs.length > 0
          ? paragraphs.map((para) => ({
              type: 'paragraph',
              content: paragraphToInlineContent(para, refsWithIds),
            }))
          : [{ type: 'paragraph' }],
    };

    const p: Project = createProject({
      title: defaultTitle,
      refs: refsWithIds,
      doc: tiptapDoc,
      bodyText: split.bodyText,
    });
    await saveProject(p);
    const ps = await listProjects();
    setProjects(ps);
    setActiveId(p.id);
  }

  function paragraphToInlineContent(para: string, refs: Ref[]): Array<Record<string, unknown>> {
    const markers = detectMarkers(para);
    if (markers.length === 0) {
      return para.length > 0 ? [{ type: 'text', text: para }] : [];
    }
    const out: Array<Record<string, unknown>> = [];
    let cursor = 0;
    for (const m of markers) {
      if (m.startIndex > cursor) {
        out.push({ type: 'text', text: para.slice(cursor, m.startIndex) });
      }
      const refIds = m.refNumbers
        .map((n) => refs[n - 1]?.id)
        .filter((id): id is string => Boolean(id));
      if (refIds.length > 0) {
        out.push({ type: 'citation', attrs: { refIds } });
      } else {
        // Keep original marker text if no matching ref
        out.push({ type: 'text', text: m.raw });
      }
      cursor = m.endIndex;
    }
    if (cursor < para.length) {
      out.push({ type: 'text', text: para.slice(cursor) });
    }
    return out;
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">Projeler yükleniyor…</div>
    );
  }

  const active = projects.find((p) => p.id === activeId) ?? null;

  if (!active) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-5xl mx-auto px-6 py-8">
          {/* Convert + create flow card */}
          <section className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Yeni proje başlat</h2>
                <p className="text-xs text-muted mt-0.5">
                  Word belgesi yükle veya metin yapıştır → kaynakça otomatik algılanır, editöre düşer. Veya boş projeyle
                  başla.
                </p>
              </div>
              <button className="btn-primary text-sm" onClick={newProject}>
                + Boş proje
              </button>
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-3">
              <button
                onClick={() => setConvTab('upload')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold ${
                  convTab === 'upload' ? 'bg-white shadow-card' : 'text-muted'
                }`}
              >
                Yükle
              </button>
              <button
                onClick={() => setConvTab('paste')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold ${
                  convTab === 'paste' ? 'bg-white shadow-card' : 'text-muted'
                }`}
              >
                Yapıştır
              </button>
            </div>
            {convTab === 'upload' ? (
              <Dropzone onFile={handleConvertFile} />
            ) : (
              <PasteBox onSubmit={handleConvertText} />
            )}
            {conversionBusy && <p className="text-muted text-sm mt-3">İşleniyor, lütfen bekle…</p>}
            {conversionError && (
              <div className="mt-3 card bg-red-bg border-red-200 text-red text-sm p-3">{conversionError}</div>
            )}
          </section>

          {/* Project list section */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-primary">
              Projelerim {projects.length > 0 && <span className="text-muted text-sm">({projects.length})</span>}
            </h2>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary text-xs" onClick={exportAll} disabled={projects.length === 0}>
                Tümünü JSON olarak indir
              </button>
              <button className="btn-secondary text-xs" onClick={() => backupInputRef.current?.click()}>
                JSON yedek yükle
              </button>
              <input
                ref={backupInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) await importBackup(f);
                }}
              />
            </div>
          </div>

          {importMsg && (
            <div className="card text-sm text-secondary p-3 mb-4 border-teal bg-teal-bg/40 flex items-center justify-between">
              <span>{importMsg}</span>
              <button className="text-teal hover:underline text-xs" onClick={() => setImportMsg(null)}>
                kapat
              </button>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-muted text-sm">Henüz proje yok. Yukarıdan başla.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id} className="card p-4 flex items-center justify-between hover:shadow-md transition">
                  <div className="cursor-pointer flex-1" onClick={() => setActiveId(p.id)}>
                    <h3 className="font-semibold text-primary">{p.title}</h3>
                    <p className="text-xs text-muted mt-0.5">
                      {p.refs.length} referans · son güncelleme {new Date(p.updatedAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <button
                    className="btn-danger text-xs"
                    onClick={async () => {
                      if (confirm('Bu projeyi silmek istediğine emin misin?')) {
                        await deleteProject(p.id);
                        await refreshList();
                      }
                    }}
                  >
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    );
  }

  return <EditorClient project={active} onExit={() => setActiveId(null)} onSaved={refreshList} />;
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted">Yükleniyor…</div>}>
      <EditPageInner />
    </Suspense>
  );
}

function Header() {
  return (
    <header className="border-b border-border bg-surface sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-primary">
          <span className="w-7 h-7 rounded-md bg-primary text-teal text-xs flex items-center justify-center font-extrabold">
            ENR
          </span>
          Article Editor
        </Link>
        <span className="text-xs text-muted">Çalışma alanı</span>
      </div>
    </header>
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
