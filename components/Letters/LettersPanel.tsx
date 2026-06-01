'use client';

import { useState } from 'react';
import {
  buildCoverLetter,
  buildResponseToReviewers,
  buildAuthorContributions,
  buildConflictOfInterest,
  parseReviewerComments,
  type LetterLang,
} from '@/lib/letters/templates';
import { aiHeaders } from '@/lib/ai/user-keys';

type LetterType = 'cover' | 'response' | 'contrib' | 'coi';

interface LettersPanelProps {
  defaultTitle: string;
  lang: LetterLang;
  aiEnabled: boolean;
  onClose: () => void;
  t: (k: string) => string;
}

function splitAuthors(s: string): string[] {
  return s
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
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
  const [output, setOutput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
    } else {
      setOutput(buildConflictOfInterest({ authors: splitAuthors(authorsStr), hasConflict, lang }));
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

  const TABS: Array<{ id: LetterType; label: string }> = [
    { id: 'cover', label: t('letters_cover') },
    { id: 'response', label: t('letters_response') },
    { id: 'contrib', label: t('letters_contrib') },
    { id: 'coi', label: t('letters_coi') },
  ];

  const inputCls = 'w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
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
            {(type === 'cover' || type === 'response') && (
              <>
                <input className={inputCls} placeholder={t('letters_journal')} value={journalName} onChange={(e) => setJournalName(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_ms_title')} value={title} onChange={(e) => setTitle(e.target.value)} />
              </>
            )}
            {type === 'cover' && (
              <>
                <input className={inputCls} placeholder={t('letters_corresponding')} value={corresponding} onChange={(e) => setCorresponding(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_authors')} value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} />
                <input className={inputCls} placeholder={t('letters_ms_type')} value={manuscriptType} onChange={(e) => setManuscriptType(e.target.value)} />
                <textarea className={`${inputCls} h-20 resize-none`} placeholder={t('letters_key_finding')} value={keyFinding} onChange={(e) => setKeyFinding(e.target.value)} />
              </>
            )}
            {type === 'response' && (
              <textarea className={`${inputCls} h-48 resize-none`} placeholder={t('letters_reviewer_paste')} value={reviewerRaw} onChange={(e) => setReviewerRaw(e.target.value)} />
            )}
            {(type === 'contrib' || type === 'coi') && (
              <textarea className={`${inputCls} h-24 resize-none`} placeholder={t('letters_authors_list')} value={authorsStr} onChange={(e) => setAuthorsStr(e.target.value)} />
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
