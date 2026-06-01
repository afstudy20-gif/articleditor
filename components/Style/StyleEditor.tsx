'use client';

import { Fragment, useMemo, useState } from 'react';
import type { Ref } from '@/store/types';
import { newId } from '@/lib/id';
import { aiHeaders } from '@/lib/ai/user-keys';
import {
  type StyleSpec,
  presetSpec,
  formatInTextSpec,
  formatBibEntrySpec,
  saveCustomStyle,
  deleteCustomStyle,
  getCustomStyle,
} from '@/lib/refs/style-spec';

interface StyleEditorProps {
  editId: string | null;
  lang: 'tr' | 'en';
  aiEnabled: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  t: (k: string) => string;
}

// Two sample refs so the preview shows both a short author list and et al.
const SAMPLE_REFS: Ref[] = [
  {
    id: 's1',
    type: 'journal-article',
    authors: [
      { family: 'Smith', given: 'John A' },
      { family: 'Doe', given: 'Roberta B' },
    ],
    title: 'Effects of sleep on memory consolidation',
    containerTitle: 'Nature',
    year: 2019,
    volume: '15',
    issue: '3',
    pages: '123-130',
    doi: '10.1234/abc.def',
  },
  {
    id: 's2',
    type: 'journal-article',
    authors: [
      { family: 'Lee', given: 'Chang D' },
      { family: 'Park', given: 'Eun' },
      { family: 'Brown', given: 'Kevin' },
      { family: 'White', given: 'Laura' },
      { family: 'Green', given: 'Mark' },
      { family: 'Black', given: 'Nina' },
      { family: 'Gray', given: 'Omar' },
    ],
    title: 'Neural correlates of attention',
    containerTitle: 'Science',
    year: 2021,
    volume: '5',
    issue: '1',
    pages: '10-20',
    doi: '10.5/xyz',
  },
];

// Render the lightweight *italic* / "quoted" markup the spec emits.
function renderMarkup(s: string): JSX.Element[] {
  const parts = s.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) =>
    p.startsWith('*') && p.endsWith('*') ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function freshSpec(): StyleSpec {
  return { ...presetSpec('vancouver'), id: newId('custom'), name: '' };
}

