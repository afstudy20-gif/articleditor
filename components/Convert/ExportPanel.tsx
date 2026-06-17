'use client';

import { useState } from 'react';
import type { Ref, MarkerOccurrence } from '@/store/types';
import { buildDocx } from '@/lib/docx/build';
import { refsToRis } from '@/lib/refs/ris';
import { STYLE_LABELS, type CitationStyle } from '@/lib/refs/styles';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  bodyText: string;
  refs: Ref[];
  markers: MarkerOccurrence[];
};

export function ExportPanel({ bodyText, refs, markers }: Props) {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const [mode, setMode] = useState<'active' | 'placeholder'>('active');
  const [style, setStyle] = useState<CitationStyle>('vancouver');
  const [busy, setBusy] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(false);

  async function downloadDocx() {
    setBusy(true);
    try {
      const blob = await buildDocx({ bodyText, refs, markers, mode, style, lineNumbers });
      triggerDownload(
        blob,
        `arted-${style}-${mode === 'active' ? 'aktif' : 'placeholder'}.docx`,
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadRis() {
    const text = refsToRis(refs);
    const blob = new Blob([text], { type: 'application/x-research-info-systems' });
    triggerDownload(blob, 'arted.ris');
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-primary mb-3">{tr ? 'Çıktı' : 'Export'}</h3>
      <div className="mb-4">
        <label className="tool-label block mb-1.5">{tr ? 'Atıf / kaynakça stili' : 'Citation / bibliography style'}</label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as CitationStyle)}
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-teal"
        >
          {(Object.keys(STYLE_LABELS) as CitationStyle[]).map((s) => (
            <option key={s} value={s}>
              {STYLE_LABELS[s]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1.5">
          {tr
            ? 'Vancouver/AMA/IEEE ve MDPI ACS numaralı; APA, MDPI APA ve MDPI Chicago yazar-yıl formatı kullanır.'
            : 'Vancouver/AMA/IEEE and MDPI ACS are numeric; APA, MDPI APA and MDPI Chicago use author–year format.'}
        </p>
      </div>
      <div className="flex gap-2 mb-4">
        <label className={`flex-1 border rounded-lg p-3 cursor-pointer ${mode === 'active' ? 'border-teal bg-teal-bg' : 'border-border'}`}>
          <input
            type="radio"
            name="mode"
            className="sr-only"
            checked={mode === 'active'}
            onChange={() => setMode('active')}
          />
          <div className="font-semibold text-sm text-primary">{tr ? 'Aktif EndNote alanı' : 'Active EndNote field'}</div>
          <div className="text-xs text-muted mt-1">
            {tr
              ? "ADDIN EN.CITE alan kodu. Word'de açar açmaz EndNote tanır."
              : 'ADDIN EN.CITE field code. EndNote recognizes it as soon as you open the file in Word.'}
          </div>
        </label>
        <label className={`flex-1 border rounded-lg p-3 cursor-pointer ${mode === 'placeholder' ? 'border-teal bg-teal-bg' : 'border-border'}`}>
          <input
            type="radio"
            name="mode"
            className="sr-only"
            checked={mode === 'placeholder'}
            onChange={() => setMode('placeholder')}
          />
          <div className="font-semibold text-sm text-primary">{tr ? 'Placeholder formatı' : 'Placeholder format'}</div>
          <div className="text-xs text-muted mt-1">
            {tr
              ? `{Yazar, Yıl #Rec} biçimi. EndNote "Update Citations" gerektirir.`
              : `{Author, Year #Rec} form. Requires EndNote "Update Citations".`}
          </div>
        </label>
      </div>
      <div className="mb-4">
        <label className="flex items-center gap-2 text-xs font-semibold text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={lineNumbers}
            onChange={(e) => setLineNumbers(e.target.checked)}
            className="rounded border-border text-teal focus:ring-teal"
          />
          {tr ? 'Sürekli satır numaraları ekle' : 'Add continuous line numbers'}
        </label>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary" onClick={downloadDocx} disabled={busy || refs.length === 0}>
          {busy ? (tr ? 'Hazırlanıyor…' : 'Preparing…') : (tr ? '.docx indir' : 'Download .docx')}
        </button>
        <button className="btn-secondary" onClick={downloadRis} disabled={refs.length === 0}>
          {tr ? '.ris indir' : 'Download .ris'}
        </button>
      </div>
      <p className="text-xs text-muted mt-3 leading-relaxed">
        {tr
          ? "İş akışı: RIS dosyasını EndNote kütüphanene import et (File → Import). Sonra .docx'i Word'de aç. EndNote CWYW otomatik tanıyacak — araya yeni atıf ekleyince numaralar otomatik kayar."
          : 'Workflow: import the RIS file into your EndNote library (File → Import), then open the .docx in Word. EndNote CWYW recognizes it automatically — inserting a new citation reflows the numbers.'}
      </p>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
