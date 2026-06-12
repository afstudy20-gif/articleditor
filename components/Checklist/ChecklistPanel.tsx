'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractDocStructure } from '@/lib/editor/doc-structure';
import {
  GUIDELINES,
  getGuideline,
  type GuidelineId,
} from '@/lib/checklists/guidelines';
import {
  scanChecklist,
  checklistToText,
  type ChecklistState,
  type ItemDecision,
} from '@/lib/checklists/scan';

interface ChecklistPanelProps {
  docJson: unknown;
  projectId: string;
  manuscriptTitle: string;
  lang: 'tr' | 'en';
  t: (k: string) => string;
  onClose: () => void;
  /** Insert the rendered checklist text into the manuscript (e.g. as supplementary). */
  onInsertText?: (text: string) => void;
}

const STORAGE_PREFIX = 'enr-checklist';

interface StoredState {
  guideline: GuidelineId;
  decisions: Record<string, ItemDecision>;
  locations: Record<string, string>;
}

function loadState(projectId: string): StoredState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      guideline: parsed.guideline === 'strobe' ? 'strobe' : 'consort',
      decisions: parsed.decisions ?? {},
      locations: parsed.locations ?? {},
    };
  } catch {
    return null;
  }
}

const NEXT_DECISION: Record<ItemDecision, ItemDecision> = {
  pending: 'addressed',
  addressed: 'na',
  na: 'pending',
};

