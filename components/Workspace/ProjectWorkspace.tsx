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
import { t as tI18n } from '@/lib/i18n';

interface ProjectWorkspaceProps {
  project: Project;
  onExit: () => void;
  onOpenManuscript: () => void;
  onSaved: (updatedProject: Project) => void;
  initialView?: 'dashboard' | 'documents';
}

type DocType = 'cover' | 'title-page' | 'response' | 'contrib' | 'coi' | 'custom';
type WizardTab = DocType | 'author-pool' | 'custom-templates';

interface SavedAuthor {
  id: string;
  name: string;
  email?: string;
  orcid?: string;
  address?: string;
}

interface CustomTemplate {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

interface WizardAuthor {
  name: string;
  email: string;
  orcid: string;
  institution: string;
}

function getWordCount(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function ProjectWorkspace({ project, onExit, onOpenManuscript, onSaved, initialView }: ProjectWorkspaceProps) {
  const { t, lang } = useLang();

  const tLocal = (key: Parameters<typeof tI18n>[0]) => {
    return tI18n(key, wizardLang);
  };

  const inputCls = 'w-full text-xs border border-border rounded-lg px-3 py-2 bg-surface text-primary focus:border-teal outline-none transition';
  const labelCls = 'block text-[10px] uppercase font-bold text-muted mb-1';
  
  // Workspace views: 'dashboard' or 'edit-doc'
  const [view, setView] = useState<'dashboard' | 'edit-doc'>('dashboard');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  // Template wizard states
  const [showWizard, setShowWizard] = useState(false);
  const [wizardType, setWizardType] = useState<WizardTab>('cover');
  const [wizardLang, setWizardLang] = useState<LetterLang>('tr');
  
  // Wizard fields
  const [docTitle, setDocTitle] = useState('');
  const [journalName, setJournalName] = useState('');
  const [manuscriptTitle, setManuscriptTitle] = useState(project.title);
  const [correspondingAuthor, setCorrespondingAuthor] = useState('');
  const [correspondingEmail, setCorrespondingEmail] = useState('');
  const [correspondingAddress, setCorrespondingAddress] = useState('');
  const [orcid, setOrcid] = useState('');
  const [wizardAuthors, setWizardAuthors] = useState<WizardAuthor[]>([
    { name: '', email: '', orcid: '', institution: '' }
  ]);
  const [activeSelectIdx, setActiveSelectIdx] = useState<number | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<Record<number, boolean>>({});
  const [corrFeedbackIdx, setCorrFeedbackIdx] = useState<number | null>(null);
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

  // Author Pool states
  const [savedAuthors, setSavedAuthors] = useState<SavedAuthor[]>([]);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [justSavedAuthor, setJustSavedAuthor] = useState(false);

  // Custom Templates states
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const rawTemplates = localStorage.getItem('endnotere-custom-templates');
      if (rawTemplates) {
        try {
          setCustomTemplates(JSON.parse(rawTemplates));
        } catch (e) {
          console.error('Failed to parse custom templates', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('endnotere-author-pool');
      if (raw) {
        try {
          setSavedAuthors(JSON.parse(raw));
        } catch (e) {
          console.error('Failed to parse author pool', e);
        }
      }
    }
  }, []);

  const saveAuthorToPool = (author: Omit<SavedAuthor, 'id'>) => {
    if (!author.name.trim()) return;
    const newAuthors = [...savedAuthors];
    const existingIdx = newAuthors.findIndex(
      a => a.name.toLowerCase() === author.name.toLowerCase() || 
           (author.email && a.email?.toLowerCase() === author.email.toLowerCase())
    );
    
    const updatedAuthor: SavedAuthor = {
      id: existingIdx >= 0 ? newAuthors[existingIdx].id : newId('auth'),
      name: author.name.trim(),
      email: author.email?.trim() || '',
      orcid: author.orcid?.trim() || '',
      address: author.address?.trim() || '',
    };

    if (existingIdx >= 0) {
      newAuthors[existingIdx] = updatedAuthor;
    } else {
      newAuthors.push(updatedAuthor);
    }

    setSavedAuthors(newAuthors);
    localStorage.setItem('endnotere-author-pool', JSON.stringify(newAuthors));
  };

  const deleteAuthorFromPool = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newAuthors = savedAuthors.filter(a => a.id !== id);
    setSavedAuthors(newAuthors);
    localStorage.setItem('endnotere-author-pool', JSON.stringify(newAuthors));
  };

  const renderAuthorPoolSelector = () => {
    if (savedAuthors.length === 0) return null;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowAuthorDropdown(!showAuthorDropdown)}
          className="text-[10px] text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1 transition"
        >
          👤 {tLocal('letters_saved_authors')}
        </button>
        {showAuthorDropdown && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setShowAuthorDropdown(false)}
            />
            <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-50 max-h-48 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100">
                {tLocal('letters_author_pool')}
              </div>
              {savedAuthors.map((author) => (
                <div
                  key={author.id}
                  onClick={() => {
                    setCorrespondingAuthor(author.name);
                    if (author.email) setCorrespondingEmail(author.email);
                    if (author.orcid) setOrcid(author.orcid);
                    if (author.address) setCorrespondingAddress(author.address);
                    setShowAuthorDropdown(false);
                  }}
                  className="flex justify-between items-center px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer text-left transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 truncate">{author.name}</p>
                    {author.email && <p className="text-[10px] text-slate-400 truncate">{author.email}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => deleteAuthorFromPool(author.id, e)}
                    className="text-slate-300 hover:text-red-500 p-1 rounded transition ml-2 text-[10px]"
                    title={wizardLang === 'tr' ? 'Sil' : 'Delete'}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const updateAuthorField = (index: number, field: keyof WizardAuthor, value: string) => {
    setWizardAuthors(prev => prev.map((a, idx) => {
      if (idx === index) {
        return { ...a, [field]: value };
      }
      return a;
    }));
  };

  const formatAuthorsList = (list: WizardAuthor[], correspondingName: string) => {
    const active = list.filter(a => a.name.trim().length > 0);
    if (active.length === 0) return '';
    
    // 1. Generate author names line
    const namesLine = active.map((a, idx) => {
      const isCorr = a.name.trim().toLowerCase() === correspondingName.trim().toLowerCase();
      const corrMark = isCorr ? '*' : '';
      return `${a.name} ${idx + 1}${corrMark}`;
    }).join(', ');

    // 2. Generate affiliations lines
    const affiliationsLines = active.map((a, idx) => {
      const details = [
        a.orcid ? `ORCID: ${a.orcid}` : '',
        a.email ? `Email: ${a.email}` : ''
      ].filter(Boolean).join(', ');
      const detailsStr = details ? ` (${details})` : '';
      return `${idx + 1} ${a.institution || '[Kurum/Institution]'}${detailsStr}`;
    }).join('\n');

    const hasCorr = active.some(a => a.name.trim().toLowerCase() === correspondingName.trim().toLowerCase());
    const corrNote = hasCorr
      ? '\n* Sorumlu yazar / Corresponding author'
      : '';

    return `${namesLine}\n${affiliationsLines}${corrNote}`;
  };

  const renderAuthorSelectorForIndex = (idx: number) => {
    if (savedAuthors.length === 0) return null;
    const isOpen = activeSelectIdx === idx;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setActiveSelectIdx(isOpen ? null : idx)}
          className="text-[10px] text-violet-600 hover:text-violet-700 font-semibold"
        >
          👤 {wizardLang === 'tr' ? 'Yazar Seç' : 'Select'}
        </button>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setActiveSelectIdx(null)}
            />
            <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-50 max-h-48 overflow-y-auto">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100">
                {tLocal('letters_author_pool')}
              </div>
              {savedAuthors.map((author) => (
                <div
                  key={author.id}
                  onClick={() => {
                    setWizardAuthors(prev => prev.map((a, i) => {
                      if (i === idx) {
                        return {
                          name: author.name,
                          email: author.email || '',
                          orcid: author.orcid || '',
                          institution: author.address || '',
                        };
                      }
                      return a;
                    }));
                    setActiveSelectIdx(null);
                  }}
                  className="flex justify-between items-center px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer text-left transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 truncate">{author.name}</p>
                    {author.email && <p className="text-[10px] text-slate-400 truncate">{author.email}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const addBlankAuthorToPool = () => {
    const newAuthor: SavedAuthor = {
      id: newId('auth'),
      name: '',
      email: '',
      orcid: '',
      address: '',
    };
    const updated = [...savedAuthors, newAuthor];
    setSavedAuthors(updated);
    localStorage.setItem('endnotere-author-pool', JSON.stringify(updated));
  };

  const updateSavedAuthorField = (id: string, field: keyof SavedAuthor, value: string) => {
    const updated = savedAuthors.map(a => {
      if (a.id === id) {
        return { ...a, [field]: value };
      }
      return a;
    });
    setSavedAuthors(updated);
    localStorage.setItem('endnotere-author-pool', JSON.stringify(updated));
  };

  const handleSaveAsTemplate = () => {
    const name = prompt(lang === 'tr' ? 'Şablon adı girin:' : 'Enter template name:', editTitle);
    if (!name || !name.trim()) return;
    
    const newTemplate: CustomTemplate = {
      id: newId('tmpl'),
      title: name.trim(),
      content: editContent,
      createdAt: Date.now()
    };
    
    const updatedTemplates = [...customTemplates, newTemplate];
    setCustomTemplates(updatedTemplates);
    localStorage.setItem('endnotere-custom-templates', JSON.stringify(updatedTemplates));
    alert(lang === 'tr' ? 'Şablon başarıyla kaydedildi!' : 'Template saved successfully!');
  };

  const handleRecallTemplate = async (template: CustomTemplate) => {
    const newDoc: ProjectDocument = {
      id: newId('doc'),
      type: 'custom',
      title: template.title,
      content: template.content,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const updatedProject: Project = {
      ...project,
      documents: [...documentsList, newDoc],
      updatedAt: Date.now()
    };
    
    await saveProject(updatedProject);
    onSaved(updatedProject);
    setShowWizard(false);
    openDoc(newDoc);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(lang === 'tr' ? 'Bu şablonu silmek istediğinize emin misiniz?' : 'Are you sure you want to delete this template?')) return;
    const updatedTemplates = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updatedTemplates);
    localStorage.setItem('endnotere-custom-templates', JSON.stringify(updatedTemplates));
    if (editingTemplateId === id) {
      setEditingTemplateId(null);
      setTemplateName('');
      setTemplateContent('');
    }
  };

  const handleUpdateTemplate = () => {
    if (!editingTemplateId) return;
    
    if (!templateName.trim()) {
      alert(lang === 'tr' ? 'Şablon adı boş olamaz!' : 'Template name cannot be empty!');
      return;
    }

    let updatedTemplates;
    if (editingTemplateId === 'new') {
      const newTemplate: CustomTemplate = {
        id: newId('tmpl'),
        title: templateName.trim(),
        content: templateContent,
        createdAt: Date.now()
      };
      updatedTemplates = [...customTemplates, newTemplate];
    } else {
      updatedTemplates = customTemplates.map(t => {
        if (t.id === editingTemplateId) {
          return {
            ...t,
            title: templateName.trim(),
            content: templateContent,
          };
        }
        return t;
      });
    }

    setCustomTemplates(updatedTemplates);
    localStorage.setItem('endnotere-custom-templates', JSON.stringify(updatedTemplates));
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateContent('');
    alert(lang === 'tr' ? 'Şablon kaydedildi!' : 'Template saved!');
  };

  const renderCustomTemplatesManager = () => {
    if (editingTemplateId) {
      return (
        <div className="space-y-4 pt-2">
          <div>
            <h3 className="text-sm font-bold text-primary">
              {wizardLang === 'tr' ? 'Şablonu Düzenle' : 'Edit Template'}
            </h3>
            <p className="text-[10px] text-muted">
              {wizardLang === 'tr' 
                ? 'Şablon başlığını ve içeriğini düzenleyebilirsiniz.' 
                : 'You can edit the template title and content.'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>
                {wizardLang === 'tr' ? 'Şablon Adı' : 'Template Title'}
              </label>
              <input
                className={inputCls}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={wizardLang === 'tr' ? 'örn. Benim Kapak Mektubum' : 'e.g. My Cover Letter'}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>
                {wizardLang === 'tr' ? 'Şablon İçeriği' : 'Template Content'}
              </label>
              <textarea
                className={`${inputCls} h-64 font-mono text-xs`}
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                placeholder={wizardLang === 'tr' ? 'Şablon metnini buraya yazın...' : 'Write template text here...'}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setEditingTemplateId(null);
                setTemplateName('');
                setTemplateContent('');
              }}
              className="px-3 py-1.5 text-xs border border-border rounded-lg text-secondary hover:bg-slate-50 transition"
            >
              {wizardLang === 'tr' ? 'Vazgeç' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleUpdateTemplate}
              className="px-3 py-1.5 text-xs bg-violet-600 text-white hover:bg-violet-700 rounded-lg font-semibold shadow-sm transition"
            >
              {wizardLang === 'tr' ? 'Güncelle' : 'Update'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 pt-2">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-primary">
              {wizardLang === 'tr' ? 'Kayıtlı Şablonlarım' : 'My Saved Templates'}
            </h3>
            <p className="text-[10px] text-muted">
              {wizardLang === 'tr' 
                ? 'Kaydettiğiniz şablonları geri çağırarak yeni belgeler oluşturabilir veya şablonları düzenleyebilirsiniz.' 
                : 'Recall your saved templates to create new documents, or edit them.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingTemplateId('new');
              setTemplateName('');
              setTemplateContent('');
            }}
            className="text-xs bg-violet-600 text-white hover:bg-violet-700 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            ➕ {wizardLang === 'tr' ? 'Yeni Şablon Ekle' : 'Add New Template'}
          </button>
        </div>

        <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
          {customTemplates.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl bg-slate-50/50">
              <span className="text-3xl">🗂️</span>
              <p className="text-xs text-muted mt-2">
                {wizardLang === 'tr' ? 'Henüz kayıtlı şablonunuz yok.' : 'No saved templates yet.'}
              </p>
            </div>
          ) : (
            customTemplates.map((tmpl) => (
              <div key={tmpl.id} className="p-3 bg-slate-50/70 rounded-lg border border-slate-150 relative space-y-2 hover:border-slate-300 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-primary">{tmpl.title}</h4>
                    <p className="text-[10px] text-muted mt-1 max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                      {tmpl.content ? tmpl.content.substring(0, 120) + (tmpl.content.length > 120 ? '...' : '') : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRecallTemplate(tmpl)}
                      className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-semibold transition"
                      title={wizardLang === 'tr' ? 'Belge Olarak Oluştur' : 'Create as Document'}
                    >
                      🚀 {wizardLang === 'tr' ? 'Kullan' : 'Use'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplateId(tmpl.id);
                        setTemplateName(tmpl.title);
                        setTemplateContent(tmpl.content);
                      }}
                      className="text-[10px] bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded font-semibold transition"
                      title={wizardLang === 'tr' ? 'Şablonu Düzenle' : 'Edit Template'}
                    >
                      ✏️ {wizardLang === 'tr' ? 'Düzenle' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                      className="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded font-semibold transition"
                      title={wizardLang === 'tr' ? 'Şablonu Sil' : 'Delete Template'}
                    >
                      🗑️ {wizardLang === 'tr' ? 'Sil' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderAuthorPoolManager = () => {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-primary">
              {wizardLang === 'tr' ? 'Yazar Havuzu Yönetimi' : 'Author Pool Management'}
            </h3>
            <p className="text-[10px] text-muted">
              {wizardLang === 'tr' 
                ? 'Sistemde kayıtlı olan yazarları buradan düzenleyebilir, yenilerini ekleyebilir veya silebilirsiniz.' 
                : 'Here you can edit saved authors, add new ones, or delete them.'}
            </p>
          </div>
          <button
            type="button"
            onClick={addBlankAuthorToPool}
            className="text-xs bg-violet-600 text-white hover:bg-violet-700 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            ➕ {wizardLang === 'tr' ? 'Yeni Yazar Ekle' : 'Add New Author'}
          </button>
        </div>

        <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
          {savedAuthors.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl bg-slate-50/50">
              <span className="text-3xl">👤</span>
              <p className="text-xs text-muted mt-2">
                {wizardLang === 'tr' ? 'Havuzda henüz kayıtlı yazar yok.' : 'No saved authors in the pool.'}
              </p>
            </div>
          ) : (
            savedAuthors.map((author, idx) => (
              <div key={author.id} className="p-3 bg-slate-50/70 rounded-lg border border-slate-150 relative space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400">
                    #{idx + 1} {wizardLang === 'tr' ? 'Kayıtlı Yazar' : 'Saved Author'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => deleteAuthorFromPool(author.id, e)}
                    className="text-slate-400 hover:text-red-500 text-xs"
                    title={wizardLang === 'tr' ? 'Havuzdan Sil' : 'Delete from Pool'}
                  >
                    🗑️
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted px-1">
                      {wizardLang === 'tr' ? 'Adı Soyadı' : 'Full Name'}
                    </span>
                    <input
                      className={inputCls}
                      placeholder={wizardLang === 'tr' ? 'Adı Soyadı' : 'Full Name'}
                      value={author.name}
                      onChange={(e) => updateSavedAuthorField(author.id, 'name', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted px-1">
                      {wizardLang === 'tr' ? 'Kurum / Üniversite' : 'Institution / University'}
                    </span>
                    <input
                      className={inputCls}
                      placeholder={wizardLang === 'tr' ? 'Kurum / Üniversite' : 'Institution / University'}
                      value={author.address || ''}
                      onChange={(e) => updateSavedAuthorField(author.id, 'address', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted px-1">
                      {wizardLang === 'tr' ? 'E-posta' : 'Email'}
                    </span>
                    <input
                      className={inputCls}
                      placeholder={wizardLang === 'tr' ? 'E-posta' : 'Email'}
                      value={author.email || ''}
                      onChange={(e) => updateSavedAuthorField(author.id, 'email', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase font-bold text-muted px-1">
                      ORCID
                    </span>
                    <input
                      className={inputCls}
                      placeholder="ORCID (e.g. 0000-0002-xxxx-xxxx)"
                      value={author.orcid || ''}
                      onChange={(e) => updateSavedAuthorField(author.id, 'orcid', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderAuthorsManager = () => {
    return (
      <div className="space-y-3 border-t border-slate-100 pt-3 sm:col-span-2">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-slate-700">
            {wizardLang === 'tr' ? 'Yazarlar Listesi' : 'Authors List'}
          </h4>
          <button
            type="button"
            onClick={() => setWizardAuthors([...wizardAuthors, { name: '', email: '', orcid: '', institution: '' }])}
            className="text-xs text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1 transition"
          >
            ➕ {wizardLang === 'tr' ? 'Yazar Ekle' : 'Add Author'}
          </button>
        </div>
        
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {wizardAuthors.map((author, idx) => (
            <div key={idx} className="p-3 bg-slate-50/70 rounded-lg border border-slate-150 relative space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400">
                  #{idx + 1} {wizardLang === 'tr' ? 'Yazar' : 'Author'}
                </span>
                <div className="flex items-center gap-3">
                  {/* Set as corresponding button */}
                  <button
                    type="button"
                    onClick={() => {
                      setCorrespondingAuthor(author.name);
                      if (author.email) setCorrespondingEmail(author.email);
                      if (author.orcid) setOrcid(author.orcid);
                      if (author.institution) setCorrespondingAddress(author.institution);
                      setCorrFeedbackIdx(idx);
                      setTimeout(() => setCorrFeedbackIdx(null), 2000);
                    }}
                    className={`text-[10px] font-semibold flex items-center gap-0.5 transition ${
                      correspondingAuthor.trim() !== '' && correspondingAuthor.toLowerCase() === author.name.toLowerCase()
                        ? 'text-violet-600 font-bold'
                        : 'text-slate-400 hover:text-violet-600'
                    }`}
                  >
                    {corrFeedbackIdx === idx ? (
                      <span>⭐ {wizardLang === 'tr' ? 'Atandı!' : 'Assigned!'}</span>
                    ) : (
                      correspondingAuthor.trim() !== '' && correspondingAuthor.toLowerCase() === author.name.toLowerCase()
                        ? <span>⭐ {wizardLang === 'tr' ? 'Sorumlu Yazar' : 'Corresponding'}</span>
                        : <span>☆ {wizardLang === 'tr' ? 'Sorumlu Yap' : 'Set Corresponding'}</span>
                    )}
                  </button>

                  {/* Save to pool button */}
                  {author.name.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        saveAuthorToPool({
                          name: author.name,
                          email: author.email,
                          orcid: author.orcid,
                          address: author.institution
                        });
                        setSavedFeedback(prev => ({ ...prev, [idx]: true }));
                        setTimeout(() => setSavedFeedback(prev => ({ ...prev, [idx]: false })), 2000);
                      }}
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold"
                      title={tLocal('letters_save_pool')}
                    >
                      {savedFeedback[idx] ? '✅' : '💾'}
                    </button>
                  )}
                  {/* Selector */}
                  {renderAuthorSelectorForIndex(idx)}
                  {/* Delete button */}
                  {wizardAuthors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setWizardAuthors(wizardAuthors.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-500 text-xs"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className={inputCls}
                  placeholder={wizardLang === 'tr' ? 'Adı Soyadı' : 'Full Name'}
                  value={author.name}
                  onChange={(e) => updateAuthorField(idx, 'name', e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder={wizardLang === 'tr' ? 'Kurum / Üniversite' : 'Institution / University'}
                  value={author.institution}
                  onChange={(e) => updateAuthorField(idx, 'institution', e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder={wizardLang === 'tr' ? 'E-posta' : 'Email'}
                  value={author.email}
                  onChange={(e) => updateAuthorField(idx, 'email', e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder="ORCID (e.g. 0000-0002-xxxx-xxxx)"
                  value={author.orcid}
                  onChange={(e) => updateAuthorField(idx, 'orcid', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Compute stats of manuscript
  const manuscriptWordCount = getWordCount(project.bodyText || '');
  const citationCount = project.refs.length;

  const documentsList = project.documents || [];

  // Reset wizard inputs
  const resetWizardFields = (type: WizardTab) => {
    setWizardType(type);
    setWizardLang(lang === 'tr' ? 'tr' : 'en');
    setDocTitle('');
    setJournalName('');
    setManuscriptTitle(project.title);
    setCorrespondingAuthor('');
    setCorrespondingEmail('');
    setCorrespondingAddress('');
    setOrcid('');
    setWizardAuthors([{ name: '', email: '', orcid: '', institution: '' }]);
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

  useEffect(() => {
    if (wizardLang === 'tr') {
      if (manuscriptType === 'Original Article') setManuscriptType('Özgün Araştırma Makalesi');
    } else {
      if (manuscriptType === 'Özgün Araştırma Makalesi') setManuscriptType('Original Article');
    }
  }, [wizardLang]);

  const handleCreateDocument = async () => {
    let generatedContent = '';
    let finalTitle = docTitle.trim();
    const currentLang: LetterLang = wizardLang;

    const coAuthorsNames = wizardAuthors
      .filter(a => a.name.trim().toLowerCase() !== correspondingAuthor.trim().toLowerCase())
      .map(a => a.name.trim())
      .filter(Boolean)
      .join(', ');

    const fullAuthorsStr = formatAuthorsList(wizardAuthors, correspondingAuthor);
    const allAuthorNames = wizardAuthors.map(a => a.name.trim()).filter(Boolean);

    if (wizardType === 'cover') {
      if (!finalTitle) finalTitle = getDocTypeName('cover', wizardLang);
      generatedContent = buildCoverLetter({
        journalName,
        manuscriptTitle,
        correspondingAuthor,
        authors: coAuthorsNames || undefined,
        manuscriptType,
        keyFinding,
        lang: currentLang,
      });
    } else if (wizardType === 'title-page') {
      if (!finalTitle) finalTitle = getDocTypeName('title-page', wizardLang);
      generatedContent = buildTitlePage({
        manuscriptTitle,
        runningTitle,
        authorsStr: fullAuthorsStr || undefined,
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
      if (!finalTitle) finalTitle = getDocTypeName('response', wizardLang);
      generatedContent = buildResponseToReviewers({
        journalName: journalName || undefined,
        manuscriptTitle: manuscriptTitle || undefined,
        points: parseReviewerComments(reviewerRaw),
        lang: currentLang,
      });
    } else if (wizardType === 'contrib') {
      if (!finalTitle) finalTitle = getDocTypeName('contrib', wizardLang);
      generatedContent = buildAuthorContributions({
        authors: allAuthorNames,
        lang: currentLang,
      });
    } else if (wizardType === 'coi') {
      if (!finalTitle) finalTitle = getDocTypeName('coi', wizardLang);
      generatedContent = buildConflictOfInterest({
        authors: allAuthorNames,
        hasConflict,
        lang: currentLang,
      });
    } else {
      if (!finalTitle) finalTitle = lang === 'tr' ? 'Özel Belge' : 'Custom Document';
      generatedContent = '';
    }

    const newDoc: ProjectDocument = {
      id: newId('doc'),
      type: wizardType as DocType,
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

    // Auto-save all authors in the wizard to the pool
    wizardAuthors.forEach(a => {
      if (a.name.trim()) {
        saveAuthorToPool({
          name: a.name,
          email: a.email,
          orcid: a.orcid,
          address: a.institution
        });
      }
    });

    if (correspondingAuthor.trim() && !wizardAuthors.some(a => a.name.trim().toLowerCase() === correspondingAuthor.trim().toLowerCase())) {
      saveAuthorToPool({
        name: correspondingAuthor,
        email: correspondingEmail,
        orcid: orcid,
        address: correspondingAddress,
      });
    }

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

  const getDocIcon = (type: WizardTab) => {
    switch (type) {
      case 'cover': return '✉️';
      case 'title-page': return '📄';
      case 'response': return '💬';
      case 'contrib': return '👥';
      case 'coi': return '⚖️';
      case 'author-pool': return '👥';
      case 'custom-templates': return '🗂️';
      default: return '📝';
    }
  };

  const getDocTypeName = (type: WizardTab, l: LetterLang = lang === 'tr' ? 'tr' : 'en') => {
    switch (type) {
      case 'cover': return tI18n('letters_cover', l);
      case 'title-page': return tI18n('letters_title_page', l);
      case 'response': return tI18n('letters_response', l);
      case 'contrib': return tI18n('letters_contrib', l);
      case 'coi': return tI18n('letters_coi', l);
      case 'author-pool': return l === 'tr' ? 'Yazar Listesi' : 'Author List';
      case 'custom-templates': return l === 'tr' ? 'Şablonlarım' : 'My Templates';
      default: return l === 'tr' ? 'Özel Belge' : 'Custom';
    }
  };



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
            <div
              onClick={onOpenManuscript}
              className="card p-6 flex flex-col justify-between hover:shadow-md transition border-2 border-transparent hover:border-teal/20 cursor-pointer group relative overflow-hidden bg-white"
            >
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
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">
                  {lang === 'tr' ? 'Doküman İstatistikleri' : 'Document Statistics'}
                </div>
                <div className="text-xs text-secondary space-y-1">
                  <div>• {t('ws_word_count')}: <strong className="text-primary">{getWordCount(editContent)}</strong></div>
                  <div>• {lang === 'tr' ? 'Karakter sayısı' : 'Character count'}: <strong className="text-primary">{editContent.length}</strong></div>
                  <div>• {lang === 'tr' ? 'Tür' : 'Type'}: <strong className="text-primary">{getDocTypeName(documentsList.find(d => d.id === selectedDocId)?.type || 'custom')}</strong></div>
                </div>
              </div>
            </div>

            {/* Right Column: Full Document Editor */}
            <div className="md:col-span-2 card p-5 bg-white flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-muted">{lang === 'tr' ? 'Belge Başlığı' : 'Document Title'}</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-sm font-bold border border-border rounded-lg px-3 py-2 bg-slate-50/30 text-primary focus:border-teal outline-none transition"
                  placeholder={lang === 'tr' ? 'Belge Başlığı' : 'Document Title'}
                />
              </div>

              <div className="flex-1 flex flex-col gap-1.5 min-h-[300px]">
                <label className="text-[10px] uppercase font-bold text-muted">{lang === 'tr' ? 'İçerik' : 'Content'}</label>
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
                  onClick={handleSaveAsTemplate}
                  disabled={!editContent}
                  className="btn-secondary text-xs px-3 py-2 flex-1 disabled:opacity-40 flex items-center justify-center gap-1 hover:bg-slate-50 transition"
                  title={lang === 'tr' ? 'Şablon olarak kaydet' : 'Save as template'}
                >
                  🗂️ {lang === 'tr' ? 'Şablon Kaydet' : 'Save Template'}
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
              {(['cover', 'title-page', 'response', 'contrib', 'coi', 'custom', 'author-pool', 'custom-templates'] as WizardTab[]).map((type) => (
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
              {/* Language Selection */}
              {wizardType !== 'author-pool' && wizardType !== 'custom-templates' && (
                <div className="bg-slate-50 p-3 rounded-lg border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-primary">{lang === 'tr' ? 'Yazışma / Şablon Dili' : 'Correspondence / Template Language'}</h4>
                    <p className="text-[10px] text-muted">{lang === 'tr' ? 'Oluşturulacak belgenin ve şablon alanlarının dilini seçin.' : 'Select the language for the generated document and template fields.'}</p>
                  </div>
                  <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-border w-fit shrink-0">
                    <button
                      type="button"
                      onClick={() => setWizardLang('tr')}
                      className={`px-3 py-1 text-xs rounded-md font-semibold transition ${
                        wizardLang === 'tr' ? 'bg-violet-600 text-white shadow-sm' : 'text-secondary hover:bg-slate-50'
                      }`}
                    >
                      Türkçe
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardLang('en')}
                      className={`px-3 py-1 text-xs rounded-md font-semibold transition ${
                        wizardLang === 'en' ? 'bg-violet-600 text-white shadow-sm' : 'text-secondary hover:bg-slate-50'
                      }`}
                    >
                      English
                    </button>
                  </div>
                </div>
              )}

              {/* Common Fields */}
              {wizardType !== 'author-pool' && wizardType !== 'custom-templates' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 flex flex-col gap-1">
                    <label className={labelCls}>{wizardLang === 'tr' ? 'Mektup / Belge Adı (İsteğe Bağlı)' : 'Letter / Document Title (Optional)'}</label>
                    <input
                      className={inputCls}
                      placeholder={`${getDocTypeName(wizardType, wizardLang)} ${documentsList.length + 1}`}
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                    />
                  </div>

                  {(wizardType === 'cover' || wizardType === 'response') && (
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_journal')}</label>
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
                      <label className={labelCls}>{tLocal('letters_ms_title')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. A Deep Learning Approach..."
                        value={manuscriptTitle}
                        onChange={(e) => setManuscriptTitle(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Cover Letter Fields */}
              {wizardType === 'cover' && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center w-full">
                        <label className={labelCls}>{tLocal('letters_corresponding')}</label>
                        <div className="flex items-center gap-2">
                          {justSavedAuthor ? (
                            <span className="text-[10px] text-emerald-600 font-semibold animate-pulse flex items-center gap-0.5">
                              ✅ {tLocal('letters_saved_success')}
                            </span>
                          ) : (
                            correspondingAuthor.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  saveAuthorToPool({
                                    name: correspondingAuthor,
                                    email: correspondingEmail,
                                    orcid: orcid,
                                    address: correspondingAddress,
                                  });
                                  setJustSavedAuthor(true);
                                  setTimeout(() => setJustSavedAuthor(false), 2000);
                                }}
                                className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-0.5 transition"
                                title={tLocal('letters_save_pool')}
                              >
                                💾 {tLocal('letters_save_pool')}
                              </button>
                            )
                          )}
                          {renderAuthorPoolSelector()}
                        </div>
                      </div>
                      <input
                        className={inputCls}
                        placeholder="Dr. Ahmet Yılmaz"
                        value={correspondingAuthor}
                        onChange={(e) => setCorrespondingAuthor(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_ms_type')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. Original Article, Review"
                        value={manuscriptType}
                        onChange={(e) => setManuscriptType(e.target.value)}
                      />
                    </div>
                  </div>
                  {renderAuthorsManager()}
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{tLocal('letters_key_finding')}</label>
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
                      <label className={labelCls}>{tLocal('letters_running_title')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. Deep Learning in Healthcare"
                        value={runningTitle}
                        onChange={(e) => setRunningTitle(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center w-full">
                        <label className={labelCls}>{tLocal('letters_corresponding')}</label>
                        <div className="flex items-center gap-2">
                          {justSavedAuthor ? (
                            <span className="text-[10px] text-emerald-600 font-semibold animate-pulse flex items-center gap-0.5">
                              ✅ {tLocal('letters_saved_success')}
                            </span>
                          ) : (
                            correspondingAuthor.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  saveAuthorToPool({
                                    name: correspondingAuthor,
                                    email: correspondingEmail,
                                    orcid: orcid,
                                    address: correspondingAddress,
                                  });
                                  setJustSavedAuthor(true);
                                  setTimeout(() => setJustSavedAuthor(false), 2000);
                                }}
                                className="text-[10px] text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-0.5 transition"
                                title={tLocal('letters_save_pool')}
                              >
                                💾 {tLocal('letters_save_pool')}
                              </button>
                            )
                          )}
                          {renderAuthorPoolSelector()}
                        </div>
                      </div>
                      <input
                        className={inputCls}
                        placeholder="Dr. Ahmet Yılmaz"
                        value={correspondingAuthor}
                        onChange={(e) => setCorrespondingAuthor(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_corresponding_email')}</label>
                      <input
                        className={inputCls}
                        placeholder="ahmet@university.edu"
                        value={correspondingEmail}
                        onChange={(e) => setCorrespondingEmail(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_orcid')}</label>
                      <input
                        className={inputCls}
                        placeholder="0000-0002-XXXX-XXXX"
                        value={orcid}
                        onChange={(e) => setOrcid(e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_corresponding_address')}</label>
                      <input
                        className={inputCls}
                        placeholder="Department of Computer Science, University of X, City, Country"
                        value={correspondingAddress}
                        onChange={(e) => setCorrespondingAddress(e.target.value)}
                      />
                    </div>
                    {renderAuthorsManager()}
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_abs_wc')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 250"
                        value={absWordCount}
                        onChange={(e) => setAbsWordCount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_ms_wc')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 4500"
                        value={msWordCount}
                        onChange={(e) => setMsWordCount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_figs')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 5"
                        value={figsCount}
                        onChange={(e) => setFigsCount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelCls}>{tLocal('letters_tbls')}</label>
                      <input
                        className={inputCls}
                        placeholder="e.g. 2"
                        value={tblsCount}
                        onChange={(e) => setTblsCount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{tLocal('letters_funding')}</label>
                    <input
                      className={inputCls}
                      placeholder="This work was supported by X Grant No. Y..."
                      value={funding}
                      onChange={(e) => setFunding(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelCls}>{tLocal('letters_ack')}</label>
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
                    <label className={labelCls}>{tLocal('letters_reviewer_paste')}</label>
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
                  {renderAuthorsManager()}

                  {wizardType === 'coi' && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasConflict}
                          onChange={(e) => setHasConflict(e.target.checked)}
                          className="rounded border-border text-violet-600 focus:ring-violet-500"
                        />
                        {tLocal('letters_has_conflict')}
                      </label>
                      {hasConflict && (
                        <div className="flex flex-col gap-1">
                          <label className={labelCls}>{wizardLang === 'tr' ? 'Açıklama' : 'Description'}</label>
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
                  {wizardLang === 'tr'
                    ? 'Yeni bir boş belge oluşturulacak. Oluşturduktan sonra dilediğiniz gibi yazabilirsiniz.'
                    : 'A new empty document will be created. You can write whatever you want after creating it.'}
                </div>
              )}

              {/* Author Pool / Saved List Editor */}
              {wizardType === 'author-pool' && renderAuthorPoolManager()}

              {/* Custom Templates Manager */}
              {wizardType === 'custom-templates' && renderCustomTemplatesManager()}
            </div>

            <div className="px-5 py-3 border-t border-border bg-slate-50/50 flex gap-2 justify-end">
              <button
                onClick={() => setShowWizard(false)}
                className="btn-secondary text-xs px-4 py-2 font-semibold hover:bg-slate-100 border-border text-secondary transition"
              >
                {wizardLang === 'tr' ? 'Kapat' : 'Close'}
              </button>
              {wizardType !== 'author-pool' && wizardType !== 'custom-templates' && (
                <button
                  onClick={handleCreateDocument}
                  className="btn-primary text-xs px-4 py-2 font-semibold shadow-sm bg-violet-600 hover:bg-violet-700 transition"
                >
                  ⚙️ {tLocal('letters_generate')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
