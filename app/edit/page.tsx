'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Project, Ref } from '@/store/types';
import {
  createProject,
  listProjects,
  saveProject,
  deleteProject,
  listDeletedProjects,
  softDeleteProject,
  restoreProject,
  purgeProject,
  emptyTrash,
} from '@/store/db';
import * as gdrive from '@/lib/sync/google-drive';
import Script from 'next/script';
import { backupFilename, backupToBlob, buildBackup, parseBackup } from '@/lib/projects/backup';
import { Dropzone } from '@/components/Convert/Dropzone';
import { PasteBox } from '@/components/Convert/PasteBox';
import { useLang } from '@/lib/i18n/hooks';
import { newId } from '@/lib/id';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines } from '@/lib/refs/parse-biblio';
import { detectMarkers } from '@/lib/markers/detect';

const EditorClient = dynamic(() => import('./EditorClient').then((m) => m.EditorClient), {
  ssr: false,
  loading: () => <div className="text-muted p-8">Loading…</div>,
});

function EditPageInner() {
  const { t, lang } = useLang();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [conversionBusy, setConversionBusy] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [convTab, setConvTab] = useState<'upload' | 'paste'>('upload');
  const [syncState, setSyncState] = useState<gdrive.SyncState | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setClientIdInput(gdrive.getClientId());
    listProjects().then((ps) => {
      setProjects(ps);
      setLoaded(true);
      const open = searchParams.get('open');
      if (open && ps.some((p) => p.id === open)) {
        setActiveId(open);
        router.replace('/edit');
      }
    });

    listDeletedProjects().then((ps) => {
      setDeletedProjects(ps);
    });

    gdrive.init().catch((e) => console.warn('[sync] init failed', e));

    const unsub = gdrive.onChange((state) => {
      setSyncState(state);
      if (state.status === 'ok') {
        refreshList();
      }
    });

    return () => {
      unsub();
    };
  }, [searchParams, router]);

  async function newProject(): Promise<void> {
    const p = createProject();
    await saveProject(p);
    gdrive.markDirty(p.id);
    await refreshList();
    setActiveId(p.id);
  }

  async function refreshList(): Promise<void> {
    setProjects(await listProjects());
    setDeletedProjects(await listDeletedProjects());
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
        gdrive.markDirty(p.id);
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

    const refsWithIds: Ref[] = parsedRefs.map((r) => ({
      ...r,
      id: newId('r'),
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
    gdrive.markDirty(p.id);
    await refreshList();
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
      <div className="min-h-screen flex items-center justify-center text-muted">{t('app_loading')}</div>
    );
  }

  const active = projects.find((p) => p.id === activeId) ?? null;

  if (!active) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-5xl mx-auto px-6 py-8">
          {/* Google Drive Sync Section */}
          {syncState && (
            <section className="card p-5 mb-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                    ☁️ {t('gdrive_sync_title')}
                    {syncState.status === 'syncing' && (
                      <span className="animate-spin text-teal text-sm">🔄</span>
                    )}
                    {syncState.status === 'ok' && (
                      <span className="text-emerald-500 text-sm">✓</span>
                    )}
                    {syncState.status === 'error' && (
                      <span className="text-rose-500 text-sm" title={syncState.message}>⚠️</span>
                    )}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    {t('gdrive_sync_desc')}
                  </p>
                  {syncState.lastSync && (
                    <p className="text-xs text-secondary mt-1 font-semibold">
                      {t('gdrive_last_sync')}: {new Date(syncState.lastSync).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {syncState.signedIn && syncState.user ? (
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-border">
                      {syncState.user.picture ? (
                        <img
                          src={syncState.user.picture}
                          alt="Avatar"
                          className="w-8 h-8 rounded-full border border-border"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-teal text-white flex items-center justify-center font-bold text-xs">
                          U
                        </span>
                      )}
                      <div className="text-left">
                        <p className="text-xs font-bold text-primary leading-tight">{syncState.user.name || 'Google User'}</p>
                        <p className="text-[10px] text-muted leading-tight">{syncState.user.email || ''}</p>
                      </div>
                      <button
                        onClick={() => gdrive.signOut()}
                        className="text-xs text-rose-600 hover:underline ml-2 font-medium"
                      >
                        {t('gdrive_disconnect')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => gdrive.signIn()}
                      className="btn-primary text-xs flex items-center gap-2 px-4 py-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 48 48" className="shrink-0">
                        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.5 30.2 0 24 0 14.7 0 6.7 5.5 2.8 13.5l7.8 6C12.5 13.2 17.8 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/>
                        <path fill="#FBBC05" d="M10.6 28.5c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.2 0 20 0 24s1 7.8 2.8 11.1l7.8-6.6z"/>
                        <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-3.7-13.4-9l-7.8 6C6.7 42.5 14.7 48 24 48z"/>
                      </svg>
                      {t('gdrive_connect')}
                    </button>
                  )}
                  
                  {syncState.signedIn && (
                    <button
                      onClick={() => gdrive.syncNow()}
                      disabled={syncState.status === 'syncing'}
                      className="btn-secondary text-xs px-4 py-2"
                    >
                      {syncState.status === 'syncing' ? t('gdrive_syncing') : t('gdrive_sync_now')}
                    </button>
                  )}
                </div>
              </div>

              {/* Advanced Settings Toggle & Form */}
              <div className="mt-4 pt-3 border-t border-border">
                <button
                  onClick={() => setShowSyncSettings(!showSyncSettings)}
                  className="text-xs text-muted hover:text-primary flex items-center gap-1 font-semibold"
                >
                  ⚙️ {t('gdrive_advanced_settings')} {showSyncSettings ? '▼' : '▶'}
                </button>

                {showSyncSettings && (
                  <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-border text-xs flex flex-col gap-2">
                    <label className="font-bold text-primary block">
                      {t('gdrive_client_id_label')}
                    </label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      className="w-full border border-border rounded px-3 py-1.5 outline-none focus:border-teal font-mono bg-white"
                      placeholder="866965837196-..."
                    />
                    <p className="text-[10px] text-muted leading-relaxed">
                      {t('gdrive_client_id_help')}
                    </p>
                    <div className="flex gap-2 justify-end mt-1">
                      <button
                        onClick={() => {
                          gdrive.setClientId(clientIdInput);
                          alert(lang === 'tr' ? 'Google Client ID güncellendi. Lütfen tekrar bağlanmayı deneyin.' : 'Google Client ID updated. Please try connecting again.');
                        }}
                        className="btn-primary text-[10px] px-3 py-1"
                      >
                        {t('gdrive_client_id_save')}
                      </button>
                      <button
                        onClick={() => {
                          gdrive.setClientId('');
                          setClientIdInput(gdrive.getClientId());
                          alert(lang === 'tr' ? 'Client ID varsayılana sıfırlandı.' : 'Client ID reset to default.');
                        }}
                        className="btn-secondary text-[10px] px-3 py-1"
                      >
                        {t('gdrive_client_id_reset')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Convert + create flow card */}
          <section className="card p-5 mb-6">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div>
                <h2 className="text-lg font-bold text-primary">{t('app_new_project')}</h2>
                <p className="text-xs text-muted mt-0.5">
                  Word belgesi yükle veya metin yapıştır → kaynakça otomatik algılanır, editöre düşer. Veya boş projeyle
                  başla.
                </p>
              </div>
              <button className="btn-primary text-sm" onClick={newProject}>
                {t('app_empty_project')}
              </button>
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-3">
              <button
                onClick={() => setConvTab('upload')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold ${
                  convTab === 'upload' ? 'bg-white shadow-card' : 'text-muted'
                }`}
              >
                {t('app_upload_tab')}
              </button>
              <button
                onClick={() => setConvTab('paste')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold ${
                  convTab === 'paste' ? 'bg-white shadow-card' : 'text-muted'
                }`}
              >
                {t('app_paste_tab')}
              </button>
            </div>
            {convTab === 'upload' ? (
              <Dropzone onFile={handleConvertFile} />
            ) : (
              <PasteBox onSubmit={handleConvertText} />
            )}
            {conversionBusy && <p className="text-muted text-sm mt-3">{t('app_processing')}</p>}
            {conversionError && (
              <div className="mt-3 card bg-red-bg border-red-200 text-red text-sm p-3">{conversionError}</div>
            )}
          </section>

          {/* Project list section */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-primary">
              {t('app_my_projects')} {projects.length > 0 && <span className="text-muted text-sm">({projects.length})</span>}
            </h2>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary text-xs" onClick={exportAll} disabled={projects.length === 0}>
                {t('app_export_all')}
              </button>
              <button className="btn-secondary text-xs" onClick={() => backupInputRef.current?.click()}>
                {t('app_import_backup')}
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
                {t('app_close')}
              </button>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-muted text-sm">{t('app_no_projects')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id} className="card p-4 flex items-center justify-between hover:shadow-md transition">
                  <div className="cursor-pointer flex-1" onClick={() => setActiveId(p.id)}>
                    <h3 className="font-semibold text-primary">{p.title}</h3>
                    <p className="text-xs text-muted mt-0.5">
                      {p.refs.length} referans · son güncelleme {new Date(p.updatedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    </p>
                  </div>
                  <button
                    className="btn-danger text-xs text-rose-600 border border-rose-200 bg-rose-50/20 hover:bg-rose-50 px-2.5 py-1 rounded"
                    onClick={async () => {
                      if (confirm(t('trash_soft_delete_confirm'))) {
                        await softDeleteProject(p.id);
                        gdrive.markDirty(p.id);
                        await refreshList();
                      }
                    }}
                  >
                    {t('app_delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Trash Bin Section */}
          {deletedProjects.length > 0 && (
            <section className="mt-8 border-t border-border pt-6">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setTrashOpen(!trashOpen)}
                  className="text-lg font-bold text-muted hover:text-primary flex items-center gap-2"
                >
                  🗑️ {t('trash_bin_title')} <span className="text-xs font-normal">({deletedProjects.length})</span>
                  <span>{trashOpen ? '▼' : '▶'}</span>
                </button>
                {trashOpen && (
                  <button
                    onClick={async () => {
                      if (confirm(t('trash_empty_confirm'))) {
                        await emptyTrash();
                        deletedProjects.forEach((p) => gdrive.markDirty(p.id));
                        await refreshList();
                      }
                    }}
                    className="text-xs text-red hover:underline font-semibold"
                  >
                    {t('trash_empty_btn')}
                  </button>
                )}
              </div>

              {trashOpen && (
                <ul className="space-y-2">
                  {deletedProjects.map((p) => (
                    <li key={p.id} className="card p-3 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition border-dashed">
                      <div>
                        <h3 className="font-semibold text-secondary line-through">{p.title}</h3>
                        <p className="text-[10px] text-muted mt-0.5">
                          {p.deleted && (
                            <span>
                              {lang === 'tr' ? 'Silinme tarihi:' : 'Deleted on:'}{' '}
                              {new Date(p.deleted).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary text-xs px-2.5 py-1 text-teal border-teal/30 hover:bg-teal-bg animate-fade-in"
                          onClick={async () => {
                            await restoreProject(p.id);
                            gdrive.markDirty(p.id);
                            await refreshList();
                          }}
                        >
                          {t('trash_restore')}
                        </button>
                        <button
                          className="btn-danger text-xs px-2.5 py-1"
                          onClick={async () => {
                            if (confirm(t('trash_purge_confirm'))) {
                              await purgeProject(p.id);
                              gdrive.markDirty(p.id);
                              await refreshList();
                            }
                          }}
                        >
                          {t('trash_purge')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <EditorClient
      project={active}
      onExit={() => {
        setActiveId(null);
        gdrive.markDirty(active.id);
      }}
      onSaved={() => {
        refreshList();
        gdrive.markDirty(active.id);
      }}
    />
  );
}

export default function EditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>}>
      <Script src="https://accounts.google.com/gsi/client" async defer strategy="afterInteractive" />
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
