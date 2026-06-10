'use client';

import { useEffect, useMemo, useState } from 'react';
import { JOURNAL_TEMPLATES, DEFAULT_REQUIRED_STATEMENTS } from '@/lib/journals/templates';
import type { ComplianceSeverity, CitationStyleId, AbstractStructure, JournalTemplate, JournalSection } from '@/lib/journals/types';
import { checkCompliance } from '@/lib/compliance/checker';
import { extractDocStructure } from '@/lib/editor/doc-structure';
import { STYLE_LABELS, type CitationStyle } from '@/lib/refs/styles';
import type { WritingStats } from '@/lib/stats/types';

interface JournalCheckPanelProps {
  docJson: unknown;
  stats: WritingStats;
  referenceStyle: string;
  bibliographyReferenceCount: number;
  onReferenceStyleChange?: (style: CitationStyleId) => void;
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
  bibliographyReferenceCount,
  onReferenceStyleChange,
  onClose,
  t,
}: JournalCheckPanelProps): JSX.Element {
  const [customTemplates, setCustomTemplates] = useState<JournalTemplate[]>([]);
  const [view, setView] = useState<'LIST' | 'FORM'>('LIST');
  const [editingTemplate, setEditingTemplate] = useState<JournalTemplate | null>(null);
  const [referenceRulesOpen, setReferenceRulesOpen] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formRefStyle, setFormRefStyle] = useState<CitationStyleId>('vancouver');
  const [formAbsStructure, setFormAbsStructure] = useState<AbstractStructure>('structured');
  const [formTotalWordLimit, setFormTotalWordLimit] = useState('');
  const [formAbsWordLimit, setFormAbsWordLimit] = useState('');
  const [formSections, setFormSections] = useState('');
  const [formStatements, setFormStatements] = useState<string[]>([]);

  // Load custom templates on mount
  useEffect(() => {
    const stored = localStorage.getItem('endnotere-custom-journals');
    if (stored) {
      try {
        setCustomTemplates(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse custom templates', e);
      }
    }
  }, []);

  const allTemplates = useMemo(() => {
    return [...JOURNAL_TEMPLATES, ...customTemplates];
  }, [customTemplates]);

  const [templateId, setTemplateId] = useState(JOURNAL_TEMPLATES[0]?.id ?? '');

  useEffect(() => {
    setReferenceRulesOpen(false);
  }, [templateId]);

  const template = useMemo(() => {
    return allTemplates.find((t) => t.id === templateId) || allTemplates[0];
  }, [allTemplates, templateId]);

  const report = useMemo(() => {
    if (!template) return null;
    const { headings, plainText, abstractText } = extractDocStructure(docJson);
    return checkCompliance({
      template,
      stats,
      plainText,
      sectionHeadings: headings,
      referenceStyle,
      bibliographyReferenceCount,
      abstractText,
    });
  }, [template, docJson, stats, referenceStyle, bibliographyReferenceCount]);

  const handleAddClick = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormRefStyle('vancouver');
    setFormAbsStructure('structured');
    setFormTotalWordLimit('');
    setFormAbsWordLimit('');
    setFormSections('Abstract, Introduction, Methods, Results, Discussion, References');
    setFormStatements(['funding', 'conflict-of-interest']);
    setView('FORM');
  };

  const handleEditClick = (tpl: JournalTemplate) => {
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormRefStyle(tpl.referenceStyle);
    setFormAbsStructure(tpl.abstractStructure);
    setFormTotalWordLimit(tpl.totalWordLimit ? String(tpl.totalWordLimit) : '');
    setFormAbsWordLimit(tpl.abstractWordLimit ? String(tpl.abstractWordLimit) : '');
    setFormSections(tpl.sections.map((s) => s.heading).join(', '));
    setFormStatements(tpl.requiredStatements.map((s) => s.id));
    setView('FORM');
  };

  const handleDeleteClick = (id: string) => {
    if (confirm(t('jc_delete_confirm'))) {
      const updated = customTemplates.filter((t) => t.id !== id);
      setCustomTemplates(updated);
      localStorage.setItem('endnotere-custom-journals', JSON.stringify(updated));
      setTemplateId(JOURNAL_TEMPLATES[0]?.id ?? '');
    }
  };

  const handleSave = () => {
    if (!formName.trim()) return;

    const sections: JournalSection[] = formSections
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((heading) => ({
        heading,
        level: 2,
        required: true,
      }));

    const requiredStatements = DEFAULT_REQUIRED_STATEMENTS.filter((s) =>
      formStatements.includes(s.id),
    );

    const newTpl: JournalTemplate = {
      id: editingTemplate?.id ?? `custom-${Date.now()}`,
      name: formName.trim(),
      referenceStyle: formRefStyle,
      abstractStructure: formAbsStructure,
      totalWordLimit: formTotalWordLimit ? parseInt(formTotalWordLimit, 10) : undefined,
      abstractWordLimit: formAbsWordLimit ? parseInt(formAbsWordLimit, 10) : undefined,
      sections,
      requiredStatements,
      publisher: 'User Custom',
      rulesUpdatedAt: new Date().toISOString().split('T')[0],
    };

    let updated: JournalTemplate[];
    if (editingTemplate) {
      updated = customTemplates.map((t) => (t.id === editingTemplate.id ? newTpl : t));
    } else {
      updated = [...customTemplates, newTpl];
    }

    setCustomTemplates(updated);
    localStorage.setItem('endnotere-custom-journals', JSON.stringify(updated));
    setTemplateId(newTpl.id);
    setView('FORM'); // Let's switch back to list view
    setView('LIST');
  };

  if (view === 'FORM') {
    return (
      <div className="card flex flex-col h-full min-h-0 overflow-hidden bg-white">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary text-sm">
            📋 {editingTemplate ? t('jc_edit') : t('jc_add')}
          </h3>
          <button onClick={() => setView('LIST')} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto journal-panel-scroll p-3 space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
              {t('jc_form_name')}
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal"
              placeholder="e.g. Journal of Clinical Medicine"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                {t('jc_form_ref_style')}
              </label>
              <select
                value={formRefStyle}
                onChange={(e) => setFormRefStyle(e.target.value as CitationStyleId)}
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal"
              >
                {(Object.entries(STYLE_LABELS) as Array<[CitationStyle, string]>).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                {t('jc_form_abs_structure')}
              </label>
              <select
                value={formAbsStructure}
                onChange={(e) => setFormAbsStructure(e.target.value as AbstractStructure)}
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal"
              >
                <option value="structured">{t('jc_structured')}</option>
                <option value="unstructured">{t('jc_unstructured')}</option>
                <option value="any">{t('jc_any')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                {t('jc_form_total_words')}
              </label>
              <input
                type="number"
                value={formTotalWordLimit}
                onChange={(e) => setFormTotalWordLimit(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal"
                placeholder="e.g. 3500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                {t('jc_form_abs_words')}
              </label>
              <input
                type="number"
                value={formAbsWordLimit}
                onChange={(e) => setFormAbsWordLimit(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal"
                placeholder="e.g. 250"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
              {t('jc_form_sections')}
            </label>
            <textarea
              value={formSections}
              onChange={(e) => setFormSections(e.target.value)}
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal"
              placeholder="Abstract, Introduction, Methods, Results, Discussion, References"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
              {t('jc_form_statements')}
            </label>
            <div className="mt-1 border border-border rounded p-2 bg-surface max-h-[120px] overflow-auto space-y-1">
              {DEFAULT_REQUIRED_STATEMENTS.map((stmt) => (
                <label key={stmt.id} className="flex items-center gap-2 text-xs text-primary cursor-pointer hover:bg-slate-50 py-0.5 px-1 rounded">
                  <input
                    type="checkbox"
                    checked={formStatements.includes(stmt.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormStatements([...formStatements, stmt.id]);
                      } else {
                        setFormStatements(formStatements.filter((id) => id !== stmt.id));
                      }
                    }}
                    className="rounded border-border text-teal focus:ring-teal"
                  />
                  <span>{stmt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-3 py-2 border-t border-border flex items-center gap-2 bg-slate-50">
          <button
            onClick={() => setView('LIST')}
            className="flex-1 px-3 py-1.5 rounded border border-border text-secondary hover:bg-slate-100 font-semibold text-xs transition"
          >
            {t('jc_cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!formName.trim()}
            className="flex-1 px-3 py-1.5 rounded bg-teal text-white hover:bg-teal-dark font-semibold text-xs transition disabled:opacity-50"
          >
            {t('jc_save')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col h-full min-h-0 overflow-hidden bg-white">
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">📋 {t('jc_title')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-1.5">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-surface text-primary outline-none focus:border-teal min-w-0"
        >
          {allTemplates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddClick}
          title={t('jc_add')}
          className="p-1.5 border border-border rounded bg-surface text-secondary hover:text-primary hover:bg-slate-50 text-xs shrink-0 transition"
        >
          ➕
        </button>
        {template && template.id.startsWith('custom-') && (
          <>
            <button
              onClick={() => handleEditClick(template)}
              title={t('jc_edit')}
              className="p-1.5 border border-border rounded bg-surface text-secondary hover:text-primary hover:bg-slate-50 text-xs shrink-0 transition"
            >
              ✏️
            </button>
            <button
              onClick={() => handleDeleteClick(template.id)}
              title={t('jc_delete')}
              className="p-1.5 border border-border rounded bg-surface text-red hover:bg-red-50 text-xs shrink-0 transition"
            >
              🗑️
            </button>
          </>
        )}
      </div>

      {report && (
        <div className="shrink-0 px-3 py-2 border-b border-border">
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

      <div className="flex-1 min-h-0 overflow-y-scroll overscroll-contain journal-panel-scroll">
        {template && (template.publisherReferenceStyles?.length || template.referenceRules?.length) ? (
          <div className="px-3 py-2 border-b border-border bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                  {t('jc_reference_profile')}
                </div>
                <div className="text-xs font-semibold text-primary">
                  {STYLE_LABELS[template.referenceStyle]}
                  {template.referenceStylePolicy === 'preferred'
                    ? ` (${t('jc_preferred_style')})`
                    : ''}
                </div>
              </div>
              {referenceStyle !== template.referenceStyle && onReferenceStyleChange && (
                <button
                  onClick={() => onReferenceStyleChange(template.referenceStyle)}
                  className="shrink-0 rounded border border-teal px-2 py-1 text-[10px] font-semibold text-teal hover:bg-teal-bg"
                >
                  {t('jc_apply_ref_style')}
                </button>
              )}
            </div>

            {template.publisherReferenceStyles && template.publisherReferenceStyles.length > 1 && (
              <div className="text-[10px] text-secondary">
                <span className="font-semibold">{t('jc_publisher_styles')}:</span>{' '}
                {template.publisherReferenceStyles.map((id) => STYLE_LABELS[id]).join(', ')}
              </div>
            )}

            {template.referenceRules && template.referenceRules.length > 0 && (
              <button
                type="button"
                aria-expanded={referenceRulesOpen}
                onClick={() => setReferenceRulesOpen((open) => !open)}
                className="w-full flex items-center justify-between rounded border border-border bg-white px-2 py-1.5 text-left text-[10px] font-semibold text-secondary hover:border-teal hover:text-primary"
              >
                <span>
                  {template.referenceRules.length} {t('jc_reference_rules')}
                </span>
                <span aria-hidden="true">{referenceRulesOpen ? '▴' : '▾'}</span>
              </button>
            )}

            {referenceRulesOpen && (
              <>
                {template.referenceRules && template.referenceRules.length > 0 && (
                  <ul className="space-y-1 text-[10px] leading-snug text-secondary">
                    {template.referenceRules.map((rule) => (
                      <li key={rule} className="flex gap-1.5">
                        <span className="text-teal">•</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {template.referenceGuideUrl && (
                  <a
                    href={template.referenceGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[10px] text-teal hover:underline"
                  >
                    {t('jc_reference_guide')} ↗
                  </a>
                )}
              </>
            )}
          </div>
        ) : null}

        <div className="p-2 space-y-1.5">
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
      </div>

      {template && (
        <div className="shrink-0 px-3 py-2 border-t border-border bg-white text-[10px] text-muted leading-snug">
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
            <div>{template.publisher === 'User Custom' ? 'Custom user template.' : t('jc_generic_template')}</div>
          )}
        </div>
      )}
    </div>
  );
}
