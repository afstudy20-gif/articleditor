'use client';

import type { ReviewIssueT } from '@/lib/ai/schemas';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  issues: ReviewIssueT[];
  summary?: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onJumpTo?: (issue: ReviewIssueT) => void;
};

const CATEGORY_KEY: Record<string, string> = {
  clarity: 'ai_issues_clarity',
  tone: 'ai_issues_tone',
  structure: 'ai_issues_structure',
  evidence: 'ai_issues_evidence',
  grammar: 'ai_issues_grammar',
};

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-bg text-red border-red',
  med: 'bg-amber-50 text-amber-700 border-amber-300',
  low: 'bg-slate-100 text-secondary border-border',
};

const SEVERITY_KEY: Record<string, string> = {
  high: 'ai_severity_high',
  med: 'ai_severity_med',
  low: 'ai_severity_low',
};

export function IssuesPanel({ issues, summary, loading, error, onClose, onJumpTo }: Props): JSX.Element {
  const { t } = useLang();
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="font-semibold text-primary text-sm">🔍 {t('ai_issues_title')}</h3>
          {!loading && !error && (
            <p className="text-xs text-muted">
              {t('ai_issues_count').replace('{count}', String(issues.length))} {summary ? '·' : ''}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {loading && <p className="text-muted text-xs italic">{t('ai_issues_loading')}</p>}
        {error && <p className="text-red text-xs">{error}</p>}
        {!loading && !error && summary && (
          <div className="bg-teal-bg border border-teal/30 rounded-lg px-3 py-2 text-xs text-secondary leading-relaxed">
            <span className="tool-label">{t('ai_issues_overall')}</span>
            <p className="mt-0.5">{summary}</p>
          </div>
        )}
        {!loading && !error && issues.length === 0 && (
          <p className="text-muted text-xs italic">{t('ai_issues_empty')}</p>
        )}
        {issues.map((issue, i) => (
          <div
            key={i}
            className="border border-border rounded-lg p-2 text-xs hover:border-teal hover:bg-teal-bg/30 cursor-pointer transition"
            onClick={() => onJumpTo?.(issue)}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.low
                }`}
              >
                {SEVERITY_KEY[issue.severity] ? t(SEVERITY_KEY[issue.severity] as Parameters<typeof t>[0]) : issue.severity}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-secondary">
                {CATEGORY_KEY[issue.category] ? t(CATEGORY_KEY[issue.category] as Parameters<typeof t>[0]) : issue.category}
              </span>
            </div>
            {issue.quote && (
              <p className="text-muted italic mb-1 leading-snug">&ldquo;{issue.quote}&rdquo;</p>
            )}
            <p className="text-primary leading-snug">{issue.comment}</p>
            {issue.suggestion && (
              <div className="mt-1.5 pt-1.5 border-t border-border">
                <span className="tool-label">{t('ai_issues_suggestion')}</span>
                <p className="text-teal mt-0.5 leading-snug">{issue.suggestion}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
