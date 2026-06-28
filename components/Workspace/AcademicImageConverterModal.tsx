'use client';

import { useState } from 'react';
import type { ProjectAsset } from '@/store/types';
import {
  convertAcademicImage,
  type AcademicImageFormat,
  type AcademicImageResult,
} from '@/lib/image/academic-converter';

type Props = {
  asset: ProjectAsset;
  onClose: () => void;
  onSave: (result: AcademicImageResult) => Promise<void>;
};

const presets: Array<{ label: string; format: AcademicImageFormat; dpi: number; quality: number; tag: string }> = [
  { label: 'Elsevier', format: 'tiff', dpi: 300, quality: 0.92, tag: 'Photo' },
  { label: 'Nature / Springer', format: 'tiff', dpi: 300, quality: 0.92, tag: 'Photo' },
  { label: 'Wiley', format: 'tiff', dpi: 300, quality: 0.92, tag: 'Photo' },
  { label: 'IEEE', format: 'tiff', dpi: 600, quality: 0.92, tag: 'Line art' },
  { label: 'Taylor & Francis', format: 'tiff', dpi: 600, quality: 0.92, tag: 'Combo' },
  { label: 'ACS', format: 'tiff', dpi: 600, quality: 0.92, tag: 'Line art' },
  { label: 'High Res', format: 'tiff', dpi: 1200, quality: 0.92, tag: 'Line art' },
];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function dpiHint(dpi: number): string {
  if (dpi <= 300) return 'Halftone / color photos';
  if (dpi <= 600) return 'Combination figures & line art';
  return 'High-res line art, graphs, charts, text';
}

export function AcademicImageConverterModal({ asset, onClose, onSave }: Props) {
  const [format, setFormat] = useState<AcademicImageFormat>('tiff');
  const [dpi, setDpi] = useState(300);
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AcademicImageResult | null>(null);

  const convert = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const next = await convertAcademicImage(asset.dataUrl, asset.name, asset.type, {
        format,
        dpi,
        quality,
      });
      setResult(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Görsel dönüştürülemedi');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(result);
      onClose();
    } catch {
      setError('Çıktı havuza eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-white shadow-xl max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-base font-extrabold text-primary">Akademik Görsel Dönüştürücü</h2>
            <p className="mt-1 text-xs text-muted">
              {asset.name} · {formatBytes(asset.size)}
            </p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-muted hover:text-primary">×</button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.dataUrl}
              alt=""
              className="max-h-56 w-full rounded-lg border border-border bg-slate-50 object-contain"
            />
            <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-700">
              Local işlem. Dosya sunucuya gönderilmez.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted">Journal preset</label>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setFormat(preset.format);
                      setDpi(preset.dpi);
                      setQuality(preset.quality);
                    }}
                    className="rounded-lg border border-border bg-white p-2 text-left text-xs hover:border-teal hover:bg-teal-bg"
                  >
                    <span className="block font-bold text-primary">{preset.label}</span>
                    <span className="text-[10px] text-muted">{preset.format.toUpperCase()} · {preset.dpi} DPI · {preset.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-secondary">
                Format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as AcademicImageFormat)}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-2 text-xs text-primary"
                >
                  <option value="tiff">TIFF</option>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WEBP</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-secondary">
                Target DPI
                <input
                  type="number"
                  min={72}
                  max={1200}
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value) || 300)}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-2 text-xs text-primary"
                />
              </label>
              <label className="text-xs font-semibold text-secondary">
                Quality
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={Math.round(quality * 100)}
                  disabled={format === 'tiff' || format === 'png'}
                  onChange={(e) => setQuality((Number(e.target.value) || 92) / 100)}
                  className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-2 text-xs text-primary disabled:opacity-50"
                />
              </label>
            </div>

            <p className="rounded-lg border border-border bg-slate-50 p-2 text-[11px] text-muted">
              {dpiHint(dpi)}
            </p>

            {error && <p className="rounded-lg border border-red-200 bg-red-bg p-2 text-xs font-semibold text-red">{error}</p>}

            {result && (
              <div className="rounded-lg border border-border bg-slate-50 p-3 text-xs text-secondary">
                <div className="font-bold text-primary">{result.filename}</div>
                <div className="mt-1">
                  {result.width} × {result.height} px · {formatBytes(result.blob.size)}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void convert()} disabled={busy} className="btn-primary text-xs">
                {busy ? 'Dönüştürülüyor...' : 'Dönüştür'}
              </button>
              <button type="button" onClick={() => void save()} disabled={!result || busy} className="btn-secondary text-xs">
                Havuza Ekle
              </button>
              <button type="button" onClick={onClose} className="btn-secondary text-xs">
                Kapat
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
