'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  groupAcademicIssues,
  type AcademicReviewCategory,
  type AcademicReviewIssue,
} from '@/lib/ai/academic-review';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  issues: AcademicReviewIssue[];
  summary?: string;
  loading?: boolean;
  error?: string | null;
  progress?: { completed: number; total: number };
  onClose: () => void;
  onJumpTo?: (issue: AcademicReviewIssue) => void;
  onApply?: (issue: AcademicReviewIssue) => void;
  onDismiss?: (issue: AcademicReviewIssue) => void;
  onClear?: () => void;
};

const LABELS: Record<AcademicReviewCategory, { tr: string; en: string; description: { tr: string; en: string } }> = {
  mechanics: {
    tr: 'Yazım mekaniği ve stil',
    en: 'Mechanics and style',
    description: { tr: 'Noktalama, büyük harf, boşluk, yazım ve tireleme', en: 'Punctuation, capitalization, spacing, spelling, and hyphenation' },
  },
  grammar: {
    tr: 'Dilbilgisi',
    en: 'Grammar',
    description: { tr: 'Uyum, zaman, artikel, edat ve sözdizimi', en: 'Agreement, tense, articles, prepositions, and syntax' },
  },
  'academic-tone': {
    tr: 'Akademik ton',
    en: 'Academic tone',
    description: { tr: 'Resmiyet, nesnellik ve bilimsel ihtiyat', en: 'Formality, objectivity, and scientific caution' },
  },
  'word-choice': {
    tr: 'Kelime seçimi',
    en: 'Word choice',
    description: { tr: 'Daha kesin ve alana uygun sözcük kullanımı', en: 'More precise and discipline-appropriate vocabulary' },
  },
  readability: {
    tr: 'Okunabilirlik',
    en: 'Readability',
    description: { tr: 'Cümle yoğunluğu, belirsizlik ve geçişler', en: 'Sentence density, ambiguity, and transitions' },
  },
  phrasing: {
    tr: 'Akıcılık ve ifade',
    en: 'Fluency and phrasing',
    description: { tr: 'Tekrar, hantallık, özlülük ve doğal ifade', en: 'Redundancy, awkwardness, concision, and fluency' },
  },
  structure: {
    tr: 'Yapı',
    en: 'Structure',
    description: { tr: 'Paragraf amacı, mantıksal sıra ve bölüm organizasyonu', en: 'Paragraph purpose, logical order, and section organization' },
  },
  evidence: {
    tr: 'Kanıt ve iddialar',
    en: 'Evidence and claims',
    description: { tr: 'Aşırı yorum, destek ve niteleme eksikleri', en: 'Overstatement, support, and missing qualification' },
  },
  statistics: {
    tr: 'İstatistik raporlama',
    en: 'Statistical reporting',
    description: { tr: 'Tıbbi istatistiklerin eksik veya tutarsız sunumu', en: 'Incomplete or inconsistent medical statistical reporting' },
  },
  consistency: {
    tr: 'Tutarlılık',
    en: 'Consistency',
    description: { tr: 'Terimler, kısaltmalar, zaman ve İngilizce varyantı', en: 'Terminology, abbreviations, tense, and English variant' },
  },
};

const SEVERITY_STYLE = {
  high: 'bg-red-bg text-red border-red',
  med: 'bg-amber-50 text-amber-700 border-amber-300',
  low: 'bg-slate-100 text-secondary border-border',
};

