'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GA_TARGETS, getTarget, isModeAllowed, maxPanelsForTarget, exportSize } from '@/lib/graphical-abstract/targets';
import type { GaMode } from '@/lib/graphical-abstract/targets';
import type { GaIssue, GaIssueCode } from '@/lib/graphical-abstract/rules';
import { gaImageFilename, gaSpecFilename, nextGaBaseName } from '@/lib/graphical-abstract/artifact';

interface Ungrounded {
  path: string;
  raw: string;
  context: string;
}

interface ArmWarning {
  path: string;
  label: string;
  raw: string;
  claimedArm: string;
  sourceArm: string;
  sentence: string;
}

interface GenerateResult {
  spec: unknown;
  issues: GaIssue[];
  ungrounded: Ungrounded[];
  armWarnings: ArmWarning[];
  repaired: boolean;
  blocking: boolean;
  disclosure: string;
  target: { id: string; publisher: string; presetId: string };
  mode: GaMode;
  manuscript: { included: string[]; truncated: boolean };
}

export interface GraphicalAbstractPanelProps {
  lang: 'tr' | 'en';
  manuscript: {
    title?: string;
    abstractText?: string;
    keywords?: string[];
    bodyText?: string;
    captions?: string[];
  };
  /** Asset names already in the project, so a regenerate never overwrites an earlier one. */
  existingAssetNames: readonly string[];
  onSaveArtifacts: (a: { base: string; pngDataUrl: string; specJson: string }) => Promise<void>;
  onInsertFigure: (dataUrl: string, caption: string) => Promise<void>;
  onDisclosure: (text: string) => void;
  onClose: () => void;
}

