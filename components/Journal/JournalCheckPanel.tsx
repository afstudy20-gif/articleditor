'use client';

import { useMemo, useState } from 'react';
import { JOURNAL_TEMPLATES, getJournalTemplate } from '@/lib/journals/templates';
import type { ComplianceSeverity, CitationStyleId } from '@/lib/journals/types';
import { checkCompliance } from '@/lib/compliance/checker';
import { extractDocStructure } from '@/lib/editor/doc-structure';
import type { WritingStats } from '@/lib/stats/types';

interface JournalCheckPanelProps {
  docJson: unknown;
  stats: WritingStats;
  referenceStyle: string;
  onClose: () => void;
  t: (k: string) => string;
}

const SEVERITY_STYLE: Record<ComplianceSeverity, string> = {
  error: 'bg-red-bg text-red border-red-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-slate-50 text-secondary border-border',
  ok: 'bg-green-50 text-green-700 border-green-200',
};

const SEVERITY_ICON: Record<ComplianceSeverity, string> = {
  error: '⛔',
  warn: '⚠️',
  info: 'ℹ️',
  ok: '✓',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red';
}

export function JournalCheckPanel({
  docJson,
  stats,
  referenceStyle,
  onClose,
  t,
}: JournalCheckPanelProps): JSX.Element {
  const [templateId, setTemplateId] = useState(JOURNAL_TEMPLATES[0]?.id ?? '');

  const template = getJournalTemplate(templateId) ?? JOURNAL_TEMPLATES[0];

  const report = useMemo(() => {
    if (!template) return null;
    const { headings, plainText, abstractText } = extractDocStructure(docJson);
    return checkCompliance({
      template,
      stats,
      plainText,
      sectionHeadings: headings,
      referenceStyle: referenceStyle as CitationStyleId,
      abstractText,
    });
  }, [template, docJson, stats, referenceStyle]);

  return (
    <div className="card flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">📋 {t('jc_title')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary"
        >
          {JOURNAL_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </div>

      {report && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {report.verifiedPassed}/{report.verifiedTotal} {t('jc_verified_passed')}
            </span>
            <span className={`text-2xl font-extrabold ${scoreColor(report.score)}`}>{report.score}</span>
          </div>
          {report.manualReview > 0 && (
            <div className="text-[10px] text-amber-700 mt-0.5">
              ⚠ {report.manualReview} {t('jc_manual_review')}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {report?.issues.map((issue, i) => (
          <div key={i} className={`rounded border px-2 py-1.5 text-xs ${SEVERITY_STYLE[issue.severity]}`}>
            <div className="font-semibold">
              {SEVERITY_ICON[issue.severity]} {issue.message}
              {issue.confidence === 'heuristic' && (
                <span className="ml-1 font-normal text-[10px] opacity-70">({t('jc_heuristic_tag')})</span>
              )}
            </div>
            {issue.detail && <div className="mt-0.5 opacity-80">{issue.detail}</div>}
          </div>
        ))}
      </div>

      {template && (
        <div className="px-3 py-2 border-t border-border text-[10px] text-muted leading-snug">
          {template.sourceUrl ? (
            <>
              <a
                href={template.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline"
              >
                {t('jc_source_link')} ↗
              </a>
              {template.rulesUpdatedAt && (
                <span className="ml-1">
                  · {t('jc_rules_date')}: {template.rulesUpdatedAt}
                </span>
              )}
              <div className="mt-0.5">{t('jc_outdated_warning')}</div>
            </>
          ) : (
            <div>{t('jc_generic_template')}</div>
          )}
        </div>
      )}
    </div>
  );
}