export function IssuesPanel({
  issues,
  summary,
  loading,
  error,
  progress,
  onClose,
  onJumpTo,
  onApply,
  onDismiss,
  onClear,
}: Props): JSX.Element {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const groups = useMemo(() => groupAcademicIssues(issues), [issues]);
  const openCount = issues.filter((issue) => issue.status === 'open').length;
  const passed = groups.filter((group) => group.passed);
  const [expanded, setExpanded] = useState<Set<AcademicReviewCategory>>(
    () => new Set(groups.filter((group) => !group.passed).map((group) => group.category)),
  );
  const [passedOpen, setPassedOpen] = useState(false);

  useEffect(() => {
    const categories = groups
      .filter((group) => !group.passed)
      .map((group) => group.category);
    if (categories.length === 0) return;
    setExpanded((current) => new Set([...current, ...categories]));
  }, [groups]);

  const toggle = (category: AcademicReviewCategory): void => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="card flex flex-col h-full bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="font-semibold text-primary text-sm">
            {tr ? 'Akademik İnceleme' : 'Academic Review'}
          </h3>
          <p className="text-xs text-muted">
            {loading && progress
              ? `${tr ? 'İnceleniyor' : 'Reviewing'} ${progress.completed}/${progress.total}`
              : `${openCount} ${tr ? 'açık öneri' : 'open suggestions'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onClear && issues.length > 0 && (
            <button onClick={onClear} className="text-[10px] text-muted hover:text-red">
              {tr ? 'Temizle' : 'Clear'}
            </button>
          )}
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">×</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
        {loading && (
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-teal transition-all"
              style={{
                width: progress && progress.total > 0
                  ? `${Math.round((progress.completed / progress.total) * 100)}%`
                  : '8%',
              }}
            />
          </div>
        )}
        {error && <p className="text-red text-xs">{error}</p>}
        {summary && (
          <div className="bg-teal-bg border border-teal/30 rounded-lg px-3 py-2 text-xs text-secondary leading-relaxed">
            <div className="font-semibold text-primary mb-0.5">{tr ? 'Genel değerlendirme' : 'Overall assessment'}</div>
            {summary}
          </div>
        )}

        {groups.filter((group) => !group.passed).map((group) => {
          const label = LABELS[group.category];
          const isOpen = expanded.has(group.category);
          return (
            <section key={group.category} className="border border-blue-400 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(group.category)}
                className="w-full text-left px-3 py-2.5 flex gap-2 items-start bg-blue-50/40 hover:bg-blue-50"
              >
                <span className="text-base leading-5">{isOpen ? '⌄' : '›'}</span>
                <span className="flex-1">
                  <span className="block font-semibold text-primary">
                    {group.issues.length} {tr ? label.tr : label.en}
                  </span>
                  <span className="block text-[11px] text-secondary mt-0.5">
                    {tr ? label.description.tr : label.description.en}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-blue-200 divide-y divide-border/70">
                  {group.issues.map((issue) => (
                    <div key={issue.id} className="p-3 text-xs">
                      <button className="block w-full text-left" onClick={() => onJumpTo?.(issue)}>
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-semibold ${SEVERITY_STYLE[issue.severity]}`}>
                          {issue.severity === 'high'
                            ? tr ? 'Yüksek' : 'High'
                            : issue.severity === 'med'
                              ? tr ? 'Orta' : 'Medium'
                              : tr ? 'Düşük' : 'Low'}
                        </span>
                        <p className="text-muted italic my-1.5 leading-snug">&ldquo;{issue.quote}&rdquo;</p>
                        <p className="text-primary leading-snug">{issue.explanation}</p>
                      </button>
                      {issue.replacement && (
                        <div className="mt-2 rounded-md bg-teal-bg/50 border border-teal/20 p-2 text-teal leading-snug">
                          {issue.replacement}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => onDismiss?.(issue)} className="px-2 py-1 text-muted hover:text-red">
                          {tr ? 'Reddet' : 'Dismiss'}
                        </button>
                        {issue.replacement && issue.from != null && issue.to != null && (
                          <button onClick={() => onApply?.(issue)} className="btn-primary px-2.5 py-1 text-[11px]">
                            {tr ? 'Uygula' : 'Apply'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {!loading && passed.length > 0 && (
          <section className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setPassedOpen((value) => !value)}
              className="w-full text-left px-3 py-2.5 flex gap-2 items-center bg-slate-50"
            >
              <span className="text-base">{passedOpen ? '⌄' : '›'}</span>
              <span className="font-medium text-primary">
                {passed.length} {tr ? 'kontrol geçti' : 'checks passed'}
              </span>
            </button>
            {passedOpen && (
              <div className="border-t border-border px-3 py-2 space-y-1">
                {passed.map((group) => (
                  <div key={group.category} className="text-xs text-secondary">
                    {tr ? LABELS[group.category].tr : LABELS[group.category].en}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