export function StyleEditor({ editId, lang, aiEnabled, onClose, onSaved, t }: StyleEditorProps): JSX.Element {
  const [spec, setSpec] = useState<StyleSpec>(() => {
    if (editId) {
      const existing = getCustomStyle(editId);
      if (existing) return { ...existing };
    }
    return freshSpec();
  });
  const [aiText, setAiText] = useState('');
  const [aiMode, setAiMode] = useState<'rules' | 'example'>('example');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const set = <K extends keyof StyleSpec>(key: K, value: StyleSpec[K]): void =>
    setSpec((s) => ({ ...s, [key]: value }));
  const setAuthors = (patch: Partial<StyleSpec['authors']>): void =>
    setSpec((s) => ({ ...s, authors: { ...s.authors, ...patch } }));
  const setInText = (patch: Partial<StyleSpec['inText']>): void =>
    setSpec((s) => ({ ...s, inText: { ...s.inText, ...patch } }));

  const applyPreset = (base: 'vancouver' | 'apa' | 'ieee'): void =>
    setSpec((s) => ({ ...presetSpec(base), id: s.id, name: s.name }));

  const preview = useMemo(() => {
    const inText = formatInTextSpec(spec, SAMPLE_REFS, [1, 2]);
    const e1 = formatBibEntrySpec(spec, SAMPLE_REFS[0], 1);
    const e2 = formatBibEntrySpec(spec, SAMPLE_REFS[1], 2);
    return { inText, e1, e2 };
  }, [spec]);

  const runAI = async (): Promise<void> => {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiHeaders() },
        body: JSON.stringify({ mode: aiMode, text: aiText, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data?.error ?? 'AI error');
        return;
      }
      // Merge AI-suggested partial spec onto current, keeping id/name.
      setSpec((s) => mergeSpec(s, data));
    } catch {
      setAiError(t('style_ai_error'));
    } finally {
      setAiBusy(false);
    }
  };

  const save = (): void => {
    const name = spec.name.trim() || t('style_untitled');
    saveCustomStyle({ ...spec, name });
    onSaved(spec.id);
  };

  const remove = (): void => {
    if (!editId) return;
    if (!confirm(t('style_delete_confirm'))) return;
    deleteCustomStyle(editId);
    onSaved('vancouver');
  };

  const inputCls = 'w-full text-xs border border-border rounded px-2 py-1 bg-surface text-primary';
  const numeric = spec.mode === 'numeric';

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-primary">🎚 {t('style_title')}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4 overflow-auto flex-1">
          {/* LEFT: knobs */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="tool-label">{t('style_name')}</label>
              <input className={inputCls} value={spec.name} onChange={(e) => set('name', e.target.value)} placeholder="My Journal Style" />
            </div>

            <div className="flex gap-2 items-center">
              <span className="tool-label">{t('style_preset')}:</span>
              {(['vancouver', 'apa', 'ieee'] as const).map((p) => (
                <button key={p} onClick={() => applyPreset(p)} className="px-2 py-0.5 rounded border border-border hover:border-teal hover:text-teal capitalize">
                  {p}
                </button>
              ))}
            </div>

            <Row label={t('style_mode')}>
              <Seg value={spec.mode} onChange={(v) => set('mode', v as StyleSpec['mode'])} options={[['numeric', t('style_numeric')], ['author-year', t('style_author_year')]]} />
            </Row>

            {numeric ? (
              <Row label={t('style_bracket')}>
                <select className={inputCls} value={spec.inText.bracket} onChange={(e) => setInText({ bracket: e.target.value as StyleSpec['inText']['bracket'] })}>
                  <option value="square">[1]</option>
                  <option value="paren">(1)</option>
                  <option value="curly">{'{1}'}</option>
                  <option value="superscript">¹ (superscript)</option>
                </select>
              </Row>
            ) : (
              <Row label={t('style_intext_etal')}>
                <input type="number" min={1} max={10} className={inputCls} value={spec.inText.etAlAfter} onChange={(e) => setInText({ etAlAfter: Number(e.target.value) || 1 })} />
              </Row>
            )}

            <div className="pt-1 border-t border-border" />
            <div className="tool-label">{t('style_authors')}</div>

            <Row label={t('style_max_authors')}>
              <input type="number" min={1} max={50} className={inputCls} value={spec.authors.maxBeforeEtAl} onChange={(e) => setAuthors({ maxBeforeEtAl: Number(e.target.value) || 1, showCount: Number(e.target.value) || 1 })} />
            </Row>
            <Row label={t('style_etal_text')}>
              <input className={inputCls} value={spec.authors.etAlText} onChange={(e) => setAuthors({ etAlText: e.target.value })} />
            </Row>
            <Row label={t('style_name_order')}>
              <select className={inputCls} value={spec.authors.nameOrder} onChange={(e) => setAuthors({ nameOrder: e.target.value as StyleSpec['authors']['nameOrder'] })}>
                <option value="family-initials">Smith JA</option>
                <option value="family-comma-initials">Smith, J. A.</option>
                <option value="initials-family">J. A. Smith</option>
              </select>
            </Row>
            <div className="flex gap-3">
              <Check label={t('style_periods')} checked={spec.authors.initialPeriods} onChange={(v) => setAuthors({ initialPeriods: v })} />
              <Check label={t('style_spaces')} checked={spec.authors.initialSpaces} onChange={(v) => setAuthors({ initialSpaces: v })} />
              <Check label={t('style_amp')} checked={spec.authors.useAndBeforeLast} onChange={(v) => setAuthors({ useAndBeforeLast: v })} />
            </div>
            {spec.authors.useAndBeforeLast && (
              <Row label={t('style_and_text')}>
                <input className={inputCls} value={spec.authors.andText} onChange={(e) => setAuthors({ andText: e.target.value })} />
              </Row>
            )}

            <div className="pt-1 border-t border-border" />
            <div className="tool-label">{t('style_layout')}</div>
            <Row label={t('style_title_emphasis')}>
              <EmphasisSelect cls={inputCls} value={spec.title.emphasis} onChange={(v) => set('title', { ...spec.title, emphasis: v })} t={t} />
            </Row>
            <Row label={t('style_journal_emphasis')}>
              <EmphasisSelect cls={inputCls} value={spec.journal.emphasis} onChange={(v) => set('journal', { ...spec.journal, emphasis: v })} t={t} />
            </Row>
            <Row label={t('style_locator')}>
              <select className={inputCls} value={spec.locator} onChange={(e) => set('locator', e.target.value as StyleSpec['locator'])}>
                <option value="vancouver">2019;15(3):123-130</option>
                <option value="apa">15(3), 123-130</option>
                <option value="ieee">vol. 15, no. 3, pp. 123-130</option>
              </select>
            </Row>
            <Row label={t('style_bib_number')}>
              <select className={inputCls} value={spec.bib.number} onChange={(e) => set('bib', { ...spec.bib, number: e.target.value as StyleSpec['bib']['number'] })}>
                <option value="dot">1.</option>
                <option value="bracket">[1]</option>
                <option value="none">{t('style_none')}</option>
              </select>
            </Row>
            <Row label={t('style_order')}>
              <Seg value={spec.bib.order} onChange={(v) => set('bib', { ...spec.bib, order: v as StyleSpec['bib']['order'] })} options={[['citation', t('style_order_cite')], ['alphabetical', t('style_order_alpha')]]} />
            </Row>
            <div className="flex gap-3">
              <Check label={t('style_doi')} checked={spec.doi.include} onChange={(v) => set('doi', { ...spec.doi, include: v })} />
              {spec.doi.include && (
                <input className={`${inputCls} flex-1`} value={spec.doi.prefix} onChange={(e) => set('doi', { ...spec.doi, prefix: e.target.value })} placeholder="doi: / https://doi.org/" />
              )}
            </div>
          </div>

          {/* RIGHT: preview + AI */}
          <div className="space-y-3">
            <div className="border border-border rounded-lg p-3 bg-slate-50">
              <div className="tool-label mb-1">{t('style_preview')}</div>
              <p className="text-xs text-secondary mb-2">
                {t('style_intext')}: <span className="font-semibold text-primary">{preview.inText || '—'}</span>
              </p>
              <div className="text-xs text-secondary leading-relaxed space-y-1.5 font-serif">
                <p>{renderMarkup(preview.e1)}</p>
                <p>{renderMarkup(preview.e2)}</p>
              </div>
            </div>

            <div className="border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="tool-label">✨ {t('style_ai')}</span>
                <Seg value={aiMode} onChange={(v) => setAiMode(v as 'rules' | 'example')} options={[['example', t('style_ai_example')], ['rules', t('style_ai_rules')]]} />
              </div>
              <textarea
                className={`${inputCls} h-28 resize-none`}
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder={aiMode === 'example' ? t('style_ai_example_ph') : t('style_ai_rules_ph')}
              />
              {aiError && <p className="text-xs text-red mt-1">{aiError}</p>}
              <button
                onClick={runAI}
                disabled={!aiText.trim() || aiBusy || !aiEnabled}
                title={aiEnabled ? '' : t('style_ai_disabled')}
                className="mt-2 w-full text-xs px-3 py-1.5 rounded bg-violet-500 text-white font-semibold hover:bg-violet-600 disabled:opacity-40"
              >
                {aiBusy ? t('style_ai_busy') : `✨ ${t('style_ai_apply')}`}
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-between items-center">
          {editId ? (
            <button onClick={remove} className="text-xs text-red hover:underline">
              {t('style_delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-muted hover:text-primary text-sm px-3 py-1.5">
              {t('style_cancel')}
            </button>
            <button onClick={save} className="btn-primary text-sm px-4 py-1.5">
              ✓ {t('style_save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- AI merge: validate & clamp a partial spec from the model onto a base. ---
function mergeSpec(base: StyleSpec, incoming: unknown): StyleSpec {
  if (!incoming || typeof incoming !== 'object') return base;
  const i = incoming as Record<string, unknown>;
  const out: StyleSpec = JSON.parse(JSON.stringify(base));
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  if (i.mode === 'numeric' || i.mode === 'author-year') out.mode = i.mode;
  Object.assign(out.inText, pick(obj(i.inText), ['bracket', 'authorYearOpen', 'authorYearClose', 'authorYearSep', 'etAlAfter']));
  Object.assign(out.authors, pick(obj(i.authors), ['nameOrder', 'initialPeriods', 'initialSpaces', 'maxBeforeEtAl', 'showCount', 'etAlText', 'delimiter', 'useAndBeforeLast', 'andText']));
  Object.assign(out.title, pick(obj(i.title), ['emphasis', 'suffix']));
  Object.assign(out.journal, pick(obj(i.journal), ['emphasis', 'suffix']));
  if (typeof i.locator === 'string') out.locator = i.locator as StyleSpec['locator'];
  Object.assign(out.doi, pick(obj(i.doi), ['include', 'prefix']));
  Object.assign(out.bib, pick(obj(i.bib), ['number', 'order']));
  if (out.authors.showCount > out.authors.maxBeforeEtAl) out.authors.showCount = out.authors.maxBeforeEtAl;
  return out;
}

function pick(src: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined && src[k] !== null) o[k] = src[k];
  return o;
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <div className="w-40">{children}</div>
    </div>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }): JSX.Element {
  return (
    <div className="inline-flex rounded border border-border overflow-hidden">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`px-2 py-0.5 text-xs ${value === v ? 'bg-teal text-white' : 'text-secondary hover:bg-slate-50'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="flex items-center gap-1 text-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function EmphasisSelect({ cls, value, onChange, t }: { cls: string; value: StyleSpec['title']['emphasis']; onChange: (v: StyleSpec['title']['emphasis']) => void; t: (k: string) => string }): JSX.Element {
  return (
    <select className={cls} value={value} onChange={(e) => onChange(e.target.value as StyleSpec['title']['emphasis'])}>
      <option value="plain">{t('style_plain')}</option>
      <option value="italic">{t('style_italic')}</option>
      <option value="quoted">{t('style_quoted')}</option>
    </select>
  );
}
