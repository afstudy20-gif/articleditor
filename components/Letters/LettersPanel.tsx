'use client';

import { useState, useEffect } from 'react';
import {
  buildCoverLetter,
  buildResponseToReviewers,
  buildAuthorContributions,
  buildConflictOfInterest,
  buildCopyrightTransfer,
  parseReviewerComments,
  buildTitlePage,
  type CopyrightVariant,
  type LetterLang,
  type TitlePageAuthor,
} from '@/lib/letters/templates';
import { aiHeaders } from '@/lib/ai/user-keys';
import { newId } from '@/lib/id';
import { parseTitlePageAuthors } from '@/lib/letters/parse-title-page-author';

type LetterType = 'cover' | 'title-page' | 'response' | 'contrib' | 'coi' | 'copyright';

interface LettersPanelProps {
  defaultTitle: string;
  lang: LetterLang;
  aiEnabled: boolean;
  onClose: () => void;
  t: (k: string) => string;
}

interface SavedAuthor {
  id: string;
  name: string;
  email?: string;
  orcid?: string;
  institution?: string;
}

function splitAuthors(s: string): string[] {
  return s
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function localDateInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function LettersPanel({ defaultTitle, lang, aiEnabled, onClose, t }: LettersPanelProps): JSX.Element {
  const [type, setType] = useState<LetterType>('cover');
  const [journalName, setJournalName] = useState('');
  const [title, setTitle] = useState(defaultTitle);
  const [corresponding, setCorresponding] = useState('');
  const [authorsStr, setAuthorsStr] = useState('');
  const [manuscriptType, setManuscriptType] = useState('Original Article');
  const [keyFinding, setKeyFinding] = useState('');
  const [reviewerRaw, setReviewerRaw] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  const [copyrightVariant, setCopyrightVariant] = useState<CopyrightVariant>('cc-by');
  const [copyrightDate, setCopyrightDate] = useState(localDateInputValue);
  const [output, setOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [runningTitle, setRunningTitle] = useState('');
  const [titlePageAuthors, setTitlePageAuthors] = useState<TitlePageAuthor[]>([
    { name: '', email: '', orcid: '', institution: '' },
  ]);
  const [titlePageAuthorPaste, setTitlePageAuthorPaste] = useState('');
  const [savedAuthors, setSavedAuthors] = useState<SavedAuthor[]>([]);
  const [justSavedIdx, setJustSavedIdx] = useState<number | null>(null);
  const [abstractWordCount, setAbstractWordCount] = useState('');
  const [manuscriptWordCount, setManuscriptWordCount] = useState('');
  const [figuresCount, setFiguresCount] = useState('');
  const [tablesCount, setTablesCount] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('endnotere-author-pool');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedAuthor[];
      setSavedAuthors(parsed);
    } catch (e) {
      console.error('Failed to parse author pool', e);
    }
  }, []);
  const [conflictDesc, setConflictDesc] = useState('');
  const [funding, setFunding] = useState('');
  const [acknowledgements, setAcknowledgements] = useState('');

  const generate = (): void => {
    setAiError(null);
    if (type === 'cover') {
      setOutput(
        buildCoverLetter({
          journalName: journalName || '[Journal]',
          manuscriptTitle: title || '[Title]',
          correspondingAuthor: corresponding || '[Author]',
          authors: authorsStr || undefined,
          manuscriptType,
          keyFinding: keyFinding || undefined,
          lang,
        }),
      );
    } else if (type === 'response') {
      setOutput(
        buildResponseToReviewers({
          journalName: journalName || undefined,
          manuscriptTitle: title || undefined,
          points: parseReviewerComments(reviewerRaw),
          lang,
        }),
      );
    } else if (type === 'contrib') {
      setOutput(buildAuthorContributions({ authors: splitAuthors(authorsStr), lang }));
    } else if (type === 'coi') {
      setOutput(buildConflictOfInterest({ authors: splitAuthors(authorsStr), hasConflict, lang }));
    } else if (type === 'title-page') {
      const correspondingAuthor = titlePageAuthors.find(
        (a) => a.name.trim().toLowerCase() === corresponding.trim().toLowerCase()
      );
      setOutput(
        buildTitlePage({
          manuscriptTitle: title,
          runningTitle,
          authors: titlePageAuthors,
          correspondingAuthor: corresponding,
          correspondingEmail: correspondingAuthor?.email || '',
          correspondingAddress: correspondingAuthor?.institution || '',
          orcid: correspondingAuthor?.orcid || '',
          abstractWordCount,
          manuscriptWordCount,
          figuresCount,
          tablesCount,
          conflictOfInterest: conflictDesc,
          funding,
          acknowledgements,
          lang,
        }),
      );
    } else {
      const authors = splitAuthors(authorsStr);
      if (corresponding.trim() && !authors.some((author) => author.toLowerCase() === corresponding.trim().toLowerCase())) {
        authors.push(corresponding.trim());
      }
      setOutput(buildCopyrightTransfer({
        journalName,
        manuscriptTitle: title,
        correspondingAuthor: corresponding,
        authors,
        date: copyrightDate,
        variant: copyrightVariant,
        lang,
      }));
    }
  };

  const improveAI = async (): Promise<void> => {
    if (!output.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiHeaders() },
        body: JSON.stringify({ draft: output, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data?.error ?? 'AI error');
        return;
      }
      if (data?.text) setOutput(data.text);
    } catch {
      setAiError(t('letters_ai_error'));
    } finally {
      setAiBusy(false);
    }
  };

  const copyOut = (): void => {
    void navigator.clipboard.writeText(output);
  };

  const downloadOut = (): void => {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-letter.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const saveAuthorToPool = (author: TitlePageAuthor) => {
    const trimmed: TitlePageAuthor = {
      name: author.name.trim(),
      email: author.email?.trim() || '',
      orcid: author.orcid?.trim() || '',
      institution: author.institution?.trim() || '',
    };
    if (!trimmed.name) return;
    setSavedAuthors((prev) => {
      const existing = prev.find(
        (a) =>
          a.name.trim().toLowerCase() === trimmed.name.toLowerCase() ||
          (trimmed.email && a.email?.trim().toLowerCase() === trimmed.email.toLowerCase())
      );
      let next: SavedAuthor[];
      if (existing) {
        next = prev.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                name: trimmed.name || a.name,
                email: trimmed.email || a.email,
                orcid: trimmed.orcid || a.orcid,
                institution: trimmed.institution || a.institution,
              }
            : a
        );
      } else {
        next = [...prev, { id: newId(), name: trimmed.name, email: trimmed.email, orcid: trimmed.orcid, institution: trimmed.institution }];
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('endnotere-author-pool', JSON.stringify(next));
      }
      return next;
    });
  };

  const applySavedAuthor = (idx: number, authorId: string) => {
    const saved = savedAuthors.find((a) => a.id === authorId);
    if (!saved) return;
    setTitlePageAuthors((prev) =>
      prev.map((a, i) =>
        i === idx
          ? {
              ...a,
              name: saved.name,
              email: saved.email || a.email,
              orcid: saved.orcid || a.orcid,
              institution: saved.institution || a.institution,
            }
          : a
      )
    );
  };

  const applyTitlePageAuthorPaste = (): void => {
    const parsed = parseTitlePageAuthors(titlePageAuthorPaste);
    if (parsed.length === 0) return;
    setTitlePageAuthors((prev) =>
      prev.some((author) => author.name.trim() || author.email?.trim() || author.orcid?.trim() || author.institution?.trim())
        ? [...prev, ...parsed]
        : parsed,
    );
    if (!corresponding.trim()) setCorresponding(parsed[0].name);
    setTitlePageAuthorPaste('');
  };

  const TABS: Array<{ id: LetterType; label: string }> = [
    { id: 'cover', label: t('letters_cover') },
    { id: 'title-page', label: t('letters_title_page') || 'Title Page' },
    { id: 'response', label: t('letters_response') },
    { id: 'contrib', label: t('letters_contrib') },
    { id: 'coi', label: t('letters_coi') },
    { id: 'copyright', label: lang === 'tr' ? 'Telif / Lisans' : 'Copyright / License' },
  ];

  const inputCls = 'w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary';

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 pb-4 px-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary">✉️ {t('letters_title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>

        <div className="flex gap-1 px-3 pt-2 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setType(tab.id)}
              className={`px-3 py-1.5 text-xs rounded-t-md ${
                type === tab.id ? 'bg-teal text-white font-semibold' : 'text-secondary hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-3 p-4 overflow-auto flex-1">
          <div className="space-y-2">
            {(type === 'cover' || type === 'response' || type === 'copyright') && (
              <input className={inputCls} placeholder={t('letters_journal')} value={journalName} onChange={(e) => setJournalName(e.target.value)} />
            )}
            {(type === 'cover' || type === 'response' || type === 'copyright' || type === 'title-page') && (
              <input className={inputCls} placeholder={t('letters_ms_title')} value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
            {type === 'cover' && (
              <>
                <input className={inputCls} placeholder={t('letters_corresponding')} value={corresponding} onChange={(e) => setCorresponding(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_authors')} value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_ms_type')} value={manuscriptType} onChange={(e) => setManuscriptType(e.target.value)} />
                <textarea className={`${inputCls} h-20 resize-none`} placeholder={t('letters_key_finding')} value={keyFinding} onChange={(e) => setKeyFinding(e.target.value)} />
              </>
            )}
            {type === 'title-page' && (
              <>
                <input className={inputCls} placeholder={t('letters_running_title')} value={runningTitle} onChange={(e) => setRunningTitle(e.target.value)} />
                <div className="rounded border border-violet-100 bg-violet-50/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-secondary">
                      {lang === 'tr' ? 'Yazar bilgisini yapıştır' : 'Paste author details'}
                    </span>
                    <button
                      type="button"
                      onClick={applyTitlePageAuthorPaste}
                      disabled={!titlePageAuthorPaste.trim()}
                      className="text-[10px] px-2 py-1 rounded bg-violet-600 text-white font-semibold disabled:opacity-40"
                    >
                      {lang === 'tr' ? 'Alanlara aktar' : 'Fill fields'}
                    </button>
                  </div>
                  <textarea
                    className={`${inputCls} h-20 resize-none bg-white`}
                    placeholder={`Fatih Akkaya Department of Cardiology, Faculty of Medicine, Ordu University, Ordu, Türkiye\nORCID: 0000-0002-9016-4986\nEmail: drfatihakkaya@gmail.com`}
                    value={titlePageAuthorPaste}
                    onChange={(e) => setTitlePageAuthorPaste(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-secondary">{t('letters_authors')}</span>
                    <button
                      type="button"
                      onClick={() => setTitlePageAuthors((prev) => [...prev, { name: '', email: '', orcid: '', institution: '' }])}
                      className="text-[10px] text-violet-600 hover:text-violet-700 font-semibold"
                    >
                      ➕ {t('letters_add_author')}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {titlePageAuthors.map((author, idx) => {
                      const isCorresponding =
                        corresponding.trim().toLowerCase() === author.name.trim().toLowerCase() &&
                        author.name.trim().length > 0;
                      return (
                        <div key={idx} className="p-2 bg-slate-50 rounded border border-border space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">#{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => setCorresponding(author.name)}
                              disabled={isCorresponding || !author.name.trim()}
                              className={`text-[10px] px-2 py-0.5 rounded font-semibold leading-tight ${
                                isCorresponding
                                  ? 'bg-teal text-white cursor-default'
                                  : 'bg-white border border-border text-secondary hover:text-primary hover:border-teal'
                              } disabled:opacity-50`}
                              title={lang === 'tr' ? 'Sorumlu yazar olarak işaretle' : 'Set as corresponding author'}
                            >
                              {isCorresponding ? '✓ ' + (lang === 'tr' ? 'Sorumlu Yazar' : 'Corresponding') : lang === 'tr' ? 'Sorumlu Yazar Yap' : 'Set as Corresponding'}
                            </button>
                            <div className="flex-1" />
                            {titlePageAuthors.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setTitlePageAuthors((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-500 text-xs"
                                title={lang === 'tr' ? 'Yazarı kaldır' : 'Remove author'}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <select
                              className={`${inputCls} text-[10px] py-1`}
                              value=""
                              onChange={(e) => applySavedAuthor(idx, e.target.value)}
                              disabled={savedAuthors.length === 0}
                            >
                              <option value="">
                                {savedAuthors.length === 0
                                  ? lang === 'tr'
                                    ? 'Kayıtlı yazar yok'
                                    : 'No saved authors'
                                  : lang === 'tr'
                                    ? 'Kayıtlı yazarlar...'
                                    : 'Saved authors...'}
                              </option>
                              {savedAuthors.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                saveAuthorToPool(author);
                                setJustSavedIdx(idx);
                                setTimeout(() => setJustSavedIdx(null), 1500);
                              }}
                              disabled={!author.name.trim()}
                              className={`text-[10px] px-2 py-1 rounded border font-semibold whitespace-nowrap ${
                                justSavedIdx === idx
                                  ? 'bg-teal text-white border-teal'
                                  : 'bg-white border-border text-secondary hover:text-primary hover:border-teal'
                              } disabled:opacity-40`}
                            >
                              {justSavedIdx === idx ? '✓ ' + (lang === 'tr' ? 'Kaydedildi' : 'Saved') : lang === 'tr' ? 'Hafızaya Kaydet' : 'Save to Pool'}
                            </button>
                          </div>
                          <input
                            className={inputCls}
                            placeholder={t('letters_author_name')}
                            value={author.name}
                            onChange={(e) =>
                              setTitlePageAuthors((prev) =>
                                prev.map((a, i) => (i === idx ? { ...a, name: e.target.value } : a))
                              )
                            }
                          />
                          <input
                            className={inputCls}
                            placeholder={t('letters_author_institution')}
                            value={author.institution}
                            onChange={(e) =>
                              setTitlePageAuthors((prev) =>
                                prev.map((a, i) => (i === idx ? { ...a, institution: e.target.value } : a))
                              )
                            }
                          />
                          <input
                            className={inputCls}
                            placeholder={t('letters_author_email')}
                            value={author.email}
                            onChange={(e) =>
                              setTitlePageAuthors((prev) =>
                                prev.map((a, i) => (i === idx ? { ...a, email: e.target.value } : a))
                              )
                            }
                          />
                          <input
                            className={inputCls}
                            placeholder={t('letters_author_orcid')}
                            value={author.orcid}
                            onChange={(e) =>
                              setTitlePageAuthors((prev) =>
                                prev.map((a, i) => (i === idx ? { ...a, orcid: e.target.value } : a))
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder={t('letters_abs_wc')} value={abstractWordCount} onChange={(e) => setAbstractWordCount(e.target.value)} />
                  <input className={inputCls} placeholder={t('letters_ms_wc')} value={manuscriptWordCount} onChange={(e) => setManuscriptWordCount(e.target.value)} />
                  <input className={inputCls} placeholder={t('letters_figs')} value={figuresCount} onChange={(e) => setFiguresCount(e.target.value)} />
                  <input className={inputCls} placeholder={t('letters_tbls')} value={tablesCount} onChange={(e) => setTablesCount(e.target.value)} />
                </div>
                <input className={inputCls} placeholder={t('letters_coi')} value={conflictDesc} onChange={(e) => setConflictDesc(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_funding')} value={funding} onChange={(e) => setFunding(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_ack')} value={acknowledgements} onChange={(e) => setAcknowledgements(e.target.value)} />
              </>
            )}
            {type === 'response' && (
              <textarea className={`${inputCls} h-48 resize-none`} placeholder={t('letters_reviewer_paste')} value={reviewerRaw} onChange={(e) => setReviewerRaw(e.target.value)} />
            )}
            {(type === 'contrib' || type === 'coi') && (
              <textarea className={`${inputCls} h-24 resize-none`} placeholder={t('letters_authors_list')} value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} />
            )}
            {type === 'copyright' && (
              <>
                <input className={inputCls} placeholder={t('letters_corresponding')} value={corresponding} onChange={(e) => setCorresponding(e.target.value)} />
                <textarea className={`${inputCls} h-24 resize-none`} placeholder={t('letters_authors_list')} value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} />
                <input type="date" className={inputCls} value={copyrightDate} onChange={(e) => setCopyrightDate(e.target.value)} />
                <select
                  className={inputCls}
                  value={copyrightVariant}
                  onChange={(e) => setCopyrightVariant(e.target.value as CopyrightVariant)}
                >
                  <option value="cc-by">CC BY 4.0</option>
                  <option value="license">{lang === 'tr' ? 'Yayın lisansı' : 'License to publish'}</option>
                  <option value="transfer">{lang === 'tr' ? 'Telif devri' : 'Copyright transfer'}</option>
                </select>
              </>
            )}
            {type === 'coi' && (
              <label className="flex items-center gap-2 text-xs text-secondary">
                <input type="checkbox" checked={hasConflict} onChange={(e) => setHasConflict(e.target.checked)} />
                {t('letters_has_conflict')}
              </label>
            )}
            <button onClick={generate} className="btn-primary text-xs px-3 py-1.5 w-full">
              ⚙️ {t('letters_generate')}
            </button>
          </div>

          <div className="space-y-2 flex flex-col">
            <textarea
              className={`${inputCls} flex-1 min-h-[240px] font-mono resize-none`}
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              placeholder={t('letters_output_hint')}
            />
            {aiError && <p className="text-xs text-red">{aiError}</p>}
            <div className="flex gap-2">
              <button onClick={copyOut} disabled={!output} className="btn-secondary text-xs px-2 py-1.5 flex-1 disabled:opacity-40">
                📋 {t('letters_copy')}
              </button>
              <button onClick={downloadOut} disabled={!output} className="btn-secondary text-xs px-2 py-1.5 flex-1 disabled:opacity-40">
                💾 .txt
              </button>
              <button
                onClick={improveAI}
                disabled={!output || aiBusy || !aiEnabled}
                title={aiEnabled ? '' : t('letters_ai_disabled')}
                className="text-xs px-2 py-1.5 flex-1 rounded bg-violet-500 text-white font-semibold hover:bg-violet-600 disabled:opacity-40"
              >
                ✨ {aiBusy ? t('letters_ai_busy') : t('letters_ai_improve')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