/** Issue wording lives here rather than in the rule engine, which stays language-free. */
const ISSUE_TEXT: Record<GaIssueCode, { tr: string; en: string }> = {
  panel_count_exceeded: {
    tr: '{count} panel var; bu hedefte en fazla {max} panel okunabilir kalıyor.',
    en: '{count} panels, but only {max} stay legible at this target size.',
  },
  too_many_key_results: {
    tr: '{count} sonuç gösteriliyor; küçük boyutta en fazla {max} sonuç okunur.',
    en: '{count} results shown; more than {max} stops being readable at thumbnail size.',
  },
  graphical_mode_has_data: {
    tr: 'Grafiksel özet sayı içeremez (Cell Press kuralı). Örnek: "{example}"',
    en: 'A graphical abstract may not contain data items (Cell Press rule). Example: "{example}"',
  },
  target_forbids_data: {
    tr: '{publisher} bu görselde sonuç/sayı gösterilmesine izin vermiyor. Örnek: "{example}"',
    en: '{publisher} does not allow results or numbers in this graphic. Example: "{example}"',
  },
  mode_not_allowed_for_target: {
    tr: '{publisher} için "{mode}" modu uygun değil.',
    en: 'Mode "{mode}" is not appropriate for {publisher}.',
  },
  visual_missing_study_design: {
    tr: 'Çalışma deseni belirtilmemiş — yayımlanmış görsel özetlerin %64\'ünde eksik olan bilgi.',
    en: 'The study design is not stated — the field missing from 64% of published visual abstracts.',
  },
  visual_missing_sample_size: {
    tr: 'Örneklem büyüklüğü belirtilmemiş.',
    en: 'The sample size is not stated.',
  },
  visual_missing_outcome: {
    tr: 'Birincil sonuç gösterilmemiş.',
    en: 'The primary outcome is not shown.',
  },
  title_contains_heading: {
    tr: 'Görselin içinde "Grafiksel Özet" ifadesi olamaz (MDPI/Elsevier).',
    en: 'The image must not contain the words "Graphical Abstract" (MDPI/Elsevier).',
  },
  unknown_figure_id: {
    tr: 'Var olmayan simge: "{id}". Bu simge sessizce düşer, panel simgesiz kalır.',
    en: 'Figure id "{id}" does not exist. It is dropped silently, leaving the panel without an icon.',
  },
  no_figures: {
    tr: 'Hiç simge kullanılmamış.',
    en: 'No icons are used.',
  },
  field_not_allowed_in_mode: {
    tr: '"{field}" alanı "{mode}" modunda kullanılamaz.',
    en: 'Field "{field}" is not allowed in "{mode}" mode.',
  },
  font_below_publisher_floor: {
    tr: 'Yazı {pt} pt — {publisher} en az {min} pt istiyor.',
    en: 'Text is {pt} pt; {publisher} requires at least {min} pt.',
  },
  palette_outside_okabe_ito: {
    tr: '{count} renk renk körlüğüne uygun paletin dışında (ör. {example}).',
    en: '{count} colours fall outside the colourblind-safe palette (e.g. {example}).',
  },
  red_green_pair: {
    tr: 'Kırmızı ({red}) ve yeşil ({green}) birlikte kullanılmış — döteranopide ayırt edilemez.',
    en: 'Red ({red}) and green ({green}) are paired — indistinguishable under deuteranopia.',
  },
  low_contrast: {
    tr: 'Kontrast {ratio}:1 — erişilebilirlik için en az {min}:1 gerekir.',
    en: 'Contrast is {ratio}:1; accessibility requires at least {min}:1.',
  },
  ai_policy_prohibited: {
    tr: '{publisher} yayınlarında yapay zeka görsellerine izin vermiyor. Bu düzen bir model tarafından taslaklandı — göndermeden önce derginin kurallarını kontrol edin.',
    en: '{publisher} does not allow AI imagery in its publications. This layout was drafted by a model — check the journal\'s policy before submitting.',
  },
  ai_policy_restricted: {
    tr: '{publisher} bu grafik türünde yapay zeka görsellerini kısıtlıyor. Beyan metnini makaleye ekleyin.',
    en: '{publisher} restricts AI imagery in this kind of graphic. Include the disclosure in your manuscript.',
  },
  duplicates_existing_figure: {
    tr: '{publisher} makaledeki bir şeklin tekrarına izin vermiyor; "{caption}" ile örtüşüyor.',
    en: '{publisher} does not allow reusing a figure from the paper; this overlaps "{caption}".',
  },
  label_too_long_for_panel: {
    tr: 'Panel başlığı {length} karakter; {max} karakterden uzun başlık komşu panelin üstüne taşar.',
    en: 'Panel label is {length} characters; over {max} it overflows onto the next panel.',
  },
  text_too_long_for_panel: {
    tr: 'Metin {length} karakter; bu sütunda {max} karakterden uzunu taşar.',
    en: 'Text is {length} characters; over {max} it overflows this column.',
  },
};

function issueText(issue: GaIssue, lang: 'tr' | 'en'): string {
  const template = ISSUE_TEXT[issue.code]?.[lang] ?? issue.code;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(issue.params?.[key] ?? `{${key}}`));
}

