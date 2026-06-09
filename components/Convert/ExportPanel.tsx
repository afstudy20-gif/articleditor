'use client';

import { useState } from 'react';
import type { Ref, MarkerOccurrence } from '@/store/types';
import { buildDocx } from '@/lib/docx/build';
import { refsToRis } from '@/lib/refs/ris';
import { STYLE_LABELS, type CitationStyle } from '@/lib/refs/styles';

type Props = {
  bodyText: string;
  refs: Ref[];
  markers: MarkerOccurrence[];
};

export function ExportPanel({ bodyText, refs, markers }: Props) {
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
        `article-editor-${style}-${mode === 'active' ? 'aktif' : 'placeholder'}.docx`,
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadRis() {
    const text = refsToRis(refs);
    const blob = new Blob([text], { type: 'application/x-research-info-systems' });
    triggerDownload(blob, 'article-editor.ris');
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-primary mb-3">Çıktı</h3>
      <div className="mb-4">
        <label className="tool-label block mb-1.5">Atıf / kaynakça stili</label>
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
          Vancouver/AMA/IEEE numaralı `[N]`, APA yazar-yıl `(Smith, 2020)` formatı kullanır.
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
          <div className="font-semibold text-sm text-primary">Aktif EndNote alanı</div>
          <div className="text-xs text-muted mt-1">
            ADDIN EN.CITE alan kodu. Word'de açar açmaz EndNote tanır.
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
          <div className="font-semibold text-sm text-primary">Placeholder formatı</div>
          <div className="text-xs text-muted mt-1">
            {`{Yazar, Yıl #Rec}`} biçimi. EndNote "Update Citations" gerektirir.
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
          Sürekli satır numaraları ekle (Continuous line numbers)
        </label>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary" onClick={downloadDocx} disabled={busy || refs.length === 0}>
          {busy ? 'Hazırlanıyor…' : '.docx indir'}
        </button>
        <button className="btn-secondary" onClick={downloadRis} disabled={refs.length === 0}>
          .ris indir
        </button>
      </div>
      <p className="text-xs text-muted mt-3 leading-relaxed">
        İş akışı: RIS dosyasını EndNote kütüphanene import et (File → Import). Sonra .docx'i Word'de aç. EndNote CWYW
        otomatik tanıyacak — araya yeni atıf ekleyince numaralar otomatik kayar.
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
