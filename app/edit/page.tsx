'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import type { MarkerOccurrence, Project, Ref } from '@/store/types';
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
import { DRTR_TOOLS } from '@/lib/i18n';
import { newId } from '@/lib/id';
import { parseDocx } from '@/lib/docx/parse';
import { splitBodyAndBiblio, parseBiblioLines } from '@/lib/refs/parse-biblio';
import { detectMarkers } from '@/lib/markers/detect';
import {
  buildDocWithCitations,
  parseHtmlToParagraphs,
  type ImportParagraph,
} from '@/lib/editor/import-rich';
import { extractProjectTables } from '@/lib/tables/project-tables';
import { splitAbstractMetadataFromParagraphs } from '@/lib/editor/abstract';
import { DocImportModal, type ImportPreview } from '@/components/Import/DocImportModal';

const EditorClient = dynamic(() => import('./EditorClient').then((m) => m.EditorClient), {
  ssr: false,
  loading: () => <div className="text-muted p-8">Loading…</div>,
});

import { ProjectWorkspace } from '@/components/Workspace/ProjectWorkspace';
import { LocalFolderCard } from '@/components/Workspace/LocalFolderCard';
import { SiteHeader } from '@/components/SiteChrome';

function EditPageInner() {
  const { t, lang } = useLang();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSubView, setActiveSubView] = useState<'workspace' | 'workspace-documents' | 'manuscript'>('workspace');
  const [loaded, setLoaded] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [conversionBusy, setConversionBusy] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [conversionPreview, setConversionPreview] = useState<ImportPreview>(null);
  const [conversionTitle, setConversionTitle] = useState('');
  const [conversionPasteText, setConversionPasteText] = useState('');
  const [conversionHtmlParagraphs, setConversionHtmlParagraphs] = useState<ImportParagraph[] | null>(null);
  const [conversionPlainReference, setConversionPlainReference] = useState<string | null>(null);
  const [convTab, setConvTab] = useState<'upload' | 'paste'>('upload');
  const [syncState, setSyncState] = useState<gdrive.SyncState | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const backupInputRef = useRef<HTMLInputElement>(null);
  const conversionDocxInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setClientIdInput(gdrive.getClientId());
    listProjects().then((ps) => {
      setProjects(ps);
      setLoaded(true);
      const open = searchParams.get('open');
      if (open && ps.some((p) => p.id === open)) {
        setActiveId(open);
        setActiveSubView('workspace');
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
    setActiveSubView('workspace');
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
        setImportMsg(lang === 'tr' ? 'Yedek boş.' : 'The backup is empty.');
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
      const { paragraphs, plainText } = await parseDocx(buf);
      prepareConversionPreview(
        plainText,
        file.name.replace(/\.docx$/i, '') || (lang === 'tr' ? 'Dönüştürülen Makale' : 'Converted Manuscript'),
        paragraphs,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConversionError(`${lang === 'tr' ? 'Dosya işlenemedi' : 'Could not process the file'}: ${msg}`);
    } finally {
      setConversionBusy(false);
    }
  }

  async function handleConvertText(text: string, html?: string): Promise<void> {
    setConversionBusy(true);
    setConversionError(null);
    try {
      prepareConversionPreview(
        text,
        lang === 'tr' ? 'Yapıştırılan Metin' : 'Pasted Text',
        html ? parseHtmlToParagraphs(html) : undefined,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConversionError(`İşlenemedi: ${msg}`);
    } finally {
      setConversionBusy(false);
    }
  }

  function prepareConversionPreview(
    text: string,
    defaultTitle: string,
    richParagraphs?: ImportParagraph[],
  ): void {
    const split = splitBodyAndBiblio(text);
    const { refs: parsedRefs } = parseBiblioLines(split.refLines);

    const bibliographyStart = richParagraphs?.findIndex((paragraph) =>
      isBibliographyHeading(paragraph.text),
    ) ?? -1;
    const rawBodyParagraphs = richParagraphs
      ? richParagraphs.slice(0, bibliographyStart >= 0 ? bibliographyStart : undefined)
      : split.bodyText
        .split(/\r?\n+/)
        .filter((paragraph) => paragraph.trim().length > 0)
        .map((paragraph) => ({ text: paragraph }));
    const { bodyParagraphs, abstractText, keywords } = splitAbstractMetadataFromParagraphs(rawBodyParagraphs);
    const { paragraphs: manuscriptParagraphs, tables } = extractProjectTables(bodyParagraphs, defaultTitle);
    const bodyText = manuscriptParagraphs.map((paragraph) => paragraph.text).join('\n');
    const markers = detectMarkers(bodyText);
    const citationCounts = countCitationsPerRef(parsedRefs.length, markers);

    setConversionTitle(defaultTitle);
    setConversionPreview({
      paragraphs: manuscriptParagraphs,
      bodyText,
      refs: parsedRefs,
      markerCount: markers.length,
      abstractText,
      keywords,
      tables,
      citationCounts,
    });
  }

  async function createProjectFromPreview(_replace: boolean, selectedIndices?: number[]): Promise<void> {
    if (!conversionPreview) return;
    const indices =
      selectedIndices && selectedIndices.length > 0
        ? selectedIndices
        : conversionPreview.refs.map((_, i) => i);
    const refsWithIds: Ref[] = indices.map((idx) => ({
      ...conversionPreview.refs[idx],
      id: newId('r'),
      includeInBibliography: true,
    }));
    const selectedRefNumbers = indices.map((idx) => idx + 1);
    const tiptapDoc = buildDocWithCitations(
      conversionPreview.paragraphs,
      refsWithIds,
      selectedRefNumbers,
    );

    const p: Project = createProject({
      title: conversionTitle || (lang === 'tr' ? 'Dönüştürülen Makale' : 'Converted Manuscript'),
      refs: refsWithIds,
      doc: tiptapDoc,
      bodyText: conversionPreview.bodyText,
      abstractText: conversionPreview.abstractText ?? '',
      keywords: conversionPreview.keywords ?? [],
      tables: conversionPreview.tables ?? [],
    });
    await saveProject(p);
    gdrive.markDirty(p.id);
    await refreshList();
    setActiveId(p.id);
    setActiveSubView('workspace');
    setConversionPreview(null);
    setConversionTitle('');
    setConversionPasteText('');
    setConversionHtmlParagraphs(null);
    setConversionPlainReference(null);
  }

  function processConversionPaste(): void {
    const text = conversionPasteText;
    if (conversionHtmlParagraphs && conversionPlainReference && text.trim() === conversionPlainReference.trim()) {
      prepareConversionPreview(
        text,
        lang === 'tr' ? 'Yapıştırılan Metin' : 'Pasted Text',
        conversionHtmlParagraphs,
      );
      return;
    }
    prepareConversionPreview(text, lang === 'tr' ? 'Yapıştırılan Metin' : 'Pasted Text');
  }

  function countCitationsPerRef(refCount: number, markers: MarkerOccurrence[]): number[] {
    const counts = new Array(refCount).fill(0);
    for (const marker of markers) {
      for (const n of marker.refNumbers) {
        if (n >= 1 && n <= refCount) {
          counts[n - 1]++;
        }
      }
    }
    return counts;
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Google Drive Sync Section */}
          {syncState && (
            <section className="card p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-primary flex items-center gap-1.5">
                    ☁️ {t('gdrive_sync_title')}
                    {syncState.status === 'syncing' && (
                      <span className="animate-spin text-teal text-xs">🔄</span>
                    )}
                    {syncState.status === 'ok' && (
                      <span className="text-emerald-500 text-xs">✓</span>
                    )}
                    {syncState.status === 'error' && (
                      <span className="text-rose-500 text-xs" title={syncState.message}>⚠️</span>
                    )}
                  </h2>
                  <p className="text-[11px] text-muted mt-0.5 truncate">
                    {syncState.signedIn && syncState.user
                      ? `${syncState.user.email || syncState.user.name || ''}${
                          syncState.lastSync
                            ? ' · ' + new Date(syncState.lastSync).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
                            : ''
                        }`
                      : t('gdrive_sync_desc')}
                  </p>
                </div>
                <button
                  onClick={() => setShowSyncSettings(!showSyncSettings)}
                  title={t('gdrive_advanced_settings')}
                  className="shrink-0 text-muted hover:text-primary text-sm leading-none"
                >
                  ⚙️
                </button>
              </div>

              <div className="mt-auto flex items-center gap-2 flex-wrap">
                {syncState.signedIn ? (
                  <>
                    <button
                      onClick={() => gdrive.syncNow()}
                      disabled={syncState.status === 'syncing'}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      {syncState.status === 'syncing' ? t('gdrive_syncing') : t('gdrive_sync_now')}
                    </button>
                    <button
                      onClick={() => gdrive.signOut()}
                      className="text-xs text-rose-600 hover:underline font-medium"
                    >
                      {t('gdrive_disconnect')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => gdrive.signIn()}
                    className="btn-primary text-xs flex items-center gap-2 px-3 py-1.5"
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
              </div>

              {showSyncSettings && (
                <div className="bg-slate-50 p-3 rounded-lg border border-border text-xs flex flex-col gap-2">
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
            </section>
          )}

          {/* Local workspace folder */}
          <LocalFolderCard />
          </div>

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
            <ul className="space-y-3">
              {projects.map((p) => (
                <li key={p.id} className="card p-4 flex flex-col gap-3 hover:shadow-md transition bg-white">
                  {/* Card Header: Title, Update Date, Sil Button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="cursor-pointer flex-1" onClick={() => { setActiveId(p.id); setActiveSubView('workspace'); }}>
                      <h3 className="font-bold text-primary text-base flex items-center gap-1.5 hover:text-teal transition">
                        📁 {p.title}
                      </h3>
                      <p className="text-xs text-muted mt-0.5">
                        {p.refs.length} {t('ws_ref_count')} · {lang === 'tr' ? 'son güncelleme' : 'last updated'}{' '}
                        {new Date(p.updatedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                      </p>
                    </div>
                    <button
                      className="btn-danger text-xs text-rose-600 border border-rose-200 bg-rose-50/20 hover:bg-rose-50 px-2.5 py-1 rounded transition"
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
                  </div>

                  {/* Card Body: The 2 Branches */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                    {/* Branch 1: Ana Yazı */}
                    <div
                      onClick={() => {
                        setActiveId(p.id);
                        setActiveSubView('manuscript');
                      }}
                      className="border border-border rounded-lg p-2.5 bg-slate-50/30 hover:border-teal/40 hover:bg-teal-bg/10 cursor-pointer text-left transition flex items-center gap-2.5 group"
                    >
                      <span className="text-lg group-hover:scale-110 transition shrink-0">📝</span>
                      <div>
                        <div className="text-xs font-bold text-primary leading-tight group-hover:text-teal transition">
                          {t('ws_main_manuscript')}
                        </div>
                        <div className="text-[10px] text-muted leading-tight mt-0.5">
                          {p.bodyText ? p.bodyText.trim().split(/\s+/).filter(Boolean).length : 0} {t('ws_word_count')} · {p.refs.length} {t('ws_ref_count')}
                        </div>
                      </div>
                    </div>

                    {/* Branch 2: Diğer Yazılar */}
                    <div
                      onClick={() => {
                        setActiveId(p.id);
                        setActiveSubView('workspace-documents');
                      }}
                      className="border border-border rounded-lg p-2.5 bg-slate-50/30 hover:border-violet-500/40 hover:bg-violet-50/20 cursor-pointer text-left transition flex items-center gap-2.5 group"
                    >
                      <span className="text-lg group-hover:scale-110 transition shrink-0">✉️</span>
                      <div>
                        <div className="text-xs font-bold text-primary leading-tight group-hover:text-violet-600 transition">
                          {t('ws_other_docs')}
                        </div>
                        <div className="text-[10px] text-muted leading-tight mt-0.5">
                          {p.documents ? p.documents.length : 0} {lang === 'tr' ? 'ek belge' : 'documents'}
                        </div>
                      </div>
                    </div>
                  </div>
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

          <section className="mt-8 border-t border-border pt-6">
            <h2 className="text-lg font-bold text-primary text-center">{t('ecosystem_title')}</h2>
            <p className="mt-1 text-xs text-muted text-center">{t('ecosystem_desc')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {DRTR_TOOLS.map((tool) => (
                <a
                  key={tool.url}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card group px-3 py-2 transition hover:border-teal hover:shadow-md"
                >
                  <div className="text-sm font-bold text-primary transition group-hover:text-teal">
                    {tool.name}
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-muted">{tool.desc[lang]}</div>
                </a>
              ))}
            </div>
          </section>
        </main>
        {conversionPreview && (
          <DocImportModal
            onClose={() => {
              setConversionPreview(null);
              setConversionTitle('');
              setConversionPasteText('');
              setConversionHtmlParagraphs(null);
              setConversionPlainReference(null);
            }}
            docxInputRef={conversionDocxInputRef}
            onSelectDocx={async (file) => {
              await handleConvertFile(file);
            }}
            pasteText={conversionPasteText}
            setPasteText={setConversionPasteText}
            onProcessPaste={processConversionPaste}
            onPasteHtml={(html, plain) => {
              const parsed = parseHtmlToParagraphs(html);
              if (parsed.length > 0) {
                setConversionHtmlParagraphs(parsed);
                setConversionPlainReference(plain);
              }
            }}
            preview={conversionPreview}
            onApply={(replace, selectedIndices) => {
              void createProjectFromPreview(replace, selectedIndices);
            }}
            showAddButton={false}
            replaceLabel={lang === 'tr' ? 'Projeyi oluştur' : 'Create project'}
          />
        )}
      </div>
    );
  }

  if (activeSubView === 'workspace' || activeSubView === 'workspace-documents') {
    return (
      <ProjectWorkspace
        project={active}
        initialView={activeSubView === 'workspace-documents' ? 'documents' : 'dashboard'}
        onExit={() => {
          setActiveId(null);
          gdrive.markDirty(active.id);
        }}
        onOpenManuscript={() => {
          setActiveSubView('manuscript');
        }}
        onSaved={(updatedProject) => {
          refreshList();
          gdrive.markDirty(updatedProject.id);
        }}
      />
    );
  }

  return (
    <EditorClient
      project={active}
      onExit={() => {
        setActiveSubView('workspace');
        gdrive.markDirty(active.id);
      }}
      onExitToProjects={() => {
        setActiveId(null);
        gdrive.markDirty(active.id);
      }}
      onGoToDocuments={() => {
        setActiveSubView('workspace-documents');
        gdrive.markDirty(active.id);
      }}
      onSaved={() => {
        refreshList();
        gdrive.markDirty(active.id);
      }}
    />
  );
}

function isBibliographyHeading(text: string): boolean {
  return /^(references|bibliography|kaynakça|kaynaklar|referanslar|literatür)\s*:?\s*$/i.test(
    text.trim(),
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
  return <SiteHeader showWorkspaceLink={false} />;
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
