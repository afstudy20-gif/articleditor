'use client';

import { useState } from 'react';
import type { WritingStats } from '@/lib/stats/types';

interface StatsPanelProps {
  stats: WritingStats;
  /** Target word count. 0 means no goal set. */
  goal: number;
  onSetGoal: (n: number) => void;
  t: (k: string) => string;
  onClose?: () => void;
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-border px-2.5 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-lg font-bold leading-tight text-primary">{value}</span>
    </div>
  );
}

function clampPercent(words: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((words / goal) * 100));
}

export function StatsPanel({
  stats,
  goal,
  onSetGoal,
  t,
  onClose,
}: StatsPanelProps): JSX.Element {
  const [goalInput, setGoalInput] = useState<string>(goal > 0 ? String(goal) : '');

  const percent = clampPercent(stats.words, goal);
  const hasGoal = goal > 0;

  const commitGoal = (raw: string): void => {
    const parsed = Number.parseInt(raw, 10);
    onSetGoal(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  };

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold text-primary">📈 {t('stats_title')}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-lg leading-none text-muted hover:text-primary"
            aria-label="×"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <Metric label={t('stats_words')} value={stats.words.toLocaleString()} />
          <Metric label={t('stats_chars')} value={stats.charactersNoSpaces.toLocaleString()} />
          <Metric label={t('stats_sentences')} value={stats.sentences.toLocaleString()} />
          <Metric label={t('stats_paragraphs')} value={stats.paragraphs.toLocaleString()} />
          <Metric
            label={t('stats_reading_time')}
            value={`${stats.readingTimeMin} ${t('stats_min_suffix')}`}
          />
          <Metric label={t('stats_citations')} value={stats.citations.toLocaleString()} />
          <Metric label={t('stats_density')} value={stats.citationDensity.toFixed(1)} />
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] uppercase tracking-wide text-muted">
              {t('stats_goal')}
            </label>
            <input
              type="number"
              min={0}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onBlur={() => commitGoal(goalInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitGoal(goalInput);
              }}
              placeholder="0"
              className="w-24 rounded border border-border bg-transparent px-2 py-1 text-right text-sm text-primary"
            />
          </div>

          {hasGoal ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-teal transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-xs text-secondary">
                {t('stats_goal_progress')
                  .replace('{words}', stats.words.toLocaleString())
                  .replace('{goal}', goal.toLocaleString())
                  .replace('{percent}', String(percent))}
              </p>
            </div>
          ) : (
            <p className="text-xs italic text-muted">{t('stats_goal_set')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
