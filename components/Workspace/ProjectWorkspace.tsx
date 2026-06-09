'use client';

import { useState, useEffect } from 'react';
import type { Project, ProjectDocument, Ref } from '@/store/types';
import { saveProject } from '@/store/db';
import { newId } from '@/lib/id';
import { useLang } from '@/lib/i18n/hooks';
import { aiHeaders } from '@/lib/ai/user-keys';
import {
  buildCoverLetter,
  buildResponseToReviewers,
  buildAuthorContributions,
  buildConflictOfInterest,
  buildTitlePage,
  parseReviewerComments,
  type LetterLang,
} from '@/lib/letters/templates';

interface ProjectWorkspaceProps {
  project: Project;
  onExit: () => void;
  onOpenManuscript: () => void;
  onSaved: (updatedProject: Project) => void;
  initialView?: 'dashboard' | 'documents';
}

type DocType = 'cover' | 'title-page' | 'response' | 'contrib' | 'coi' | 'custom';

function getWordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function ProjectWorkspace({ project, onExit, onOpenManuscript, onSaved, initialView }: ProjectWorkspaceProps) {
  const { t, lang } = useLang();
  
  // Workspace views: 'dashboard' or 'edit-doc'
  const [view, setView] = useState<'dashboard' | 'edit-doc'>('dashboard');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  // Template wizard states
  const [showWizard, setShowWizard] = useState(false);
  const [wizardType, setWizardType] = useState<DocType>('cover');
  
  // Wizard fields
  const [docTitle, setDocTitle] = useState('');
  const [journalName, setJournalName] = useState('');
  const [manuscriptTitle, setManuscriptTitle] = useState(project.title);
  const [correspondingAuthor, setCorrespondingAuthor] = useState('');
  const [correspondingEmail, setCorrespondingEmail] = useState('');
  const [correspondingAddress, setCorrespondingAddress] = useState('');
  const [orcid, setOrcid] = useState('');
  const [authorsStr, setAuthorsStr] = useState('');
  const [manuscriptType, setManuscriptType] = useState('Original Article');
  const [keyFinding, setKeyFinding] = useState('');
  const [reviewerRaw, setReviewerRaw] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  
  // Title Page specific fields
  const [runningTitle, setRunningTitle] = useState('');
  const [absWordCount, setAbsWordCount] = useState('');
  const [msWordCount, setMsWordCount] = useState('');
  const [figsCount, setFigsCount] = useState('');
  const [tblsCount, setTblsCount] = useState('');
  const [conflictDesc, setConflictDesc] = useState('');
  const [funding, setFunding] = useState('');
  const [acknowledgements, setAcknowledgements] = useState('');

  // Active editing document fields
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Compute stats of manuscript
  const manuscriptWordCount = getWordCount(project.bodyText || '');
  const citationCount = project.refs.length;

  const documentsList = project.documents || [];

  // Reset wizard inputs
  const resetWizardFields = (type: DocType) => {
    setWizardType(type);
    setDocTitle('');
    setJournalName('');
    setManuscriptTitle(project.title);
    setCorrespondingAuthor('');
    setCorrespondingEmail('');
    setCorrespondingAddress('');
    setOrcid('');
    setAuthorsStr('');
    setManuscriptType(lang === 'tr' ? 'Özgün Araştırma Makalesi' : 'Original Article');
    setKeyFinding('');
    setReviewerRaw('');
    setHasConflict(false);
    setRunningTitle('');
    setAbsWordCount('');
    setMsWordCount(manuscriptWordCount.toString());
    setFigsCount('');
    setTblsCount('');
    setConflictDesc('');
    setFunding('');
    setAcknowledgements('');
  };

  const openDoc = (doc: ProjectDocument) => {
    setSelectedDocId(doc.id);
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setAiError(null);
    setSaveStatus(null);
    setView('edit-doc');
  };

  useEffect(() => {
    if (initialView === 'documents') {
      if (project.documents && project.documents.length > 0) {
        openDoc(project.documents[0]);
      } else {
        setView('dashboard');
        setShowWizard(true);
      }
    } else {
      setView('dashboard');
      setSelectedDocId(null);
    }
  }, [initialView]);

  const handleCreateDocument = async () => {
    let generatedContent = '';
    let finalTitle = docTitle.trim();
    const currentLang: LetterLang = lang === 'tr' ? 'tr' : 'en';

    if (wizardType === 'cover') {
      if (!finalTitle) finalTitle = t('letters_cover');
      generatedContent = buildCoverLetter({
        journalName,
        manuscriptTitle,
        correspondingAuthor,
        authors: authorsStr || undefined,
        manuscriptType,
        keyFinding,
        lang: currentLang,
      });
    } else if (wizardType === 'title-page') {
      if (!finalTitle) finalTitle = t('letters_title_page');
      generatedContent = buildTitlePage({
        manuscriptTitle,
        runningTitle,
        authorsStr,
        correspondingAuthor,
        correspondingEmail,
        correspondingAddress,
        orcid,
        abstractWordCount: absWordCount,
        manuscriptWordCount: msWordCount,
        figuresCount: figsCount,
        tablesCount: tblsCount,
        conflictOfInterest: conflictDesc || undefined,
        funding,
        acknowledgements,
        lang: currentLang,
      });
    } else if (wizardType === 'response') {
      if (!finalTitle) finalTitle = t('letters_response');
      generatedContent = buildResponseToReviewers({
        journalName: journalName || undefined,
        manuscriptTitle: manuscriptTitle || undefined,
        points: parseReviewerComments(reviewerRaw),
        lang: currentLang,
      });
    } else if (wizardType === 'contrib') {
      if (!finalTitle) finalTitle = t('letters_contrib');
      const authors = authorsStr.split(/[,;\n]/).map(a => a.trim()).filter(Boolean);
      generatedContent = buildAuthorContributions({
        authors,
        lang: currentLang,
      });
    } else if (wizardType === 'coi') {
      if (!finalTitle) finalTitle = t('letters_coi');
      const authors = authorsStr.split(/[,;\n]/).map(a => a.trim()).filter(Boolean);
      generatedContent = buildConflictOfInterest({
        authors,
        hasConflict,
        lang: currentLang,
      });
    } else {
      if (!finalTitle) finalTitle = lang === 'tr' ? 'Özel Belge' : 'Custom Document';
      generatedContent = '';
    }

    const newDoc: ProjectDocument = {
      id: newId('doc'),
      type: wizardType,
      title: finalTitle,
      content: generatedContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedProject: Project = {
      ...project,
      documents: [...documentsList, newDoc],
      updatedAt: Date.now(),
    };

    await saveProject(updatedProject);
    onSaved(updatedProject);
    setShowWizard(false);
    openDoc(newDoc);
  };

  const handleSaveDocument = async () => {
    if (!selectedDocId) return;
    const updatedDocs = documentsList.map((d) => {
      if (d.id === selectedDocId) {
        return {
          ...d,
          title: editTitle,
          content: editContent,
          updatedAt: Date.now(),
        };
      }
      return d;
    });

    const updatedProject: Project = {
      ...project,
      documents: updatedDocs,
      updatedAt: Date.now(),
    };

    await saveProject(updatedProject);
    onSaved(updatedProject);
    setSaveStatus(t('ws_save_success'));
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('ws_delete_confirm'))) return;

    const updatedDocs = documentsList.filter((d) => d.id !== docId);
    const updatedProject: Project = {
      ...project,
      documents: updatedDocs,
      updatedAt: Date.now(),
    };

    await saveProject(updatedProject);
    onSaved(updatedProject);
    if (selectedDocId === docId) {
      setView('dashboard');
      setSelectedDocId(null);
    }
  };

  const handleImproveAI = async () => {
    if (!editContent.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiHeaders() },
        body: JSON.stringify({ draft: editContent, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data?.error ?? 'AI error');
        return;
      }
      if (data?.text) {
        setEditContent(data.text);
      }
    } catch {
      setAiError(t('letters_ai_error'));
    } finally {
      setAiBusy(false);
    }
  };

  const copyToClipboard = () => {
    void navigator.clipboard.writeText(editContent);
  };

  const downloadTextFile = () => {
    const blob = new Blob([editContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editTitle.toLowerCase().replace(/\s+/g, '_')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const getDocIcon = (type: DocType) => {
    switch (type) {
      case 'cover': return '✉️';
      case 'title-page': return '📄';
      case 'response': return '💬';
      case 'contrib': return '👥';
      case 'coi': return '⚖️';
      default: return '📝';
    }
  };

  const getDocTypeName = (type: DocType) => {
    switch (type) {
      case 'cover': return t('letters_cover');
      case 'title-page': return t('letters_title_page');
      case 'response': return t('letters_response');
      case 'contrib': return t('letters_contrib');
      case 'coi': return t('letters_coi');
      default: return lang === 'tr' ? 'Özel Belge' : 'Custom';
    }
  };

  const inputCls = 'w-full text-xs border border-border rounded-lg px-3 py-2 bg-surface text-primary focus:border-teal outline-none transition';
  const labelCls = 'block text-[10px] uppercase font-bold text-muted mb-1';

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      {/* Top Bar / Header */}
      <header className="border-b border-border bg-white sticky top-0 z-40 px-4 sm:px-6 py-3 sm:py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="text-xs font-semibold text-secondary hover:text-primary transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-slate-50 shadow-sm"
          >
            {t('ws_back_to_projects')}
          </button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="hidden sm:block">
            <h1 className="text-sm font-extrabold text-primary flex items-center gap-1.5">
              📁 {project.title}
            </h1>
            <p className="text-[10px] text-muted">
              {t('ws_title')} · {new Date(project.updatedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
            </p>
          </div>
        </div>
        <span className="text-[10px] tracking-wider uppercase font-bold text-teal bg-teal-bg/60 px-2.5 py-1 rounded-full">
          {t('ws_title')}
        </span>
      </header>

      {view === 'dashboard' ? (
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1 flex flex-col gap-8">
          <div className="grid md:grid-cols-2 gap-6 items-stretch">
            {/* Branch 1: Ana Yazı (Manuscript Editor) */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-md transition border-2 border-transparent hover:border-teal/20 group relative overflow-hidden bg-white">
              <div className="absolute top-0 right-0 p-3 text-3xl opacity-10 group-hover:scale-110 transition duration-300">✍️</div>
              <div>
                <span className="inline-block text-[10px] uppercase font-extrabold tracking-widest text-teal bg-teal-bg px-2.5 py-1 rounded-full mb-3">
                  DAL 1
                </span>
                <h2 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
                  📝 {t('ws_main_manuscript')}
                </h2>
                <p className="text-xs text-secondary leading-relaxed mb-6">
                  {t('ws_manuscript_desc')}
                </p>
                <div className="flex gap-4 mb-6 flex-wrap">
                  <div className="bg-slate-50 border border-border px-3 py-2 rounded-lg text-center min-w-[80px]">
                    <div className="text-sm font-extrabold text-primary">{manuscriptWordCount}</div>
                    <div className="text-[9px] text-muted uppercase tracking-wider">{t('ws_word_count')}</div>
                  </div>
                  <div className="bg-slate-50 border border-border px-3 py-2 rounded-lg text-center min-w-[80px]">
                    <div className="text-sm font-extrabold text-primary">{citationCount}</div>
                    <div className="text-[9px] text-muted uppercase tracking-wider">{t('ws_ref_count')}</div>
                  </div>
                </div>
              </div>
              <button
                onClick={onOpenManuscript}
                className="btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-teal/10 hover:shadow-teal/20 transition-all"
              >
                ✨ {t('ws_open_manuscript')} →
              </button>
            </div>

            {/* Branch 2: Diğer Yazılar (Letters & Attachments) */}
            <div className="card p-6 flex flex-col justify-between hover:shadow-md transition border-2 border-transparent hover:border-violet-500/20 group relative overflow-hidden bg-white">
              <div className="absolute top-0 right-0 p-3 text-3xl opacity-10 group-hover:scale-110 transition duration-300">✉️</div>
              <div className="flex-1 flex flex-col">
                <span className="inline-block text-[10px] uppercase font-extrabold tracking-widest text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full mb-3 w-fit">
                  DAL 2
                </span>
                <h2 className="text-xl font-bold text-primary mb-2">
                  ✉️ {t('ws_other_docs')}
                </h2>
                <p className="text-xs text-secondary leading-relaxed mb-4">
                  {t('ws_other_docs_desc')}
                </p>

                {/* Documents List */}
                <div className="flex-1 min-h-[140px] max-h-[220px] overflow-y-auto mb-6 pr-1 space-y-2">
                  {documentsList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-border rounded-xl bg-slate-50/50">
                      <span className="text-2xl mb-1 opacity-60">✉️</span>
                      <p className="text-[11px] text-muted max-w-[240px]">{t('ws_no_docs')}</p>
                    </div>
                  ) : (
                    documentsList.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => openDoc(doc)}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-white hover:border-violet-500/40 hover:bg-slate-50/20 cursor-pointer shadow-sm transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base shrink-0">{getDocIcon(doc.type)}</span>
                          <div className="text-left">
                            <h4 className="text-xs font-bold text-primary leading-snug">{doc.title}</h4>
                            <p className="text-[9px] text-muted">
                              {getDocTypeName(doc.type)} · {new Date(doc.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteDocument(doc.id, e)}
                          className="p-1 text-muted hover:text-red hover:bg-red-50 rounded transition"
                          title={t('pb_delete')}
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    resetWizardFields('cover');
                    setShowWizard(true);
                  }}
                  className="btn-secondary flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50 transition"
                >
                  ➕ {t('ws_create_doc')}
                </button>
                <button
                  onClick={() => {
                    resetWizardFields('custom');
                    setShowWizard(true);
                  }}
                  className="btn-secondary py-2.5 px-3 text-xs font-semibold hover:bg-slate-100 border-border text-secondary transition"
                  title={t('ws_create_empty_doc')}
                >
                  📄
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Edit Document View */
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('dashboard')}
                className="text-xs font-semibold text-secondary hover:text-primary transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white"
              >
                ← {t('tbl_back')}
              </button>
              <button
                onClick={onOpenManuscript}
                className="text-xs font-semibold text-teal hover:text-teal-dark transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-bg/30"
              >
                📝 {t('ws_main_manuscript')}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus && <span className="text-xs text-emerald-600 font-semibold animate-pulse">{saveStatus}</span>}
              <button
                onClick={handleSaveDocument}
                className="btn-primary text-xs px-4 py-2 font-semibold shadow-sm"
              >
                💾 {t('app_save') ?? 'Kaydet'}
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-stretch flex-1 min-h-[500px]">
            {/* Left Column: Doc List & Stats */}
            <div className="hidden md:flex md:col-span-1 card p-4 bg-white flex-col justify-between gap-4">
              <div>
                <h3 className="text-xs font-extrabold text-primary mb-3 uppercase tracking-wider border-b border-border pb-2">
                  📂 {t('ws_other_docs')}
                </h3>
                <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                  {documentsList.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => openDoc(doc)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-left cursor-pointer transition ${
                        selectedDocId === doc.id
                          ? 'border-violet-500/50 bg-violet-50/20 font-bold'
                          : 'border-border bg-white hover:bg-slate-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-sm shrink-0">{getDocIcon(doc.type)}</span>
                        <span className="text-xs text-primary truncate leading-tight">{doc.title}</span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                        className="p-1 text-muted hover:text-red hover:bg-red-50 rounded opacity-60 hover:opacity-100 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 border border-border p-3 rounded-lg text-left">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Döküman İstatistikleri</div>
                <div className="text-xs text-secondary space-y-1">
                  <div>• {t('ws_word_count')}: <strong className="text-primary">{getWordCount(editContent)}</strong></div>
                  <div>• Karakter sayısı: <strong className="text-primary">{editContent.length}</strong></div>
                  <div>• Tür: <strong className="text-primary">{getDocTypeName(documentsList.find(d => d.id === selectedDocId)?.type || 'custom')}</strong></div>
                </div>
              </div>
            </div>

            {/* Right Column: Full Document Editor */}
            <div className="md:col-span-2 card p-5 bg-white flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-muted">Belge Başlığı</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-sm font-bold border border-border rounded-lg px-3 py-2 bg-slate-50/30 text-primary focus:border-teal outline-none transition"
                  placeholder="Belge Başlığı"
                />
              </div>

              <div className="flex-1 flex flex-col gap-1.5 min-h-[300px]">
                <label className="text-[10px] uppercase font-bold text-muted">İçerik</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full flex-1 border border-border rounded-lg p-4 bg-slate-50/20 text-primary font-mono text-xs outline-none focus:border-teal resize-none leading-relaxed"
                  placeholder={t('letters_output_hint')}
                />
              </div>

              {aiError && <p className="text-xs text-red font-semibold">{aiError}</p>}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={copyToClipboard}
                  disabled={!editContent}
                  className="btn-secondary text-xs px-3 py-2 flex-1 disabled:opacity-40 flex items-center justify-center gap-1 hover:bg-slate-50 transition"
                >
                  📋 {t('letters_copy')}
                </button>
                <button
                  onClick={downloadTextFile}
                  disabled={!editContent}
                  className="btn-secondary text-xs px-3 py-2 flex-1 disabled:opacity-40 flex items-center justify-center gap-1 hover:bg-slate-50 transition"
                >
                  💾 .txt
                </button>
                <button
                  onClick={handleImproveAI}
                  disabled={!editContent || aiBusy}
                  className="text-xs px-3 py-2 flex-1 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1 shadow-sm transition"
                >
                  ✨ {aiBusy ? t('letters_ai_busy') : t('letters_ai_improve')}
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-primary text-sm flex items-center gap-1.5">
                  ✨ {t('ws_create_doc')}
                </h3>
                <p className="text-[10px] text-muted">Akademik şablonlardan birini seçip gerekli bilgileri girin.</p>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="text-muted hover:text-primary text-lg leading-none transition"
              >
                ×
              </button>
            </div>

            {/* Template Selectors */}
            <div className="flex gap-1 px-4 py-2 bg-slate-50 border-b border-border overflow-x-auto whitespace-nowrap">
              {(['cover', 'title-page', 'response', 'contrib', 'coi', 'custom'] as DocType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => resetWizardFields(type)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-semibold shrink-0 transition ${
                    wizardType === type ? 'bg-violet-600 text-white shadow-sm' : 'text-secondary hover:bg-slate-100'
                  }`}
                >
                  {getDocIcon(type)} {getDocTypeName(type)}
                </button>
              ))}
            </div>

            {/* Fields Form */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Common Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <label className={labelCls}>Mektup / Belge Adı (İsteğe Bağlı)</label>
                  <input
                    className={inputCls}
                    placeholder={`${getDocTypeName(wizardType)} ${documentsList.length + 1}`}
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                </div>

                {(wizardType === 'cover' || wizardType === 'response') && (
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_journal')}</label>
                    <input
                      className={inputCls}
                      placeholder="e.g. Nature, IEEE Access"
                      value={journalName}
                      onChange={(e) => setJournalName(e.target.value)}
                    />
                  </div>
                )}

                {wizardType !== 'custom' && wizardType !== 'contrib' && wizardType !== 'coi' && (
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_ms_title')}</label>
                    <input
                      className={inputCls}
                      placeholder="e.g. A Deep Learning Approach..."
                      value={manuscriptTitle}
                      onChange={(e) => setManuscriptTitle(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Cover Letter Fields */}
              {wizardType === 'cover' && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_corresponding')}</label>
                      <input
                        className={inputCls}
                        placeholder="Dr. Ahmet Yılmaz"
                        value={correspondingAuthor}
                        onChange={(e) => setCorrespondingAuthor(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_ms_type')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. Original Article, Review"
                        value={manuscriptType}
                        onChange={(e) => setManuscriptType(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_authors')}</label>
                    <input
                      className={inputCls}
                      placeholder="Ahmet Yılmaz, Ayşe Demir"
                      value={authorsStr}
                      onChange={(e) => setAuthorsStr(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_key_finding')}</label>
                    <textarea
                      className={`${inputCls} h-20 resize-none`}
                      placeholder="Describe the significance and main contribution of this study..."
                      value={keyFinding}
                      onChange={(e) => setKeyFinding(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Title Page Fields */}
              {wizardType === 'title-page' && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_running_title')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. Deep Learning in Healthcare"
                        value={runningTitle}
                        onChange={(e) => setRunningTitle(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_corresponding')}</label>
                      <input
                        className={inputCls}
                        placeholder="Dr. Ahmet Yılmaz"
                        value={correspondingAuthor}
                        onChange={(e) => setCorrespondingAuthor(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_corresponding_email')}</label>
                      <input
                        className={inputCls}
                        placeholder="ahmet@university.edu"
                        value={correspondingEmail}
                        onChange={(e) => setCorrespondingEmail(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_orcid')}</label>
                      <input
                        className={inputCls}
                        placeholder="0000-0002-XXXX-XXXX"
                        value={orcid}
                        onChange={(e) => setOrcid(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_corresponding_address')}</label>
                      <input
                        className={inputCls}
                        placeholder="Department of Computer Science, University of X, City, Country"
                        value={correspondingAddress}
                        onChange={(e) => setCorrespondingAddress(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_authors_list')} & Affiliations</label>
                      <textarea
                        className={`${inputCls} h-20 resize-none`}
                        placeholder={`Ahmet Yılmaz 1*, Ayşe Demir 2\n1 Department of X, Y University, City, Country\n2 Institution Z, City, Country`}
                        value={authorsStr}
                        onChange={(e) => setAuthorsStr(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_abs_wc')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 250"
                        value={absWordCount}
                        onChange={(e) => setAbsWordCount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_ms_wc')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 4500"
                        value={msWordCount}
                        onChange={(e) => setMsWordCount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_figs')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 5"
                        value={figsCount}
                        onChange={(e) => setFigsCount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{t('letters_tbls')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 2"
                        value={tblsCount}
                        onChange={(e) => setTblsCount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_funding')}</label>
                    <input
                      className={inputCls}
                      placeholder="This work was supported by X Grant No. Y..."
                      value={funding}
                      onChange={(e) => setFunding(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_ack')}</label>
                    <input
                      className={inputCls}
                      placeholder="We thank our colleagues for their feedback..."
                      value={acknowledgements}
                      onChange={(e) => setAcknowledgements(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Reviewer Response Fields */}
              {wizardType === 'response' && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_reviewer_paste')}</label>
                    <textarea
                      className={`${inputCls} h-40 resize-none font-mono text-xs`}
                      placeholder={`1. Revise the introduction.\n2. Add more dataset details.\nComment 3: Explain equation 4.`}
                      value={reviewerRaw}
                      onChange={(e) => setReviewerRaw(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Author Contributions & COI Fields */}
              {(wizardType === 'contrib' || wizardType === 'coi') && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{t('letters_authors_list')}</label>
                    <textarea
                      className={`${inputCls} h-28 resize-none`}
                      placeholder="Ahmet Yılmaz, Ayşe Demir, Fatma Çelik"
                      value={authorsStr}
                      onChange={(e) => setAuthorsStr(e.target.value)}
                    />
                  </div>

                  {wizardType === 'coi' && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasConflict}
                          onChange={(e) => setHasConflict(e.target.checked)}
                          className="rounded border-border text-violet-600 focus:ring-violet-500"
                        />
                        {t('letters_has_conflict')}
                      </label>
                      {hasConflict && (
                        <div className="flex flex-col gap-1">
                          <label className={labelCls}>Açıklama</label>
                          <textarea
                            className={`${inputCls} h-20 resize-none`}
                            placeholder="Dr. X has received funding from company Y..."
                            value={conflictDesc}
                            onChange={(e) => setConflictDesc(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Custom / Blank Document */}
              {wizardType === 'custom' && (
                <div className="py-4 text-center text-xs text-muted">
                  Yeni bir boş belge oluşturulacak. Oluşturduktan sonra dilediğiniz gibi yazabilirsiniz.
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-slate-50/50 flex gap-2 justify-end">
              <button
                onClick={() => setShowWizard(false)}
                className="btn-secondary text-xs px-4 py-2 font-semibold hover:bg-slate-100 border-border text-secondary transition"
              >
                {t('app_close') ?? 'Kapat'}
              </button>
              <button
                onClick={handleCreateDocument}
                className="btn-primary text-xs px-4 py-2 font-semibold shadow-sm bg-violet-600 hover:bg-violet-700 transition"
              >
                ⚙️ {t('letters_generate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