export function ChecklistPanel({
  docJson,
  projectId,
  manuscriptTitle,
  lang,
  t,
  onClose,
  onInsertText,
}: ChecklistPanelProps): JSX.Element {
  const tr = lang === 'tr';
  const stored = useMemo(() => loadState(projectId), [projectId]);
  const [guidelineId, setGuidelineId] = useState<GuidelineId>(stored?.guideline ?? 'consort');
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(stored?.decisions ?? {});
  const [locations, setLocations] = useState<Record<string, string>>(stored?.locations ?? {});
  const [copyMsg, setCopyMsg] = useState('');

  const guideline = getGuideline(guidelineId)!;

  const scan = useMemo(() => {
    const { plainText } = extractDocStructure(docJson);
    return scanChecklist(plainText, guideline);
  }, [docJson, guideline]);

  // Persist on any change.
  useEffect(() => {
    try {
      const payload: StoredState = { guideline: guidelineId, decisions, locations };
      localStorage.setItem(`${STORAGE_PREFIX}-${projectId}`, JSON.stringify(payload));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [projectId, guidelineId, decisions, locations]);

  const addressedCount = guideline.items.filter((i) => decisions[i.id] === 'addressed').length;

  const cycleDecision = useCallback((id: string) => {
    setDecisions((prev) => ({ ...prev, [id]: NEXT_DECISION[prev[id] ?? 'pending'] }));
  }, []);

  const setLocation = useCallback((id: string, value: string) => {
    setLocations((prev) => ({ ...prev, [id]: value }));
  }, []);

  const buildState = (): ChecklistState => ({ decisions, locations });

  const flash = (msg: string) => {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2000);
  };

  const copyText = async () => {
    const text = checklistToText(guideline, buildState(), { lang, manuscriptTitle });
    try {
      await navigator.clipboard.writeText(text);
      flash(tr ? 'Kopyalandı' : 'Copied');
    } catch {
      flash(tr ? 'Kopyalanamadı' : 'Copy failed');
    }
  };

  const downloadText = () => {
    const text = checklistToText(guideline, buildState(), { lang, manuscriptTitle });
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${guideline.id}-checklist.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const insertText = () => {
    if (!onInsertText) return;
    onInsertText(checklistToText(guideline, buildState(), { lang, manuscriptTitle }));
    flash(tr ? 'Metne eklendi' : 'Inserted');
  };

  const decisionStyle: Record<ItemDecision, string> = {
    addressed: 'bg-teal text-white border-teal',
    na: 'bg-slate-200 text-slate-600 border-slate-300',
    pending: 'bg-white text-muted border-border',
  };
  const decisionLabel = (d: ItemDecision): string =>
    tr
      ? { addressed: 'Evet', na: 'Uygulanamaz', pending: 'Bekliyor' }[d]
      : { addressed: 'Yes', na: 'N/A', pending: 'Pending' }[d];

  let lastSection = '';

  return (
    <div className="card flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">✅ {t('ed_checklist')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">×</button>
      </div>

      {/* Guideline selector + progress */}
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="flex rounded-md border border-border text-[11px] overflow-hidden">
          {GUIDELINES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGuidelineId(g.id)}
              className={`flex-1 px-2 py-1 ${guidelineId === g.id ? 'bg-teal text-white' : 'hover:bg-slate-50'}`}
            >
              {g.name}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted leading-snug">
          {tr ? guideline.description.tr : guideline.description.en}
        </p>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-secondary">
            {tr ? 'İşaretlenen' : 'Addressed'}: <b className="text-primary">{addressedCount}</b> / {guideline.items.length}
          </span>
          <span className="text-secondary">
            {tr ? 'Otomatik bulunan' : 'Auto-detected'}: <b className="text-teal">{scan.likelyCount}</b>
          </span>
        </div>
        <p className="text-[9px] text-muted italic leading-snug">{t('ed_checklist_hint')}</p>
      </div>

      {copyMsg && (
        <div className="px-3 py-1.5 bg-teal-bg text-teal text-xs text-center font-medium">{copyMsg}</div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-auto">
        {guideline.items.map((item) => {
          const showHeader = item.section !== lastSection;
          lastSection = item.section;
          const sec = guideline.sections.find((s) => s.key === item.section);
          const decision = decisions[item.id] ?? 'pending';
          const auto = scan.status[item.id];
          return (
            <div key={item.id}>
              {showHeader && sec && (
                <div className="px-3 py-1 bg-slate-50 text-[10px] font-semibold text-secondary uppercase tracking-wide border-b border-border">
                  {tr ? sec.tr : sec.en}
                </div>
              )}
              <div className="px-3 py-2 border-b border-border/60 flex gap-2">
                <button
                  onClick={() => cycleDecision(item.id)}
                  title={tr ? 'Durumu değiştir' : 'Cycle status'}
                  className={`shrink-0 h-fit text-[9px] px-1.5 py-0.5 rounded border font-semibold ${decisionStyle[decision]}`}
                >
                  {decisionLabel(decision)}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-primary leading-snug">
                    <span className="font-semibold text-secondary mr-1">{item.id}.</span>
                    {tr ? item.tr : item.en}
                    {auto === 'likely' && decision === 'pending' && (
                      <span
                        className="ml-1 text-[9px] text-teal"
                        title={tr ? 'Metinde ilgili ifade bulundu' : 'Related wording found in the text'}
                      >
                        ● {tr ? 'metinde var?' : 'in text?'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={locations[item.id] ?? ''}
                    onChange={(e) => setLocation(item.id, e.target.value)}
                    placeholder={tr ? 'Sayfa / bölüm' : 'Page / section'}
                    className="mt-1 w-full text-[10px] px-1.5 py-0.5 border border-border rounded"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5">
        <button onClick={copyText} className="text-[10px] px-2 py-1 border border-border rounded hover:bg-slate-50 hover:text-teal">
          {tr ? 'Metni kopyala' : 'Copy text'}
        </button>
        <button onClick={downloadText} className="text-[10px] px-2 py-1 border border-border rounded hover:bg-slate-50 hover:text-teal">
          {tr ? '.txt indir' : 'Download .txt'}
        </button>
        {onInsertText && (
          <button onClick={insertText} className="text-[10px] px-2 py-1 bg-teal text-white rounded hover:bg-teal-dark font-semibold">
            {tr ? 'Metne ekle' : 'Insert into text'}
          </button>
        )}
      </div>
    </div>
  );
}