export function GraphicalAbstractPanel({
  lang,
  manuscript,
  existingAssetNames,
  onSaveArtifacts,
  onInsertFigure,
  onDisclosure,
  onClose,
}: GraphicalAbstractPanelProps): JSX.Element {
  const tr = lang === 'tr';
  const [targetId, setTargetId] = useState('generic-wide');
  const target = getTarget(targetId)!;
  const [mode, setMode] = useState<GaMode>(target.defaultMode);
  const [busy, setBusy] = useState<'idle' | 'authoring' | 'rendering'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [specText, setSpecText] = useState('');
  const [preview, setPreview] = useState<{ svg?: string; png?: string }>({});
  const [flowUp, setFlowUp] = useState<boolean | null>(null);
  const [armsConfirmed, setArmsConfirmed] = useState(false);

  // Gate the render button up front rather than after a 20-second hang.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/flow/health')
      .then((r) => r.json())
      .then((d) => !cancelled && setFlowUp(Boolean(d.up)))
      .catch(() => !cancelled && setFlowUp(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Changing journal re-defaults the type. Carrying the old choice over is worse than it
  // sounds: picking Cell Press forces "graphical" (it forbids data), and switching to a
  // clinical journal afterwards would silently leave a trial being summarised with no
  // numbers in it.
  useEffect(() => {
    setMode(target.defaultMode);
  }, [target]);

  const parsedSpec = useMemo(() => {
    if (!specText.trim()) return null;
    try {
      return JSON.parse(specText) as unknown;
    } catch {
      return undefined; // undefined = present but unparseable
    }
  }, [specText]);

  const render = useCallback(
    async (spec: unknown, format: 'svg' | 'png'): Promise<string | null> => {
      const res = await fetch('/api/flow/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec, format, pad: 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Render failed');
        if (Array.isArray(data?.issues)) setError(`${data.error}\n${data.issues.join('\n')}`);
        return null;
      }
      return data.dataUrl as string;
    },
    [],
  );

  async function generate(): Promise<void> {
    setBusy('authoring');
    setError('');
    setResult(null);
    setPreview({});
    setArmsConfirmed(false);
    try {
      const res = await fetch('/api/ai/graphical-abstract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, targetId, lang, ...manuscript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError([data?.error, ...(data?.issues ?? [])].filter(Boolean).join('\n'));
        return;
      }
      const generated = data as GenerateResult;
      setResult(generated);
      setSpecText(JSON.stringify(generated.spec, null, 2));
      setBusy('rendering');
      const svg = await render(generated.spec, 'svg');
      if (svg) setPreview({ svg });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  }

  async function rerender(): Promise<void> {
    if (!parsedSpec) {
      setError(tr ? 'JSON geçersiz.' : 'The JSON is not valid.');
      return;
    }
    setBusy('rendering');
    setError('');
    try {
      const svg = await render(parsedSpec, 'svg');
      if (svg) setPreview({ svg });
    } finally {
      setBusy('idle');
    }
  }

  async function insert(): Promise<void> {
    if (!parsedSpec) return;
    setBusy('rendering');
    setError('');
    try {
      // PNG, not SVG: DOCX export drops SVG images silently (lib/docx/ooxml.ts), so an
      // SVG figure would look fine in the editor and vanish from the submitted file.
      const png = await render(parsedSpec, 'png');
      if (!png) return;
      setPreview((p) => ({ ...p, png }));
      const base = nextGaBaseName(existingAssetNames);
      await onSaveArtifacts({ base, pngDataUrl: png, specJson: JSON.stringify(parsedSpec) });
      await onInsertFigure(png, tr ? 'Grafiksel özet' : 'Graphical abstract');
      if (result) onDisclosure(result.disclosure);
    } finally {
      setBusy('idle');
    }
  }

  function editInFlow(): void {
    if (!parsedSpec) return;
    const base = process.env.NEXT_PUBLIC_FLOW_APP_URL || 'http://127.0.0.1:8899';
    const json = JSON.stringify(parsedSpec);
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    // The spec goes in the fragment, never the query: it carries the manuscript's numbers,
    // and a fragment is not sent to a server, logged, or put in a Referer header.
    const url = `${base}/index.html?embed=1&origin=${encodeURIComponent(window.location.origin)}#spec=${b64}`;
    window.open(url, '_blank', 'noopener');
  }

  const errors = result?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = result?.issues.filter((i) => i.severity === 'warning') ?? [];
  const needsArmConfirm = (result?.armWarnings.length ?? 0) > 0 || mode === 'visual';
  const canInsert =
    Boolean(result) &&
    parsedSpec != null &&
    errors.length === 0 &&
    (result?.ungrounded.length ?? 0) === 0 &&
    (!needsArmConfirm || armsConfirmed) &&
    busy === 'idle';

  return (
    <div className="card h-full flex flex-col bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-sm font-bold text-primary">
          🖼️ {tr ? 'Grafiksel Özet' : 'Graphical Abstract'}
        </h3>
        <button onClick={onClose} className="text-secondary hover:text-primary text-lg leading-none px-1">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        {/* ── setup ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-secondary">{tr ? 'Dergi' : 'Journal'}</span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="border border-border rounded px-2 py-1 bg-white"
            >
              {GA_TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.publisher}
                  {t.id === 'wiley-banner' ? ' (110×20 mm)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-secondary">{tr ? 'Tür' : 'Type'}</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as GaMode)}
              className="border border-border rounded px-2 py-1 bg-white"
            >
              <option value="graphical">{tr ? 'Grafiksel (mekanizma)' : 'Graphical (mechanism)'}</option>
              <option value="visual" disabled={!target.allowsDataItems}>
                {tr ? 'Görsel özet (sayılar)' : 'Visual abstract (numbers)'}
              </option>
            </select>
          </label>
        </div>

        <p className="text-[10px] text-muted leading-relaxed">
          {exportSize(target).w}×{exportSize(target).h} px · {tr ? 'en fazla' : 'up to'}{' '}
          {maxPanelsForTarget(target)} {tr ? 'panel' : 'panels'}
          {target.note ? ` · ${target.note}` : ''}
        </p>

        {!target.allowsDataItems && (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            {tr
              ? `${target.publisher} bu görselde sayı gösterilmesine izin vermiyor, bu yüzden yalnızca mekanizma anlatan grafiksel özet üretilebilir.`
              : `${target.publisher} does not allow numbers in this graphic, so only a mechanism-style graphical abstract can be produced.`}
          </p>
        )}

        {flowUp === false && (
          <p className="text-[10px] text-red bg-red-50 border border-red-200 rounded p-2">
            {tr
              ? 'AcademicFlow render sunucusu çalışmıyor — flow-app dizininde `npm run serve` çalıştırın. Tanım yine de üretilebilir ve "Flow\'da düzenle" çalışır.'
              : 'The AcademicFlow render server is not running — start it with `npm run serve` in the flow-app repo. The spec can still be generated, and "Edit in Flow" still works.'}
          </p>
        )}

        <button
          onClick={generate}
          disabled={busy !== 'idle'}
          className="w-full bg-teal text-white rounded px-3 py-2 text-xs font-semibold hover:bg-teal-dark disabled:opacity-50"
        >
          {busy === 'authoring'
            ? tr ? 'Üretiliyor… (1 dakika sürebilir)' : 'Generating… (may take a minute)'
            : busy === 'rendering'
              ? tr ? 'Çiziliyor…' : 'Rendering…'
              : tr ? '✨ Makaleden üret' : '✨ Generate from manuscript'}
        </button>

        {error && (
          <pre className="text-[10px] text-red bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap">
            {error}
          </pre>
        )}

        {/* ── findings ──────────────────────────────────────────────── */}
        {result && (
          <>
            {result.repaired && (
              <p className="text-[10px] text-secondary">
                {tr
                  ? 'Model, kaynakta bulunmayan sayılar için bir kez düzeltildi.'
                  : 'The model was corrected once for numbers not found in the source.'}
              </p>
            )}

            {result.ungrounded.length > 0 && (
              <div className="border border-red-300 bg-red-50 rounded p-2 space-y-1">
                <p className="font-bold text-red text-[11px]">
                  {tr ? 'Makalede bulunmayan sayılar' : 'Numbers not found in the manuscript'}
                </p>
                {result.ungrounded.map((u) => (
                  <p key={`${u.path}-${u.raw}`} className="text-[10px] text-red-800">
                    <code className="font-semibold">{u.raw}</code> — {u.path}
                  </p>
                ))}
                <p className="text-[10px] text-red-800">
                  {tr
                    ? 'Bu sayıları JSON alanında düzeltin; doğrulanmadan ekleme yapılamaz.'
                    : 'Correct these in the JSON below; the figure cannot be inserted until they check out.'}
                </p>
              </div>
            )}

            {result.armWarnings.length > 0 && (
              <div className="border border-amber-300 bg-amber-50 rounded p-2 space-y-1">
                <p className="font-bold text-amber-800 text-[11px]">
                  {tr ? 'Kol etiketleri ters olabilir' : 'The arm labels may be transposed'}
                </p>
                {result.armWarnings.map((w) => (
                  <p key={`${w.path}-${w.raw}`} className="text-[10px] text-amber-900">
                    <strong>{w.label}</strong> → {w.raw} · {tr ? 'kaynak' : 'source'}: “{w.sentence}”
                  </p>
                ))}
              </div>
            )}

            {errors.map((i, n) => (
              <p key={`e${n}`} className="text-[10px] text-red bg-red-50 border border-red-200 rounded p-2">
                {issueText(i, lang)}
                {i.path ? ` (${i.path})` : ''}
              </p>
            ))}
            {warnings.map((i, n) => (
              <p key={`w${n}`} className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                {issueText(i, lang)}
                {i.path ? ` (${i.path})` : ''}
              </p>
            ))}

            {preview.svg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.svg}
                alt={tr ? 'Grafiksel özet önizlemesi' : 'Graphical abstract preview'}
                className="w-full border border-border rounded bg-white"
              />
            )}

            {/* ── the recovery path: edit the spec by hand ───────────── */}
            <details>
              <summary className="cursor-pointer text-[11px] font-semibold text-secondary">
                {tr ? 'Tanımı düzenle (JSON)' : 'Edit the spec (JSON)'}
              </summary>
              <textarea
                value={specText}
                onChange={(e) => setSpecText(e.target.value)}
                spellCheck={false}
                rows={14}
                className="w-full mt-1 border border-border rounded p-2 font-mono text-[10px] leading-snug"
              />
              {parsedSpec === undefined && (
                <p className="text-[10px] text-red">{tr ? 'JSON geçersiz.' : 'Invalid JSON.'}</p>
              )}
              <button
                onClick={rerender}
                disabled={busy !== 'idle' || parsedSpec == null}
                className="mt-1 border border-border rounded px-2 py-1 text-[11px] font-semibold hover:border-teal hover:text-teal disabled:opacity-50"
              >
                {tr ? '↻ Yeniden çiz' : '↻ Re-render'}
              </button>
            </details>

            {needsArmConfirm && (
              <label className="flex items-start gap-2 text-[10px] text-primary bg-slate-50 border border-border rounded p-2">
                <input
                  type="checkbox"
                  checked={armsConfirmed}
                  onChange={(e) => setArmsConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {tr
                    ? 'Grup etiketlerini ve sayıları makale metniyle karşılaştırdım. (Kolların yer değiştirmesi, hiçbir otomatik denetimin yakalayamayacağı bir hatadır — bir dergi bu nedenle düzeltme yayımlamıştır.)'
                    : 'I checked the group labels and numbers against the manuscript. (Transposed arms are a failure no automatic check can catch — a journal has published a correction for exactly this.)'}
                </span>
              </label>
            )}

            <div className="flex gap-2">
              <button
                onClick={insert}
                disabled={!canInsert}
                title={
                  canInsert
                    ? undefined
                    : tr
                      ? 'Önce sorunları giderin ve onay kutusunu işaretleyin.'
                      : 'Resolve the issues and tick the confirmation first.'
                }
                className="flex-1 bg-teal text-white rounded px-3 py-2 text-xs font-semibold hover:bg-teal-dark disabled:opacity-50"
              >
                {tr ? 'Makaleye ekle (PNG)' : 'Insert into manuscript (PNG)'}
              </button>
              <button
                onClick={editInFlow}
                disabled={parsedSpec == null}
                className="border border-border rounded px-3 py-2 text-xs font-semibold hover:border-teal hover:text-teal disabled:opacity-50"
              >
                {tr ? 'Flow’da düzenle' : 'Edit in Flow'}
              </button>
            </div>

            <details>
              <summary className="cursor-pointer text-[11px] font-semibold text-secondary">
                {tr ? 'Yapay zeka beyanı (makaleye eklenmeli)' : 'AI disclosure (add this to your manuscript)'}
              </summary>
              <p className="mt-1 text-[10px] text-primary bg-slate-50 border border-border rounded p-2 leading-relaxed">
                {result.disclosure}
              </p>
            </details>

            <p className="text-[10px] text-muted">
              {tr ? 'Kullanılan bölümler: ' : 'Sections used: '}
              {result.manuscript.included.join(', ')}
              {result.manuscript.truncated ? (tr ? ' (kısaltıldı)' : ' (truncated)') : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export { gaImageFilename, gaSpecFilename };
